import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { prepareResearchJob } from '../src/prepare.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';

let runtimeModule = null;
try {
  runtimeModule = await import('../src/standard-runtime.js');
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') {
    throw error;
  }
}

const {
  initializeStandardRuntime,
  inspectStandardRuntime,
  dispatchNextStandard,
  recordStandardObservation
} = runtimeModule ?? {};

const templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url));

const baseRequest = {
  question: 'Explain the mechanism of tidal locking.',
  mode: 'standard',
  template_id: 'research-question',
  template_version: '1.0.0',
  model_family: 'gpt-5.6-pro',
  effort: 'standard'
};

async function createWorkspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'standard-runtime-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot, { recursive: true });
  return { root, outputRoot };
}

async function createPreparedJob(outputRoot, overrides = {}) {
  return await prepareResearchJob({
    request: { ...baseRequest, ...overrides },
    outputRoot,
    templatesRoot
  });
}

async function createLoggingExecutable(root) {
  const executable = join(root, 'fake-opencli.cjs');
  const log = join(root, 'invocations.jsonl');
  await writeFile(log, '');
  await writeFile(
    executable,
    `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nprocess.exitCode = 73;\n`
  );
  await chmod(executable, 0o700);
  return { executable, log };
}

const moduleTest = (name, fn) => {
  test(name, { skip: !runtimeModule ? 'requires src/standard-runtime.js implementation' : false }, fn);
};

// ---------------------------------------------------------------------------
// 1. Initial RED test: Admission via existing submitPreparedJobOnce
// ---------------------------------------------------------------------------
test('1. valid prepared v2 with runtime and requestKey enqueues through submitPreparedJobOnce with zero executable calls', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const { executable, log } = await createLoggingExecutable(root);
  const prepared = await createPreparedJob(outputRoot);

  const runtime = runtimeModule
    ? { root: runtimeRoot, epoch: (await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 })).runtime_epoch }
    : { root: runtimeRoot, epoch: 'runtime-epoch-placeholder-1' };

  // On baseline without C1 standard runtime, submitPreparedJobOnce throws ERR_STANDARD_DRIVER_UNQUALIFIED.
  // On GREEN, it admits the v2 job without calling any executable transport.
  const receipt = await submitPreparedJobOnce({
    outputRoot,
    jobId: prepared.job_id,
    runtime,
    requestKey: 'test-admission-key-1',
    openCliPath: executable
  });

  assert.equal(receipt.admission, 'accepted');
  assert.equal(receipt.runtime_epoch, runtime.epoch);
  assert.ok(typeof receipt.operation_ref === 'string' && receipt.operation_ref.length > 0);
  assert.ok(typeof receipt.job_ref === 'string' && receipt.job_ref.length > 0);
  assert.equal(receipt.phase, 'queued');
  assert.equal(receipt.submission_effect, 'known_unsent');
  assert.equal(receipt.revision, 1);

  // Admission must not make any transport or executable calls
  assert.equal(await readFile(log, 'utf8'), '', 'admission must make zero executable transport calls');

  if (runtimeModule) {
    const inspected = await inspectStandardRuntime({ runtime, operationRef: receipt.operation_ref });
    assert.equal(inspected.occupied, 0, 'queued job does not occupy capacity slot');
    assert.equal(inspected.operations.length, 1);
    assert.equal(inspected.operations[0].operation_ref, receipt.operation_ref);
    assert.equal(inspected.operations[0].phase, 'queued');
    assert.equal(inspected.operations[0].submission_effect, 'known_unsent');
  }
});

// ---------------------------------------------------------------------------
// 2. Duplicate key recovery vs intent conflict
// ---------------------------------------------------------------------------
moduleTest('2. duplicate requestKey recovers existing operation or rejects intent conflict', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const jobA = await createPreparedJob(outputRoot, { question: 'Question A for duplicate key test' });
  const reqKey = 'client-idempotency-key-2';

  const receipt1 = await submitPreparedJobOnce({
    outputRoot,
    jobId: jobA.job_id,
    runtime,
    requestKey: reqKey
  });

  assert.equal(receipt1.admission, 'accepted');
  assert.equal(receipt1.runtime_epoch, runtime.epoch);
  assert.ok(receipt1.operation_ref);
  assert.ok(receipt1.job_ref);
  assert.notEqual(receipt1.job_ref, jobA.job_id, 'runtime job_ref must be distinct from source jobId');

  // Same key + identical prepared bundle -> recovery returns existing operation
  const receipt2 = await submitPreparedJobOnce({
    outputRoot,
    jobId: jobA.job_id,
    runtime,
    requestKey: reqKey
  });

  assert.equal(receipt2.admission, 'existing');
  assert.equal(receipt2.operation_ref, receipt1.operation_ref);
  assert.equal(receipt2.job_ref, receipt1.job_ref);
  assert.equal(receipt2.revision, receipt1.revision);

  const inspected1 = await inspectStandardRuntime({ runtime });
  assert.equal(inspected1.operations.length, 1);

  // Same key + different immutable intent -> conflict rejection
  const jobB = await createPreparedJob(outputRoot, { question: 'Different Question B with conflicting intent' });
  await assert.rejects(
    submitPreparedJobOnce({
      outputRoot,
      jobId: jobB.job_id,
      runtime,
      requestKey: reqKey
    }),
    { code: 'ERR_RUNTIME_REQUEST_KEY_CONFLICT' }
  );

  const inspected2 = await inspectStandardRuntime({ runtime });
  assert.equal(inspected2.operations.length, 1, 'conflict rejection must not mutate runtime state');
});

// ---------------------------------------------------------------------------
// 3. Concurrent admission across distinct output roots without lost updates
// ---------------------------------------------------------------------------
moduleTest('3. concurrent admission across distinct output roots succeeds without lost updates', async (t) => {
  const { root } = await createWorkspace(t);
  const outputRoot1 = join(root, 'output-1');
  const outputRoot2 = join(root, 'output-2');
  await mkdir(outputRoot1, { recursive: true });
  await mkdir(outputRoot2, { recursive: true });

  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job1 = await createPreparedJob(outputRoot1, { question: 'Job from root 1' });
  const job2 = await createPreparedJob(outputRoot2, { question: 'Job from root 2' });

  async function admitWithRetry(args, maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await submitPreparedJobOnce(args);
      } catch (err) {
        if (err?.code === 'ERR_RUNTIME_BUSY' && i < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
          continue;
        }
        throw err;
      }
    }
  }

  const [receipt1, receipt2] = await Promise.all([
    admitWithRetry({ outputRoot: outputRoot1, jobId: job1.job_id, runtime, requestKey: 'root1-key' }),
    admitWithRetry({ outputRoot: outputRoot2, jobId: job2.job_id, runtime, requestKey: 'root2-key' })
  ]);

  assert.equal(receipt1.admission, 'accepted');
  assert.equal(receipt2.admission, 'accepted');
  assert.notEqual(receipt1.operation_ref, receipt2.operation_ref);

  const inspected = await inspectStandardRuntime({ runtime });
  assert.equal(inspected.operations.length, 2);
  const opRefs = inspected.operations.map((o) => o.operation_ref);
  assert.ok(opRefs.includes(receipt1.operation_ref));
  assert.ok(opRefs.includes(receipt2.operation_ref));
});

// ---------------------------------------------------------------------------
// 4. Capacity bounds 1-4 and competing last-slot dispatchers
// ---------------------------------------------------------------------------
moduleTest('4. capacity enforcement and competing last-slot dispatchers prevent oversubscription', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 1 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  // Rejects out-of-range capacities (integer 1-4)
  await assert.rejects(
    initializeStandardRuntime({ root: join(root, 'c0'), capacity: 0 }),
    (err) => err?.code?.startsWith('ERR_RUNTIME_')
  );
  await assert.rejects(
    initializeStandardRuntime({ root: join(root, 'c5'), capacity: 5 }),
    (err) => err?.code?.startsWith('ERR_RUNTIME_')
  );

  const job1 = await createPreparedJob(outputRoot, { question: 'Job 1 for slot race' });
  const job2 = await createPreparedJob(outputRoot, { question: 'Job 2 for slot race' });

  await submitPreparedJobOnce({ outputRoot, jobId: job1.job_id, runtime, requestKey: 'slot-job-1' });
  await submitPreparedJobOnce({ outputRoot, jobId: job2.job_id, runtime, requestKey: 'slot-job-2' });

  let concurrentSends = 0;
  let maxConcurrentSends = 0;
  const slowDriver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-1', evidenceRef: 'ev-prep' }),
    send: async (op) => {
      concurrentSends++;
      maxConcurrentSends = Math.max(maxConcurrentSends, concurrentSends);
      await new Promise((resolve) => setTimeout(resolve, 40));
      concurrentSends--;
      return {
        status: 'accepted',
        binding: { conversationId: `conv-${op.operation_ref}`, userMessageId: 'msg-1' },
        evidenceRef: 'ev-send'
      };
    }
  };

  const fakeClock = { now: () => 1000000, sleep: async () => {} };
  const context = { authorize: () => true, deliveryReady: () => true, clock: fakeClock, random: () => 0 };

  const [res1, res2] = await Promise.all([
    dispatchNextStandard({ runtime, context, driver: slowDriver }),
    dispatchNextStandard({ runtime, context, driver: slowDriver })
  ]);

  assert.equal(maxConcurrentSends, 1, 'shared effect mutex must prevent overlapping sends');
  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(statuses, ['dispatched', 'idle'], 'one worker dispatches, competing worker sees capacity full and reports idle');

  const inspected = await inspectStandardRuntime({ runtime });
  assert.equal(inspected.occupied, 1, 'capacity 1 allows exactly 1 occupied slot');
});

// ---------------------------------------------------------------------------
// 5. State inspection inside send proves unknown marker persisted
// ---------------------------------------------------------------------------
moduleTest('5. state inspection inside send proves unknown marker and slot reservation persisted', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 2 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job = await createPreparedJob(outputRoot, { question: 'Test unknown persistence' });
  const receipt = await submitPreparedJobOnce({ outputRoot, jobId: job.job_id, runtime, requestKey: 'unknown-marker-key' });

  let capturedDuringSend = null;
  const verifyingDriver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-verify', evidenceRef: 'ev-prep' }),
    send: async (op) => {
      // Must have persisted slot reservation and unknown effect before remote send callback
      capturedDuringSend = await inspectStandardRuntime({ runtime, operationRef: op.operation_ref });
      return {
        status: 'accepted',
        binding: { conversationId: 'conv-persistent-1', userMessageId: 'msg-persistent-1' },
        evidenceRef: 'ev-send-persistent'
      };
    }
  };

  const fakeClock = { now: () => 2000000, sleep: async () => {} };
  const context = { authorize: () => true, deliveryReady: () => true, clock: fakeClock, random: () => 0 };

  const dispatchRes = await dispatchNextStandard({ runtime, context, driver: verifyingDriver });
  assert.equal(dispatchRes.status, 'dispatched');

  assert.ok(capturedDuringSend, 'send callback must have executed');
  assert.equal(capturedDuringSend.occupied, 1, 'slot must be occupied BEFORE send callback');
  const opDuring = capturedDuringSend.operations.find((o) => o.operation_ref === receipt.operation_ref);
  assert.ok(opDuring);
  assert.equal(opDuring.phase, 'dispatching');
  assert.equal(opDuring.submission_effect, 'unknown', 'submission_effect must be unknown during send');

  const capturedAfter = await inspectStandardRuntime({ runtime, operationRef: receipt.operation_ref });
  assert.equal(capturedAfter.occupied, 1);
  const opAfter = capturedAfter.operations.find((o) => o.operation_ref === receipt.operation_ref);
  assert.equal(opAfter.phase, 'observing');
  assert.equal(opAfter.submission_effect, 'accepted');
  assert.deepEqual(opAfter.binding, { conversationId: 'conv-persistent-1', userMessageId: 'msg-persistent-1' });
});

// ---------------------------------------------------------------------------
// 6. Thrown send remains occupied with unknown effect and never replays
// ---------------------------------------------------------------------------
moduleTest('6. thrown send retains unknown effect and occupancy without replay', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job = await createPreparedJob(outputRoot, { question: 'Test crashing send' });
  const receipt = await submitPreparedJobOnce({ outputRoot, jobId: job.job_id, runtime, requestKey: 'crash-key' });

  let crashingCalls = 0;
  const crashingDriver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-crash', evidenceRef: 'ev-prep' }),
    send: async () => {
      crashingCalls++;
      throw new Error('remote transport failed catastrophically');
    }
  };

  const fakeClock = { now: () => 3000000, sleep: async () => {} };
  const context = { authorize: () => true, deliveryReady: () => true, clock: fakeClock, random: () => 0 };

  await assert.rejects(
    dispatchNextStandard({ runtime, context, driver: crashingDriver }),
    /remote transport failed catastrophically/
  );
  assert.equal(crashingCalls, 1);

  const afterCrash = await inspectStandardRuntime({ runtime, operationRef: receipt.operation_ref });
  assert.equal(afterCrash.occupied, 1, 'slot remains occupied after thrown send');
  const opCrashed = afterCrash.operations.find((o) => o.operation_ref === receipt.operation_ref);
  assert.equal(opCrashed.phase, 'dispatching');
  assert.equal(opCrashed.submission_effect, 'unknown');

  // Subsequent dispatch with working driver must NEVER replay the unknown operation
  let workingCalls = 0;
  const workingDriver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-ok', evidenceRef: 'ev-prep' }),
    send: async () => {
      workingCalls++;
      return { status: 'accepted', binding: { conversationId: 'c-ok', userMessageId: 'm-ok' } };
    }
  };

  const nextDispatch = await dispatchNextStandard({ runtime, context, driver: workingDriver });
  assert.equal(workingCalls, 0, 'unknown operation must not be dispatched again');
  assert.equal(nextDispatch.status, 'idle');
  assert.equal(nextDispatch.operation_ref, null);
});

// ---------------------------------------------------------------------------
// 7. Acceptance and matching completion releases slot while preserving identity
// ---------------------------------------------------------------------------
moduleTest('7. accepted dispatch and matching completion releases slot while preserving identity', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 2 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job = await createPreparedJob(outputRoot, { question: 'Lifecycle test' });
  const receipt = await submitPreparedJobOnce({ outputRoot, jobId: job.job_id, runtime, requestKey: 'lifecycle-key' });

  const driver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-7', evidenceRef: 'ev-prep-7' }),
    send: async () => ({
      status: 'accepted',
      binding: { conversationId: 'conv-life-7', userMessageId: 'msg-life-7' },
      evidenceRef: 'ev-send-7'
    })
  };

  const fakeClock = { now: () => 4000000, sleep: async () => {} };
  const context = { authorize: () => true, deliveryReady: () => true, clock: fakeClock, random: () => 0 };

  const dispatch = await dispatchNextStandard({ runtime, context, driver });
  assert.equal(dispatch.status, 'dispatched');

  const observing = await inspectStandardRuntime({ runtime, operationRef: receipt.operation_ref });
  assert.equal(observing.occupied, 1);
  const opObserving = observing.operations.find((o) => o.operation_ref === receipt.operation_ref);
  assert.equal(opObserving.phase, 'observing');
  assert.equal(opObserving.submission_effect, 'accepted');

  // Record observation with matching binding
  const obsReceipt = await recordStandardObservation({
    runtime,
    operationRef: receipt.operation_ref,
    expectedRevision: opObserving.revision,
    observation: {
      status: 'completed',
      conversationId: 'conv-life-7',
      userMessageId: 'msg-life-7',
      evidenceRef: 'ev-obs-7'
    },
    context
  });

  assert.ok(obsReceipt);

  const settled = await inspectStandardRuntime({ runtime, operationRef: receipt.operation_ref });
  assert.equal(settled.occupied, 0, 'completed observation must release capacity slot');
  const opSettled = settled.operations.find((o) => o.operation_ref === receipt.operation_ref);
  assert.equal(opSettled.phase, 'collecting');
  assert.equal(opSettled.submission_effect, 'accepted');
  assert.equal(opSettled.operation_ref, receipt.operation_ref);
  assert.equal(opSettled.job_ref, receipt.job_ref);
  assert.deepEqual(opSettled.binding, { conversationId: 'conv-life-7', userMessageId: 'msg-life-7' });
});

// ---------------------------------------------------------------------------
// 8. Observation rejects mismatched binding, revision conflict, or unknown effect
// ---------------------------------------------------------------------------
moduleTest('8. observation rejects mismatched binding, revision conflict, or unknown effect', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job1 = await createPreparedJob(outputRoot, { question: 'Binding guard test' });
  const receipt1 = await submitPreparedJobOnce({ outputRoot, jobId: job1.job_id, runtime, requestKey: 'binding-guard-key' });

  const driver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-8', evidenceRef: 'ev-prep-8' }),
    send: async () => ({
      status: 'accepted',
      binding: { conversationId: 'conv-exact-8', userMessageId: 'msg-exact-8' },
      evidenceRef: 'ev-send-8'
    })
  };

  const fakeClock = { now: () => 5000000, sleep: async () => {} };
  const context = { authorize: () => true, deliveryReady: () => true, clock: fakeClock, random: () => 0 };

  await dispatchNextStandard({ runtime, context, driver });
  const state = await inspectStandardRuntime({ runtime, operationRef: receipt1.operation_ref });
  const op = state.operations.find((o) => o.operation_ref === receipt1.operation_ref);

  // Mismatched binding must reject with ERR_RUNTIME_BINDING
  await assert.rejects(
    recordStandardObservation({
      runtime,
      operationRef: receipt1.operation_ref,
      expectedRevision: op.revision,
      observation: {
        status: 'completed',
        conversationId: 'conv-WRONG-8',
        userMessageId: 'msg-exact-8',
        evidenceRef: 'ev-obs-wrong'
      },
      context
    }),
    { code: 'ERR_RUNTIME_BINDING' }
  );

  // Stale or conflicted revision must reject with ERR_RUNTIME_REVISION_CONFLICT
  await assert.rejects(
    recordStandardObservation({
      runtime,
      operationRef: receipt1.operation_ref,
      expectedRevision: op.revision + 42,
      observation: {
        status: 'completed',
        conversationId: 'conv-exact-8',
        userMessageId: 'msg-exact-8',
        evidenceRef: 'ev-obs-stale'
      },
      context
    }),
    { code: 'ERR_RUNTIME_REVISION_CONFLICT' }
  );

  // Unknown-effect operation cannot be freed by fabricated completion
  const job2 = await createPreparedJob(outputRoot, { question: 'Crashing operation for unknown guard' });
  const receipt2 = await submitPreparedJobOnce({ outputRoot, jobId: job2.job_id, runtime, requestKey: 'unknown-obs-key' });

  const crashingDriver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint' }),
    send: async () => { throw new Error('transport blowup'); }
  };
  await assert.rejects(dispatchNextStandard({ runtime, context, driver: crashingDriver }));

  const unknownOpState = await inspectStandardRuntime({ runtime, operationRef: receipt2.operation_ref });
  const unknownOp = unknownOpState.operations.find((o) => o.operation_ref === receipt2.operation_ref);
  assert.equal(unknownOp.submission_effect, 'unknown');

  await assert.rejects(
    recordStandardObservation({
      runtime,
      operationRef: receipt2.operation_ref,
      expectedRevision: unknownOp.revision,
      observation: {
        status: 'completed',
        conversationId: 'fabricated-conv',
        userMessageId: 'fabricated-msg'
      },
      context
    }),
    (err) => err?.code?.startsWith('ERR_RUNTIME_')
  );
});

// ---------------------------------------------------------------------------
// 9. Held high priority preserves FIFO eligibility on normal priority
// ---------------------------------------------------------------------------
moduleTest('9. held high priority request leaves normal priority eligible without starvation', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 2 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const jobHigh = await createPreparedJob(outputRoot, { question: 'High priority job' });
  const jobNormal = await createPreparedJob(outputRoot, { question: 'Normal priority job' });

  const receiptHigh = await submitPreparedJobOnce({
    outputRoot,
    jobId: jobHigh.job_id,
    runtime,
    requestKey: 'high-priority-key',
    context: { priority: 'high' }
  });

  const receiptNormal = await submitPreparedJobOnce({
    outputRoot,
    jobId: jobNormal.job_id,
    runtime,
    requestKey: 'normal-priority-key',
    context: { priority: 'normal' }
  });

  const driverWithHeldHigh = {
    prepare: async (op) => {
      if (op.priority === 'high') {
        return { status: 'held', reason: 'high-tier capacity unavailable upstream' };
      }
      return { status: 'ready', target: 'endpoint-normal', evidenceRef: 'ev-norm-prep' };
    },
    send: async (op) => ({
      status: 'accepted',
      binding: { conversationId: `conv-${op.operation_ref}`, userMessageId: 'msg-norm' },
      evidenceRef: 'ev-norm-send'
    })
  };

  const fakeClock = { now: () => 6000000, sleep: async () => {} };
  const context = { authorize: () => true, deliveryReady: () => true, clock: fakeClock, random: () => 0 };

  const dispatchRes = await dispatchNextStandard({ runtime, context, driver: driverWithHeldHigh });
  assert.equal(dispatchRes.status, 'dispatched');
  assert.equal(dispatchRes.operation_ref, receiptNormal.operation_ref, 'normal priority operation must be dispatched when high is held');

  const inspected = await inspectStandardRuntime({ runtime });
  assert.equal(inspected.occupied, 1, 'held high priority must not consume capacity');
  const highOp = inspected.operations.find((o) => o.operation_ref === receiptHigh.operation_ref);
  assert.equal(highOp.phase, 'queued');
  assert.equal(highOp.submission_effect, 'known_unsent');
});

// ---------------------------------------------------------------------------
// 10. Controlled clock sender enforces 4000-5000ms quiet period and cooldown
// ---------------------------------------------------------------------------
moduleTest('10. controlled clock enforces 4000-5000ms quiet period and cooldown between sends', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job1 = await createPreparedJob(outputRoot, { question: 'Clock test 1' });
  const job2 = await createPreparedJob(outputRoot, { question: 'Clock test 2' });

  await submitPreparedJobOnce({ outputRoot, jobId: job1.job_id, runtime, requestKey: 'clock-key-1' });
  await submitPreparedJobOnce({ outputRoot, jobId: job2.job_id, runtime, requestKey: 'clock-key-2' });

  let simulatedNow = 10_000_000;
  const recordedSleeps = [];
  const fakeClock = {
    now: () => simulatedNow,
    sleep: async (ms) => {
      recordedSleeps.push(ms);
      simulatedNow += ms;
    }
  };

  // random returns 0.5 -> 4000 + floor(0.5 * 1001) = 4500ms quiet period
  const fakeRandom = () => 0.5;

  const driver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-clock', evidenceRef: 'ev-prep' }),
    send: async (op) => ({
      status: 'accepted',
      binding: { conversationId: `conv-${op.operation_ref}`, userMessageId: 'msg-clock' },
      evidenceRef: 'ev-send'
    })
  };

  const context = {
    authorize: () => true,
    deliveryReady: () => true,
    clock: fakeClock,
    random: fakeRandom
  };

  const res1 = await dispatchNextStandard({ runtime, context, driver });
  assert.equal(res1.status, 'dispatched');

  const res2 = await dispatchNextStandard({ runtime, context, driver });
  assert.equal(res2.status, 'dispatched');

  assert.ok(recordedSleeps.length >= 2, 'both sends must observe quiet period sleeps');
  for (const sleepMs of recordedSleeps) {
    assert.ok(sleepMs >= 4000 && sleepMs <= 5001, `sleep ${sleepMs}ms must be within 4000-5001ms quiet period range`);
  }
});

// ---------------------------------------------------------------------------
// 11. Missing, corrupt store or mismatched epoch refuses via ERR_RUNTIME_HISTORY_UNAVAILABLE / ERR_RUNTIME_EPOCH
// ---------------------------------------------------------------------------
moduleTest('11. missing, corrupt store or mismatched epoch refuses via ERR_RUNTIME_HISTORY_UNAVAILABLE or ERR_RUNTIME_EPOCH', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job = await createPreparedJob(outputRoot, { question: 'Integrity test job' });

  // 1. Wrong epoch refuses via ERR_RUNTIME_EPOCH
  await assert.rejects(
    inspectStandardRuntime({ runtime: { root: runtimeRoot, epoch: 'wrong-epoch-123' } }),
    { code: 'ERR_RUNTIME_EPOCH' }
  );
  await assert.rejects(
    submitPreparedJobOnce({
      outputRoot,
      jobId: job.job_id,
      runtime: { root: runtimeRoot, epoch: 'wrong-epoch-123' },
      requestKey: 'bad-epoch-key'
    }),
    { code: 'ERR_RUNTIME_EPOCH' }
  );

  // 2. Nonempty / existing root refuses reinitialization
  await assert.rejects(
    initializeStandardRuntime({ root: runtimeRoot, capacity: 4 }),
    (err) => err?.code?.startsWith('ERR_RUNTIME_')
  );

  // 3. Missing state in nonexistent or empty directory refuses via ERR_RUNTIME_HISTORY_UNAVAILABLE
  const missingRoot = join(root, 'missing-runtime');
  await mkdir(missingRoot, { recursive: true });
  await assert.rejects(
    inspectStandardRuntime({ runtime: { root: missingRoot, epoch: init.runtime_epoch } }),
    { code: 'ERR_RUNTIME_HISTORY_UNAVAILABLE' }
  );

  // 4. Corrupt state snapshot refuses via ERR_RUNTIME_HISTORY_UNAVAILABLE
  const corruptRoot = join(root, 'corrupt-runtime');
  const corruptInit = await initializeStandardRuntime({ root: corruptRoot, capacity: 4 });
  await writeFile(join(corruptRoot, 'runtime-state.json'), '{ "corrupt": "invalid-snapshot"\n');

  await assert.rejects(
    inspectStandardRuntime({ runtime: { root: corruptRoot, epoch: corruptInit.runtime_epoch } }),
    { code: 'ERR_RUNTIME_HISTORY_UNAVAILABLE' }
  );
  await assert.rejects(
    submitPreparedJobOnce({
      outputRoot,
      jobId: job.job_id,
      runtime: { root: corruptRoot, epoch: corruptInit.runtime_epoch },
      requestKey: 'corrupt-key'
    }),
    { code: 'ERR_RUNTIME_HISTORY_UNAVAILABLE' }
  );
});

// ---------------------------------------------------------------------------
// 12. Untrustworthy or replaced lock ownership refuses via ERR_RUNTIME_OWNER_UNRESOLVED
// ---------------------------------------------------------------------------
moduleTest('12. tampered or replaced lock ownership refuses via ERR_RUNTIME_OWNER_UNRESOLVED', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job = await createPreparedJob(outputRoot, { question: 'Lock tampering test' });
  await submitPreparedJobOnce({ outputRoot, jobId: job.job_id, runtime, requestKey: 'lock-test-key' });

  // Simulate untrustworthy or replaced owner handle / lockfile
  // Disappearance / replacement of owned lock files must yield conservative refusal
  const files = await readdir(runtimeRoot);
  const lockFiles = files.filter((f) => f.includes('lock'));
  if (lockFiles.length === 0) {
    // If locks are created on demand or named state.lock / effect.lock
    await writeFile(join(runtimeRoot, 'state.lock'), JSON.stringify({ owner: 'alien-process-99999', token: 'alien-token' }));
    await writeFile(join(runtimeRoot, 'effect.lock'), JSON.stringify({ owner: 'alien-process-99999', token: 'alien-token' }));
  } else {
    for (const lockFile of lockFiles) {
      await writeFile(join(runtimeRoot, lockFile), JSON.stringify({ owner: 'alien-process-99999', token: 'alien-token' }));
    }
  }

  const driver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint' }),
    send: async () => ({ status: 'accepted', binding: { conversationId: 'c', userMessageId: 'm' } })
  };
  const fakeClock = { now: () => 11000000, sleep: async () => {} };
  const context = { authorize: () => true, deliveryReady: () => true, clock: fakeClock, random: () => 0 };

  await assert.rejects(
    dispatchNextStandard({ runtime, context, driver }),
    (err) => err?.code === 'ERR_RUNTIME_OWNER_UNRESOLVED' || err?.code === 'ERR_RUNTIME_BUSY'
  );
});
