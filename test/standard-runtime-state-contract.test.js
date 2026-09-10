import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareResearchJob } from '../src/prepare.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';
import { initializeStandardRuntime, inspectStandardRuntime, dispatchNextStandard } from '../src/standard-runtime.js';

async function setup(t) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'cra-state-contract-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'output'); await fs.mkdir(outputRoot);
  const prepared = await prepareResearchJob({ outputRoot, request: {
    question: 'Explain tidal locking.', mode: 'standard', template_id: 'research-question',
    template_version: '1.0.0', model_family: 'gpt-5.6-pro', effort: 'standard'
  }, templatesRoot: new URL('../templates/', import.meta.url).pathname });
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };
  const args = { outputRoot, jobId: prepared.job_id, runtime, requestKey: 'original-key' };
  const receipt = await submitPreparedJobOnce(args);
  return { root, runtime, args, receipt, path: join(runtimeRoot, 'runtime-state.json') };
}

test('inspect and dispatch require the caller expected epoch', async t => {
  const s = await setup(t);
  await assert.rejects(inspectStandardRuntime({ runtime: { root: s.runtime.root } }));
  await assert.rejects(dispatchNextStandard({ runtime: { root: s.runtime.root }, context: {} }));
});

test('lost or redirected request-key history is unavailable, never a new admission', async t => {
  const s = await setup(t); const original = JSON.parse(await fs.readFile(s.path, 'utf8'));
  for (const key_map of [{}, { 'original-key': 'missing-op' }]) {
    await fs.writeFile(s.path, JSON.stringify({ ...original, key_map }));
    await assert.rejects(inspectStandardRuntime({ runtime: s.runtime }), { code: 'ERR_RUNTIME_HISTORY_UNAVAILABLE' });
    await assert.rejects(submitPreparedJobOnce(s.args), { code: 'ERR_RUNTIME_HISTORY_UNAVAILABLE' });
  }
});

test('two copies of immutable intent and phase/effect meaning must agree', async t => {
  const s = await setup(t); const original = JSON.parse(await fs.readFile(s.path, 'utf8'));
  const ref = s.receipt.operation_ref;
  const cases = [
    state => { state.intents[ref].prompt = 'changed content'; },
    state => { state.operations[ref].submission_effect = 'accepted'; },
    state => { state.operations[ref].priority = 'invented'; },
    state => { state.operations[ref].request_key = 'different-key'; }
  ];
  for (const corrupt of cases) {
    const state = structuredClone(original); corrupt(state); await fs.writeFile(s.path, JSON.stringify(state));
    await assert.rejects(inspectStandardRuntime({ runtime: s.runtime }), { code: 'ERR_RUNTIME_HISTORY_UNAVAILABLE' });
  }
});

test('effect owner replacement during marker publication prevents the send', async t => {
  const s = await setup(t); let sends = 0; let replaced = false; let current = 10000;
  const originalOpen = fs.open;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if ((await handle.stat()).isDirectory()) {
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        await sync();
        if (!replaced) {
          // Fault injection at this implementation's named owner file; the assertion is no stale-owner effect.
          await fs.unlink(join(s.runtime.root, 'effect.lock'));
          await fs.writeFile(join(s.runtime.root, 'effect.lock'), 'foreign-owner');
          replaced = true;
        }
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(dispatchNextStandard({ runtime: s.runtime, context: {
      authorize: () => true, deliveryReady: () => true, random: () => 0,
      clock: { now: () => current, sleep: async ms => { current += ms; } }
    }, driver: {
      prepare: async () => ({ status: 'ready', target: 't', evidenceRef: 'p' }),
      send: async () => { sends++; return { status: 'accepted', binding: { conversationId: 'c', userMessageId: 'u' }, evidenceRef: 's' }; }
    } }));
    assert.equal(replaced, true); assert.equal(sends, 0);
    assert.equal(await fs.readFile(join(s.runtime.root, 'effect.lock'), 'utf8'), 'foreign-owner');
  } finally { fs.open = originalOpen; syncBuiltinESMExports(); }
});
