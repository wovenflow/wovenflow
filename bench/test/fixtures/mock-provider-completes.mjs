// Mock provider for B1 / B3: completes after one turn, declares done, and
// produces a tiny source/ + tests/ tree. The runner imports this module by
// path when dispatchTrial is called with provider.script set.

export async function runTrial({ task_id, system_prompt, user_message, options = {} }) {
  const conversation = [];
  if (system_prompt) {
    conversation.push({ role: 'system', content: system_prompt });
  }
  conversation.push({ role: 'user', content: user_message ?? `Implement ${task_id}.` });
  conversation.push({
    role: 'assistant',
    content: `[mock] producing trivial source + tests for task ${task_id}`,
  });

  // Echo the runner-declared model_id back the way a real provider would
  // surface its API-confirmed model id. This lets B3's test (which sets
  // model_id: 'qwen2.5-coder:32b' on the provider config) verify the
  // round-trip without the mock having to second-guess what was requested.
  return {
    conversation,
    source_files: {
      'index.js': `// Mock-produced source for ${task_id}\nexport function ${task_id}(x) { return x; }\n`,
    },
    test_files: {
      'index.test.js':
        `// Mock-produced tests for ${task_id}\n` +
        `import { test } from 'node:test';\n` +
        `import assert from 'node:assert/strict';\n` +
        `import { ${task_id} } from './index.js';\n` +
        `test('${task_id} is callable', () => assert.equal(typeof ${task_id}, 'function'));\n`,
    },
    tokens_input: 100,
    tokens_output: 50,
    stop_reason: 'done',
    model_id: options.model_id ?? 'mock-completes',
  };
}
