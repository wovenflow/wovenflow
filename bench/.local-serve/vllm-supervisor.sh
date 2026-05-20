#!/usr/bin/env bash
# Auto-restart supervisor for vLLM serving Qwen3.6-35B-A3B-FP8.
#
# When vLLM crashes (EngineDeadError, OOM, IPC failure, etc.), this loop
# re-launches it. Each in-flight bench trial that hits the crash will see
# an HTTP 5xx / connection-refused; the bench's per-trial try/catch records
# the trial in errors.jsonl and continues to the next one. By the time the
# orchestrator dispatches the next trial, vLLM is usually back up.
#
# Usage:
#   bash bench/.local-serve/vllm-supervisor.sh &   # start
#   touch /tmp/wovenflow-vllm-stop                # stop (gracefully after current vllm exits)
#
# Logs:
#   bench/.local-serve/vllm-supervisor.log  — supervisor lifecycle events
#   bench/.local-serve/vllm-supervised.log  — vLLM's own stdout/stderr (cumulative)

set -u

REPO=/home/will/wovenflow
STOP_FILE=/tmp/wovenflow-vllm-stop
LOG=$REPO/bench/.local-serve/vllm-supervisor.log
VLLM_LOG=$REPO/bench/.local-serve/vllm-supervised.log

cd "$REPO"

# Clear stale stop file from a previous run.
rm -f "$STOP_FILE"

mkdir -p "$REPO/bench/.local-serve"

ts() { date -Iseconds; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

log "supervisor starting, pid=$$"
log "stop with: touch $STOP_FILE"

restart_count=0
while [ ! -f "$STOP_FILE" ]; do
  restart_count=$((restart_count + 1))
  log "starting vllm (attempt #$restart_count)"
  echo "[$(ts)] === vllm start #$restart_count ===" >> "$VLLM_LOG"

  # max-model-len 65536 (64K): full attention only on 10/40 layers, 2 KV heads,
  # bf16 KV → ~10 KB/token. 64K context = ~640 MB KV cache per GPU, well under
  # the ~1.5 GB headroom we measured at 8K. Bump higher (128K, 256K) only after
  # confirming this size runs cleanly.
  #
  # VLLM_ENABLE_V1_MULTIPROCESSING=0: documented mitigation for the V1 multiproc
  # shared-memory IPC bug (https://github.com/vllm-project/vllm/issues/36921 and
  # related) that surfaces as `TimeoutError: RPC call to sample_tokens timed out`
  # under sustained chat-completion load with long single responses (~40K+ output
  # tokens). Disables only the engine-vs-API-server multiproc separation; TP=4
  # workers continue to use multiproc-executor since that's required for tensor
  # parallelism. Cost: minor throughput hit since engine + API server share a
  # process. Worth it to stop the periodic engine deaths the bench was hitting.
  # --enforce-eager was tried as a vLLM-IPC-crash mitigation but added a ~3x
  # per-turn latency tax that pushed trials past the 15-min wall cap. Dropped:
  # the crash is already covered by three cheaper layers —
  #   1. VLLM_ENABLE_V1_MULTIPROCESSING=0 (the documented direct mitigation)
  #   2. client-side max_tokens cap (16384, see openai-compatible.js) — caps the
  #      long single response that actually triggers the IPC heartbeat timeout
  #   3. the provider's vLLM-recovery loop — polls + retries on a mid-trial crash
  # CUDAGraph stays ON for the 3x speedup.
  # 2026-05-20: reverted the --distributed-executor-backend=ray experiment back
  # to vLLM's default (mp). The HTTP 500s / EngineCore deaths it was chasing
  # were not an executor-IPC problem: the bench provider was injecting
  # mid-conversation `role:"system"` recovery breadcrumbs into the model
  # payload, which Qwen3.6's chat template rejects ("System message must be at
  # the beginning"), 500-ing every subsequent request and destabilizing the
  # engine. Fixed harness-side — see
  # doc/specs/2026-05-20-bench-provider-no-midstream-system.spec.md.
  CUDA_VISIBLE_DEVICES=1,2,3,4 \
    VLLM_ENABLE_V1_MULTIPROCESSING=0 \
    python3 -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen3.6-35B-A3B-FP8 \
    --host 127.0.0.1 --port 8000 \
    --tensor-parallel-size 4 \
    --gpu-memory-utilization 0.88 \
    --max-model-len 65536 \
    --enable-auto-tool-choice \
    --tool-call-parser qwen3_coder \
    --reasoning-parser qwen3 \
    >> "$VLLM_LOG" 2>&1
  exit_code=$?

  log "vllm exited (code=$exit_code) after attempt #$restart_count"

  if [ -f "$STOP_FILE" ]; then
    log "stop file detected, exiting supervisor"
    break
  fi

  # Reap orphaned vLLM worker processes. When vLLM's API server exits via
  # EngineDeadError, its multiproc workers (named `VLLM::Worker_TP*` after
  # vLLM renames them via prctl) sometimes survive and continue holding
  # GPU memory. Each held GPU prevents the next launch's memory check from
  # passing. Kill any survivors explicitly.
  orphan_pids=$(pgrep -f 'VLLM::Worker' 2>/dev/null)
  if [ -n "$orphan_pids" ]; then
    log "killing orphaned VLLM::Worker processes: $orphan_pids"
    for p in $orphan_pids; do kill -9 "$p" 2>/dev/null; done
  fi

  # Brief pause before relaunch to let CUDA/IPC clean up.
  log "restarting vllm in 15s..."
  sleep 15
done

log "supervisor exiting after $restart_count vllm launch(es)"
