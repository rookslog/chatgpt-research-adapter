import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
const admitWorkerPath = fileURLToPath(new URL('./fixtures/standard-runtime/admit-worker.js', import.meta.url));
const dispatchWorkerPath = fileURLToPath(new URL('./fixtures/standard-runtime/dispatch-worker.js', import.meta.url));
const holdOwnerWorkerPath = fileURLToPath(new URL('./fixtures/standard-runtime/hold-owner-worker.js', import.meta.url));

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

function createAdvancingClock(initialTime = 10_000_000) {
  let currentTime = initialTime;
  return {
    now: () => currentTime,
    sleep: async (ms) => {
      currentTime += ms;
    }
  };
}

function runChildProcess(scriptPath, args, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Child process ${scriptPath} timed out after ${timeoutMs}ms; stderr: ${stderr}`));
    }, timeoutMs);
    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function spawnHoldingWorker(scriptPath, args, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Holding worker timed out waiting for readiness signal after ${timeoutMs}ms; stderr: ${stderr}`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes('READY_HOLDING_OWNERSHIP\n')) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      reject(new Error(`Holding worker exited prematurely with code ${code}; stderr: ${stderr}`));
    });
  });
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
// 3. Concurrent admission across distinct output roots via child processes
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

  // Concurrently admit from two distinct child processes with bounded ERR_RUNTIME_BUSY retry
  const [proc1Result, proc2Result] = await Promise.all([
    runChildProcess(admitWorkerPath, [
      '--output-root', outputRoot1,
      '--job-id', job1.job_id,
      '--runtime-root', runtimeRoot,
      '--runtime-epoch', runtime.epoch,
      '--request-key', 'proc-root1-key'
    ]),
    runChildProcess(admitWorkerPath, [
      '--output-root', outputRoot2,
      '--job-id', job2.job_id,
      '--runtime-root', runtimeRoot,
      '--runtime-epoch', runtime.epoch,
      '--request-key', 'proc-root2-key'
    ])
  ]);

  assert.equal(proc1Result.code, 0, `proc1 failed with stderr: ${proc1Result.stderr}`);
  assert.equal(proc2Result.code, 0, `proc2 failed with stderr: ${proc2Result.stderr}`);

  const receipt1 = JSON.parse(proc1Result.stdout);
  const receipt2 = JSON.parse(proc2Result.stdout);

  assert.equal(receipt1.admission, 'accepted');
  assert.equal(receipt2.admission, 'accepted');
  assert.notEqual(receipt1.operation_ref, receipt2.operation_ref);

  // Fresh child process lookup with same key recovers existing admission
  const lookupResult = await runChildProcess(admitWorkerPath, [
    '--output-root', outputRoot1,
    '--job-id', job1.job_id,
    '--runtime-root', runtimeRoot,
    '--runtime-epoch', runtime.epoch,
    '--request-key', 'proc-root1-key'
  ]);
  assert.equal(lookupResult.code, 0, `fresh process lookup failed: ${lookupResult.stderr}`);
  const lookupReceipt = JSON.parse(lookupResult.stdout);
  assert.equal(lookupReceipt.admission, 'existing');
  assert.equal(lookupReceipt.operation_ref, receipt1.operation_ref);

  // Inspect state from parent: both distinct operations must be durably present
  const inspected = await inspectStandardRuntime({ runtime });
  assert.equal(inspected.operations.length, 2);
  const opRefs = inspected.operations.map((o) => o.operation_ref);
  assert.ok(opRefs.includes(receipt1.operation_ref));
  assert.ok(opRefs.includes(receipt2.operation_ref));
});

// ---------------------------------------------------------------------------
// 4. Capacity bounds 1, 2, 4 and competing last-slot dispatchers
// ---------------------------------------------------------------------------
moduleTest('4. capacity enforcement across capacities 1, 2, and 4 with competing last-slot dispatchers', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);

  // Capacity out of range (integer 1-4 required) must reject
  await assert.rejects(
    initializeStandardRuntime({ root: join(root, 'cap-0'), capacity: 0 }),
    (err) => err?.code?.startsWith('ERR_RUNTIME_')
  );
  await assert.rejects(
    initializeStandardRuntime({ root: join(root, 'cap-5'), capacity: 5 }),
    (err) => err?.code?.startsWith('ERR_RUNTIME_')
  );

  for (const cap of [1, 2, 4]) {
    const subRoot = join(root, `cap-sub-${cap}`);
    await mkdir(subRoot);
    const runtimeRoot = join(subRoot, 'runtime');
    const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: cap });
    const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

    // Admit cap + 1 jobs
    const jobs = [];
    for (let i = 0; i <= cap; i++) {
      const job = await createPreparedJob(outputRoot, { question: `Cap-${cap} test job ${i}` });
      await submitPreparedJobOnce({ outputRoot, jobId: job.job_id, runtime, requestKey: `cap-${cap}-key-${i}` });
      jobs.push(job);
    }

    // Prefill cap - 1 slots to leave exactly 1 slot open
    const prefillDriver = {
      prepare: async () => ({ status: 'ready', target: 'endpoint-prefill', evidenceRef: 'ev-prep' }),
      send: async (op) => ({
        status: 'accepted',
        binding: { conversationId: `conv-prefill-${op.operation_ref}`, userMessageId: 'msg-prefill' },
        evidenceRef: 'ev-send'
      })
    };
    const prefillContext = {
      authorize: () => true,
      deliveryReady: () => true,
      clock: createAdvancingClock(),
      random: () => 0
    };

    for (let i = 0; i < cap - 1; i++) {
      const prefillRes = await dispatchNextStandard({ runtime, context: prefillContext, driver: prefillDriver });
      assert.equal(prefillRes.status, 'dispatched');
    }

    const stateBeforeRace = await inspectStandardRuntime({ runtime });
    assert.equal(stateBeforeRace.occupied, cap - 1, `exactly ${cap - 1} slots must be prefilled before last-slot race`);

    let raceResults;
    if (cap === 1) {
      // Race competing dispatchers using two distinct child processes
      const [child1, child2] = await Promise.all([
        runChildProcess(dispatchWorkerPath, ['--runtime-root', runtimeRoot, '--runtime-epoch', runtime.epoch, '--delay-send-ms', '40']),
        runChildProcess(dispatchWorkerPath, ['--runtime-root', runtimeRoot, '--runtime-epoch', runtime.epoch, '--delay-send-ms', '40'])
      ]);
      assert.equal(child1.code, 0, `child1 failed: ${child1.stderr}`);
      assert.equal(child2.code, 0, `child2 failed: ${child2.stderr}`);
      raceResults = [JSON.parse(child1.stdout), JSON.parse(child2.stdout)];
    } else {
      // Race competing dispatchers concurrently in process
      let concurrentSends = 0;
      let maxConcurrentSends = 0;
      const competingDriver = {
        prepare: async () => ({ status: 'ready', target: 'endpoint-competing', evidenceRef: 'ev-prep' }),
        send: async (op) => {
          concurrentSends++;
          maxConcurrentSends = Math.max(maxConcurrentSends, concurrentSends);
          await new Promise((resolve) => setTimeout(resolve, 30));
          concurrentSends--;
          return {
            status: 'accepted',
            binding: { conversationId: `conv-${op.operation_ref}`, userMessageId: 'msg-comp' },
            evidenceRef: 'ev-send'
          };
        }
      };
      const competingContext = {
        authorize: () => true,
        deliveryReady: () => true,
        clock: createAdvancingClock(),
        random: () => 0
      };

      raceResults = await Promise.all([
        dispatchNextStandard({ runtime, context: competingContext, driver: competingDriver }).catch((err) => {
          if (err?.code === 'ERR_RUNTIME_BUSY') return { status: 'busy', code: 'ERR_RUNTIME_BUSY' };
          throw err;
        }),
        dispatchNextStandard({ runtime, context: competingContext, driver: competingDriver }).catch((err) => {
          if (err?.code === 'ERR_RUNTIME_BUSY') return { status: 'busy', code: 'ERR_RUNTIME_BUSY' };
          throw err;
        })
      ]);
      assert.ok(maxConcurrentSends <= 1, 'shared effect mutex must prevent overlapping sends');
    }

    // Exactly one winner dispatches into the final available slot; loser receives idle or typed busy contention
    const dispatchedCount = raceResults.filter((r) => r.status === 'dispatched').length;
    assert.equal(dispatchedCount, 1, `exactly 1 additional send must be dispatched into final slot for cap ${cap}`);

    for (const res of raceResults) {
      assert.ok(
        res.status === 'dispatched' || res.status === 'idle' || res.status === 'busy',
        `contention result must be dispatched, idle, or busy (got: ${JSON.stringify(res)})`
      );
    }

    const stateAfterRace = await inspectStandardRuntime({ runtime });
    assert.ok(stateAfterRace.occupied <= cap, `occupied slots (${stateAfterRace.occupied}) must not exceed capacity (${cap})`);
    assert.equal(stateAfterRace.occupied, cap, `capacity ${cap} must be fully occupied after winning dispatch`);
  }
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

  const fakeClock = createAdvancingClock(2000000);
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

  const fakeClock = createAdvancingClock(3000000);
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

  const fakeClock = createAdvancingClock(4000000);
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

  const fakeClock = createAdvancingClock(5000000);
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
    prepare: async () => ({ status: 'ready', target: 'endpoint', evidenceRef: 'synthetic-crash-preparation' }),
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
// 9. Gated preferred request leaves ungated normal priority request eligible
// ---------------------------------------------------------------------------
moduleTest('9. ungated normal priority request remains eligible when preferred high priority request is gated', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 2 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const jobHigh = await createPreparedJob(outputRoot, { question: 'High priority job' });
  const jobNormal = await createPreparedJob(outputRoot, { question: 'Normal priority job' });

  // High priority admission must supply authorize: () => true because default authority allows only normal
  const receiptHigh = await submitPreparedJobOnce({
    outputRoot,
    jobId: jobHigh.job_id,
    runtime,
    requestKey: 'high-priority-key',
    context: { priority: 'high', authorize: () => true }
  });

  const receiptNormal = await submitPreparedJobOnce({
    outputRoot,
    jobId: jobNormal.job_id,
    runtime,
    requestKey: 'normal-priority-key',
    context: { priority: 'normal', authorize: () => true }
  });

  const driver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-ready', evidenceRef: 'ev-prep' }),
    send: async (op) => ({
      status: 'accepted',
      binding: { conversationId: `conv-${op.operation_ref}`, userMessageId: 'msg-norm' },
      evidenceRef: 'ev-norm-send'
    })
  };

  const fakeClock = createAdvancingClock(6000000);
  // Delivery gate explicitly holds the high-priority operation; normal-priority operation is deliveryReady
  const context = {
    authorize: () => true,
    deliveryReady: (op) => op.priority !== 'high',
    clock: fakeClock,
    random: () => 0
  };

  const dispatchRes = await dispatchNextStandard({ runtime, context, driver });
  assert.equal(dispatchRes.status, 'dispatched');
  assert.equal(
    dispatchRes.operation_ref,
    receiptNormal.operation_ref,
    'normal priority operation must be dispatched when high priority operation delivery gate is not ready'
  );

  const inspected = await inspectStandardRuntime({ runtime });
  assert.equal(inspected.occupied, 1, 'gated high priority must not consume capacity slot');
  const highOp = inspected.operations.find((o) => o.operation_ref === receiptHigh.operation_ref);
  assert.equal(highOp.phase, 'queued');
  assert.equal(highOp.submission_effect, 'known_unsent');
});

// ---------------------------------------------------------------------------
// 10. Monotonic advancing clock enforces >=4000ms quiet period between sends
// ---------------------------------------------------------------------------
moduleTest('10. advancing clock enforces monotonic >=4000ms quiet period separation between attempted sends (public cooldown setter deferred to next slice)', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job1 = await createPreparedJob(outputRoot, { question: 'Clock test 1' });
  const job2 = await createPreparedJob(outputRoot, { question: 'Clock test 2' });

  await submitPreparedJobOnce({ outputRoot, jobId: job1.job_id, runtime, requestKey: 'clock-key-1' });
  await submitPreparedJobOnce({ outputRoot, jobId: job2.job_id, runtime, requestKey: 'clock-key-2' });

  const advancingClock = createAdvancingClock(10_000_000);
  const sendTimestamps = [];

  // random returns 0.5 -> monotonic quiet period = 4000 + floor(0.5 * 1001) = 4500ms
  const controlledRandom = () => 0.5;

  const driver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-clock', evidenceRef: 'ev-prep' }),
    send: async (op) => {
      // Record the actual sender timestamp modeled by the advancing clock
      sendTimestamps.push(advancingClock.now());
      return {
        status: 'accepted',
        binding: { conversationId: `conv-${op.operation_ref}`, userMessageId: 'msg-clock' },
        evidenceRef: 'ev-send'
      };
    }
  };

  const context = {
    authorize: () => true,
    deliveryReady: () => true,
    clock: advancingClock,
    random: controlledRandom
  };

  const res1 = await dispatchNextStandard({ runtime, context, driver });
  assert.equal(res1.status, 'dispatched');

  const res2 = await dispatchNextStandard({ runtime, context, driver });
  assert.equal(res2.status, 'dispatched');

  assert.equal(sendTimestamps.length, 2, 'both sends must have executed and recorded sender timestamps');
  const elapsedBetweenSends = sendTimestamps[1] - sendTimestamps[0];
  assert.ok(
    elapsedBetweenSends >= 4000,
    `sender timestamps must be separated by at least 4000ms monotonic quiet period (actual: ${elapsedBetweenSends}ms)`
  );
  // Note: cooldown setter is not in frozen C1 public API; public cooldown configuration testing is explicitly deferred to next slice.
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
// 12. Abandoned owner from terminated worker refuses replacement dispatch via public API & process lifecycle
// ---------------------------------------------------------------------------
moduleTest('12. abandoned owner from terminated worker refuses replacement dispatch via ERR_RUNTIME_OWNER_UNRESOLVED or ERR_RUNTIME_BUSY', async (t) => {
  const { root, outputRoot } = await createWorkspace(t);
  const runtimeRoot = join(root, 'runtime');
  const init = await initializeStandardRuntime({ root: runtimeRoot, capacity: 4 });
  const runtime = { root: runtimeRoot, epoch: init.runtime_epoch };

  const job = await createPreparedJob(outputRoot, { question: 'Lock owner test job' });
  const receipt = await submitPreparedJobOnce({ outputRoot, jobId: job.job_id, runtime, requestKey: 'owner-test-key' });

  // Spawn child worker that acquires effect ownership in driver.prepare and holds it indefinitely
  const holderProc = await spawnHoldingWorker(holdOwnerWorkerPath, [
    '--runtime-root', runtimeRoot,
    '--runtime-epoch', runtime.epoch
  ]);

  // Terminate the holding child worker while it is holding ownership
  holderProc.kill('SIGKILL');
  await new Promise((resolve) => holderProc.on('close', resolve));

  // Replacement dispatch attempt must refuse conservatively without making send calls
  let sendCalls = 0;
  const replacementDriver = {
    prepare: async () => ({ status: 'ready', target: 'endpoint-replacement', evidenceRef: 'ev-prep' }),
    send: async () => {
      sendCalls++;
      return { status: 'accepted', binding: { conversationId: 'c-rep', userMessageId: 'm-rep' } };
    }
  };

  const context = {
    authorize: () => true,
    deliveryReady: () => true,
    clock: createAdvancingClock(),
    random: () => 0
  };

  await assert.rejects(
    dispatchNextStandard({ runtime, context, driver: replacementDriver }),
    (err) => err?.code === 'ERR_RUNTIME_OWNER_UNRESOLVED' || err?.code === 'ERR_RUNTIME_BUSY'
  );

  assert.equal(sendCalls, 0, 'replacement dispatch must make zero send calls after owner abandoned');

  // Verify queued / effect evidence remains intact without arbitrary mutation
  const inspected = await inspectStandardRuntime({ runtime, operationRef: receipt.operation_ref });
  assert.ok(inspected.operations.length >= 1);
  const op = inspected.operations.find((o) => o.operation_ref === receipt.operation_ref);
  assert.ok(op);
  assert.ok(op.submission_effect === 'known_unsent' || op.submission_effect === 'unknown');
});
