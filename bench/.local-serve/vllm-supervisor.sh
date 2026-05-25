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

  # 2026-05-20: switched from Qwen3.6-35B-A3B-FP8 (MoE) to Qwen3.6-27B-FP8
  # (DENSE). The 35B-A3B repeatedly hung vLLM under sustained bench load: TP
  # workers deadlocked on the shared-memory broadcast channel ("shm_broadcast.py:
  # No available shared memory broadcast block found in 60 seconds" ->
  # "TimeoutError: RPC call to sample_tokens timed out" -> EngineDeadError). It
  # hit both the mp and ray executor backends. Research pinned the fingerprint
  # on FP8 + MoE-routing JIT churn destabilizing the broadcast channel (vllm
  # issues #36921, #41530 — the latter still open at v0.20.2, no fix). A dense
  # model avoids the MoE-routing recompiles (the actual root-cause trigger);
  # the TP worker count is secondary (#41530 reproduced at TP=2 and TP=4). The
  # dense 27B also out-scores the 35B-A3B on coding benchmarks (SWE-bench 77.2
  # vs 73.4, LiveCodeBench 83.9 vs 80.4) and keeps the native qwen3_coder tool
  # parser. The benchmark never pinned a model (PROTOCOL-v2 §3.6 leaves Model
  # ID "TBD", naming Qwen2.5-Coder-14B/32B as candidates), so this is in-scope.
  #
  # TP=4: the FP8 weights are ~29 GB on disk (NOT ~17 GB), so TP=2 OOMs at
  # ~14.5 GB/GPU on 16 GB A4000s. TP=4 splits to ~7.25 GB/GPU, leaving room for
  # CUDA graphs + KV cache at 32K context. VLLM_ENABLE_V1_MULTIPROCESSING=0 kept
  # as a low-cost engine/API-server IPC mitigation. Client-side max_tokens cap
  # (default 4096, env BENCH_MAX_TOKENS) and the provider's vLLM-recovery loop
  # remain in place.
  #
  # --max-num-seqs 16: Qwen3.6-27B is a HYBRID Mamba/linear-attention model
  # (config shows mamba_mixer2 / gdn_attention_core / linear_attention ops).
  # Each decode sequence needs one Mamba state-cache block; vLLM's default
  # max_num_seqs=256 exceeded the ~216 blocks that fit in the available cache
  # ("CUDA graph capture cannot proceed"). The bench fires ONE request at a
  # time, so a high concurrency ceiling is pointless — 16 is ample and frees
  # cache memory.
  #
  # ROOT CAUSE (2026-05-21): the hang is a TRANSPORT problem, not a model
  # problem. The identical signature (shm_broadcast stall -> sample_tokens RPC
  # timeout -> EngineDeadError) appeared across MoE 35B, dense-hybrid 27B, and
  # with the GDN-specific --gdn-prefill-backend triton fix applied. Symptom
  # invariant across architectures => the cause is the TP=4 cross-GPU comms.
  # These A4000s have NO NVLink — TP all-reduce goes over PCIe P2P. IOMMU is ON
  # (AMD-Vi) and ACS was enabled on the AMD GPP bridges, which forces P2P
  # transactions through the root complex / IOMMU and deadlocks NCCL under load
  # (NVIDIA NCCL #2079, our exact AMD-bridge + no-NVLink hardware; NCCL docs
  # name ACS/VT-d as the cause). Forcing socket transport (NCCL_P2P_DISABLE +
  # NCCL_SHM_DISABLE) fully stopped the crashes but dropped throughput to
  # ~15 tok/s (TCP loopback all-reduce).
  #
  # FIX (2026-05-21): ACS disabled at runtime on all PCIe bridges via
  #   sudo bash -c 'for b in $(lspci -D|awk "/PCI bridge/{print \$1}"); do \
  #     setpci -v -s "$b" ECAP_ACS+0x6.w=0000 2>/dev/null; done'
  # (reversible on reboot). With ACS off, direct GPU P2P works, so the socket-
  # fallback flags are REMOVED to restore full speed. --disable-custom-all-reduce
  # kept as a conservative all-reduce path (NCCL all-reduce over now-working
  # P2P); drop it too if more speed is needed. --gdn-prefill-backend triton and
  # --max-num-seqs 16 kept. If the hang ever returns, re-confirm ACS is still
  # off after any reboot (re-run the setpci loop) before re-adding socket flags.
  CUDA_VISIBLE_DEVICES=1,2,3,4 \
    VLLM_ENABLE_V1_MULTIPROCESSING=0 \
    python3 -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen3.6-27B-FP8 \
    --host 127.0.0.1 --port 8000 \
    --tensor-parallel-size 4 \
    --gpu-memory-utilization 0.90 \
    --max-model-len 32768 \
    --max-num-seqs 16 \
    --gdn-prefill-backend triton \
    --disable-custom-all-reduce \
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
