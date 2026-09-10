import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir as nativeTestTmpdir } from 'node:os';
import { realpathSync as canonicalTestPath } from 'node:fs';
const tmpdir = () => canonicalTestPath(nativeTestTmpdir());
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareResearchJob } from '../src/prepare.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';
import { initializeStandardRuntime, inspectStandardRuntime, dispatchNextStandard } from '../src/standard-runtime.js';

const templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url));
test('missing required input is rejected rather than fabricated as a no-op receipt', async () => {
  await assert.rejects(submitPreparedJobOnce());
  await assert.rejects(dispatchNextStandard());
});
async function setup(t) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'cra-integrity-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'output');
  await fs.mkdir(outputRoot);
  const prepared = await prepareResearchJob({ outputRoot, templatesRoot, request: {
    question: 'Describe tidal locking.', mode: 'standard', template_id: 'research-question',
    template_version: '1.0.0', model_family: 'gpt-5.6-pro', effort: 'standard'
  } });
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot });
  return { root, outputRoot, prepared, runtime: { root: runtimeRoot, epoch: init.runtime_epoch } };
}
const admit = (s, requestKey, context) => submitPreparedJobOnce({
  outputRoot: s.outputRoot, jobId: s.prepared.job_id, runtime: s.runtime, requestKey, context
});
function context() {
  let current = 100000;
  return { authorize: () => true, deliveryReady: () => true, random: () => 0,
    clock: { now: () => current, sleep: async ms => { current += ms; } } };
}

test('printable prototype-like request keys remain ordinary durable keys', async t => {
  const s = await setup(t);
  for (const key of ['__proto__', 'constructor', 'toString']) {
    const first = await admit(s, key);
    const duplicate = await admit(s, key);
    assert.equal(first.admission, 'accepted');
    assert.equal(duplicate.operation_ref, first.operation_ref);
  }
  assert.equal((await inspectStandardRuntime({ runtime: s.runtime })).operations.length, 3);
});

test('denied duplicate and non-boolean authorization never admit or reveal prior receipt', async t => {
  const s = await setup(t);
  await admit(s, 'prior');
  await assert.rejects(admit(s, 'prior', { authorize: () => false }));
  await assert.rejects(admit(s, 'promise-denial', { authorize: async () => false }));
  assert.equal((await inspectStandardRuntime({ runtime: s.runtime })).operations.length, 1);
});

test('corrupt occupancy and capacity schema cannot be interpreted as a usable store', async t => {
  const s = await setup(t);
  const path = join(s.runtime.root, 'runtime-state.json');
  const original = JSON.parse(await fs.readFile(path, 'utf8'));
  for (const patch of [{ capacity: 99 }, { reservations: null }, { operations: [] }, { revision: -1 }]) {
    await fs.writeFile(path, JSON.stringify({ ...original, ...patch }));
    await assert.rejects(inspectStandardRuntime({ runtime: s.runtime }), { code: 'ERR_RUNTIME_HISTORY_UNAVAILABLE' });
  }
});

test('a runtime-root symlink is refused by inspection and admission', async t => {
  const s = await setup(t);
  const alias = join(s.root, 'alias');
  await fs.symlink(s.runtime.root, alias);
  const runtime = { ...s.runtime, root: alias };
  await assert.rejects(inspectStandardRuntime({ runtime }));
  await assert.rejects(submitPreparedJobOnce({ outputRoot: s.outputRoot, jobId: s.prepared.job_id, runtime, requestKey: 'alias' }));
  assert.equal((await inspectStandardRuntime({ runtime: s.runtime })).operations.length, 0);
});

test('simultaneous explicit initialization cannot publish two accepted epochs', async t => {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'cra-init-race-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtimeRoot = join(root, 'runtime');
  const outcomes = await Promise.allSettled([
    initializeStandardRuntime({ root: runtimeRoot }), initializeStandardRuntime({ root: runtimeRoot })
  ]);
  const accepted = outcomes.filter(x => x.status === 'fulfilled');
  assert.equal(accepted.length, 1);
  assert.equal((await inspectStandardRuntime({ runtime: { root: runtimeRoot, epoch: accepted[0].value.runtime_epoch } })).occupied, 0);
});

test('directory sync failure cannot produce a successful durable admission receipt', async t => {
  const s = await setup(t);
  const originalOpen = fs.open;
  let injected = 0;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if ((await handle.stat()).isDirectory()) {
      handle.sync = async () => { injected++; throw Object.assign(new Error('injected directory fsync failure'), { code: 'EIO' }); };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(admit(s, 'failed-sync'));
    assert.ok(injected > 0, 'fault must reach an actual directory-sync attempt');
  } finally {
    fs.open = originalOpen;
    syncBuiltinESMExports();
  }
});

test('authorization and delivery are rechecked after preparation and pacing', async t => {
  for (const gate of ['authorize', 'deliveryReady']) {
    const s = await setup(t);
    await admit(s, gate);
    const ctx = context(); let allowed = true; let sends = 0;
    ctx[gate] = () => allowed;
    const driver = {
      prepare: async () => { allowed = false; return { status: 'ready', target: 'target', evidenceRef: 'prep' }; },
      send: async () => { sends++; return { status: 'accepted', binding: { conversationId: 'c', userMessageId: 'u' }, evidenceRef: 'send' }; }
    };
    await dispatchNextStandard({ runtime: s.runtime, context: ctx, driver }).catch(error => {
      assert.match(error.code ?? '', /^ERR_RUNTIME_/);
    });
    assert.equal(sends, 0, `${gate} revoked before send`);
    const state = await inspectStandardRuntime({ runtime: s.runtime });
    assert.equal(state.occupied, 0);
    assert.equal(state.operations[0].submission_effect, 'known_unsent');
  }
});

test('replacing the runtime directory during preparation cannot authorize a send', async t => {
  const s = await setup(t); await admit(s, 'replacement'); let sends = 0;
  const snapshot = await fs.readFile(join(s.runtime.root, 'runtime-state.json'));
  const driver = {
    prepare: async () => {
      await fs.rename(s.runtime.root, join(s.root, 'old-runtime'));
      await fs.mkdir(s.runtime.root);
      await fs.writeFile(join(s.runtime.root, 'runtime-state.json'), snapshot);
      return { status: 'ready', target: 'target', evidenceRef: 'prep' };
    },
    send: async () => { sends++; return { status: 'accepted', binding: { conversationId: 'c', userMessageId: 'u' }, evidenceRef: 'send' }; }
  };
  await assert.rejects(dispatchNextStandard({ runtime: s.runtime, context: context(), driver }));
  assert.equal(sends, 0);
});

test('malformed accepted identifiers retain unknown effect and occupancy', async t => {
  const s = await setup(t); await admit(s, 'malformed-binding');
  await assert.rejects(dispatchNextStandard({ runtime: s.runtime, context: context(), driver: {
    prepare: async () => ({ status: 'ready', target: 't', evidenceRef: 'p' }),
    send: async () => ({ status: 'accepted', binding: { conversationId: 123, userMessageId: ['not-a-string'] }, evidenceRef: 's' })
  } }));
  const state = await inspectStandardRuntime({ runtime: s.runtime });
  assert.equal(state.occupied, 1);
  assert.equal(state.operations[0].submission_effect, 'unknown');
});
