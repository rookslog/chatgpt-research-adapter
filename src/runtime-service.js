import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from './canonical-json.js';
import { deliveryReady } from './caller-binding.js';
import { humanControlActive } from './human-control.js';
import { recordOperationEvent } from './runtime-events.js';
import {
  collectStandardResult,
  dispatchNextStandard,
  inspectStandardRuntime,
  observeStandardWithEffect,
  recordStandardObservation
} from './standard-runtime.js';

const fail = (message, code = 'ERR_RUNTIME_SERVICE') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

function isProcessAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err?.code === 'EPERM') return true;
    return false;
  }
}

function getServiceLockPath(runtimeRoot) {
  return join(runtimeRoot, 'service.lock');
}

function getStopRequestPath(runtimeRoot) {
  return join(runtimeRoot, 'service.stop');
}

function ownedByCurrentUser(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

async function requireRuntimeDirectory(runtimeRoot) {
  const stat = await lstat(runtimeRoot).catch(() => null);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory() || !ownedByCurrentUser(stat)) {
    fail('runtime root is not an owned regular directory', 'ERR_SERVICE_OWNER_UNRESOLVED');
  }
  return stat;
}

async function syncRuntimeDirectory(runtimeRoot, identity) {
  const fd = await open(runtimeRoot, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await fd.stat();
    if (!stat.isDirectory() || stat.dev !== identity.dev || stat.ino !== identity.ino) {
      fail('runtime root changed during service ownership update', 'ERR_SERVICE_OWNER_UNRESOLVED');
    }
    await fd.sync();
  } finally {
    await fd.close();
  }
}

async function readServiceOwner(runtimeRoot) {
  const lockPath = getServiceLockPath(runtimeRoot);
  const stat = await lstat(lockPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile() || !ownedByCurrentUser(stat)) fail('service owner file is untrusted', 'ERR_SERVICE_OWNER_UNRESOLVED');
  let owner;
  try { owner = JSON.parse(await readFile(lockPath, 'utf8')); } catch { fail('service owner record is malformed', 'ERR_SERVICE_OWNER_UNRESOLVED'); }
  if (
    owner?.schema !== 'research.service-lock.v1' ||
    !Number.isInteger(owner.pid) || owner.pid < 1 ||
    typeof owner.nonce !== 'string' || owner.nonce.length === 0 ||
    typeof owner.configPath !== 'string' || owner.configPath.length === 0 ||
    owner.dev !== stat.dev || owner.ino !== stat.ino
  ) fail('service owner record is malformed', 'ERR_SERVICE_OWNER_UNRESOLVED');
  return { ...owner, stat };
}

export async function waitForServiceReady({ runtimeRoot, configPath, pid, timeoutMs = 5000, clock } = {}) {
  if (
    typeof runtimeRoot !== 'string' ||
    typeof configPath !== 'string' || configPath.length === 0 ||
    !Number.isInteger(pid) || pid < 1 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000
  ) fail('service readiness descriptor is invalid', 'ERR_SERVICE_STARTUP');
  await requireRuntimeDirectory(runtimeRoot);
  const now = typeof clock?.now === 'function' ? () => clock.now() : () => Date.now();
  const sleep = typeof clock?.sleep === 'function'
    ? (ms) => clock.sleep(ms)
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const owner = await readServiceOwner(runtimeRoot);
    if (owner) {
      if (owner.pid !== pid || owner.configPath !== configPath || !isProcessAlive(owner.pid)) {
        fail('service ownership does not match the spawned process', 'ERR_SERVICE_STARTUP');
      }
      return { status: 'started', pid: owner.pid };
    }
    if (!isProcessAlive(pid)) fail('service process exited before acquiring ownership', 'ERR_SERVICE_STARTUP');
    await sleep(Math.min(25, Math.max(1, deadline - now())));
  }
  fail('service process did not acquire ownership before the startup deadline', 'ERR_SERVICE_STARTUP');
}

export async function acquireServiceLock(runtimeRoot, configPath) {
  const rootIdentity = await requireRuntimeDirectory(runtimeRoot);
  const lockPath = getServiceLockPath(runtimeRoot);
  const nonce = randomUUID();
  let fd;
  try {
    fd = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
  } catch (err) {
    if (err?.code === 'EEXIST') {
      const existing = await readServiceOwner(runtimeRoot);
      if (existing && isProcessAlive(existing.pid)) fail(`service already running by process ${existing.pid}`, 'ERR_SERVICE_RUNNING');
      fail('existing service owner cannot be replaced automatically', 'ERR_SERVICE_OWNER_UNRESOLVED');
    } else {
      throw err;
    }
  }
  const lockIdentity = await fd.stat();
  const payload = canonicalJson({
    schema: 'research.service-lock.v1', pid: process.pid, nonce, configPath,
    dev: lockIdentity.dev, ino: lockIdentity.ino, started_at: Date.now()
  }) + '\n';
  try {
    await fd.writeFile(payload, 'utf8');
    await fd.sync();
    await fd.close();
    fd = null;
    await syncRuntimeDirectory(runtimeRoot, rootIdentity);
  } catch (error) {
    await fd?.close().catch(() => {});
    const current = await lstat(lockPath).catch(() => null);
    if (current && current.dev === lockIdentity.dev && current.ino === lockIdentity.ino) await unlink(lockPath).catch(() => {});
    throw error;
  }

  return {
    lockPath,
    nonce,
    release: async () => {
      const current = await readServiceOwner(runtimeRoot);
      if (!current || current.nonce !== nonce || current.stat.dev !== lockIdentity.dev || current.stat.ino !== lockIdentity.ino) return false;
      await unlink(lockPath);
      await syncRuntimeDirectory(runtimeRoot, rootIdentity);
      return true;
    }
  };
}

export async function requestServiceStop(runtimeRoot) {
  const rootIdentity = await requireRuntimeDirectory(runtimeRoot);
  const lock = await readServiceOwner(runtimeRoot);
  if (!lock) return { status: 'not_running' };
  if (!isProcessAlive(lock.pid)) fail('service owner is unresolved', 'ERR_SERVICE_OWNER_UNRESOLVED');

  const stopPath = getStopRequestPath(runtimeRoot);
  const stopPayload = canonicalJson({
    schema: 'research.service-stop.v1',
    requested_at: Date.now(),
    nonce: lock.nonce
  }) + '\n';
  const fd = await open(stopPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    await fd.writeFile(stopPayload, 'utf8');
    await fd.sync();
  } finally {
    await fd.close();
  }
  await syncRuntimeDirectory(runtimeRoot, rootIdentity);

  return { status: 'stop_requested', pid: lock.pid };
}

export async function checkStopRequested(runtimeRoot) {
  const stopPath = getStopRequestPath(runtimeRoot);
  try {
    const stat = await lstat(stopPath);
    if (stat.isSymbolicLink() || !stat.isFile() || !ownedByCurrentUser(stat)) return false;
    const stop = JSON.parse(await readFile(stopPath, 'utf8'));
    const owner = await readServiceOwner(runtimeRoot);
    if (!owner || stop?.schema !== 'research.service-stop.v1' || stop.nonce !== owner.nonce) return false;
    await unlink(stopPath);
    return true;
  } catch (error) {
    if (error?.code !== 'ENOENT') return false;
  }
  return false;
}

export async function runRuntimeCycle({ config, driver, context } = {}) {
  if (!config || !config.runtime?.root || !config.runtime?.epoch) {
    fail('valid runtime config is required', 'ERR_RUNTIME_CONFIG');
  }

  if (!driver) {
    fail('runtime driver is required', 'ERR_RUNTIME_DRIVER');
  }
  if (await humanControlActive(config.runtime)) {
    return { status: 'held', dispatch: { status: 'held', operation_ref: null, reason: 'human_control_active', snapshot: null } };
  }

  const cycleContext = {
    ...context,
    deliveryReady: (candidate) =>
      deliveryReady({
        config,
        operationRef: candidate?.operation_ref,
        clock: context?.clock
      })
  };

  // 1. Dispatch step
  const dispatchResult = await dispatchNextStandard({
    runtime: config.runtime,
    context: cycleContext,
    driver
  });

  if (dispatchResult?.status === 'dispatched' && dispatchResult.operation_ref) {
    const op = dispatchResult.snapshot?.operations?.[dispatchResult.operation_ref];
    await recordOperationEvent({
      config,
      operationRef: dispatchResult.operation_ref,
      jobRef: op?.job_ref ?? 'unknown',
      type: 'operation.dispatched'
    });
  }

  // 2. Observation step
  const state = await inspectStandardRuntime({ runtime: config.runtime });
  for (const op of state.operations || []) {
    if (op.phase === 'observing') {
      if (typeof driver.observe === 'function') {
        try {
          const routeReady = deliveryReady({
            config,
            operationRef: op.operation_ref,
            clock: context?.clock
          });
          const latestDeliveryEvent = (state.events ?? [])
            .filter((event) => event.operation_ref === op.operation_ref && ['delivery.attention', 'delivery.restored'].includes(event.type))
            .at(-1);
          if (!routeReady && latestDeliveryEvent?.type !== 'delivery.attention') {
            await recordOperationEvent({
              config,
              operationRef: op.operation_ref,
              jobRef: op.job_ref,
              type: 'delivery.attention',
              payload: { reason: 'observer_route_unavailable' }
            });
          } else if (routeReady && latestDeliveryEvent?.type === 'delivery.attention') {
            await recordOperationEvent({
              config,
              operationRef: op.operation_ref,
              jobRef: op.job_ref,
              type: 'delivery.restored'
            });
          }
          const observationView = await inspectStandardRuntime({ runtime: config.runtime, operationRef: op.operation_ref });
          const operationToObserve = observationView.operations[0];
          if (!operationToObserve) fail('observed operation disappeared', 'ERR_RUNTIME_NOT_FOUND');
          const observation = await observeStandardWithEffect({
            runtime: config.runtime,
            operationRef: operationToObserve.operation_ref,
            expectedRevision: operationToObserve.revision,
            driver
          });
          if (observation && typeof observation.status === 'string') {
            const currentView = await inspectStandardRuntime({ runtime: config.runtime, operationRef: op.operation_ref });
            const currentOp = currentView.operations[0];
            if (!currentOp) fail('observed operation disappeared', 'ERR_RUNTIME_NOT_FOUND');
            if (observation.status === 'completed' && observation.capture) {
              await collectStandardResult({
                runtime: config.runtime,
                operationRef: op.operation_ref,
                expectedRevision: currentOp.revision,
                capture: observation.capture,
                context: { ...context, contentRoot: config.contentRoot }
              });
            } else {
              if (
                ['running', 'failed'].includes(observation.status) &&
                typeof observation.conversationId === 'string' &&
                typeof observation.userMessageId === 'string' &&
                typeof observation.evidenceRef === 'string'
              ) {
                await recordStandardObservation({
                  runtime: config.runtime,
                  operationRef: op.operation_ref,
                  expectedRevision: currentOp.revision,
                  observation,
                  context
                });
              }
              await recordOperationEvent({
                config,
                operationRef: op.operation_ref,
                jobRef: op.job_ref,
                type: `observation.${observation.status}`,
                payload: observation.reason ? { reason: observation.reason } : null
              });
            }
          }
        } catch (err) {
          if (err?.executorUnresolved === true) throw err;
          if (err?.code === 'ERR_HUMAN_CONTROL_ACTIVE') continue;
          // Record attention without resending
          await recordOperationEvent({
            config,
            operationRef: op.operation_ref,
            jobRef: op.job_ref,
            type: 'observation.attention',
            payload: { message: err?.message ?? 'observation error' }
          });
        }
      }
    }
  }

  return {
    status: 'completed',
    dispatch: dispatchResult
  };
}

export async function runService({ config, driver, context, once = false } = {}) {
  if (typeof config?.configPath !== 'string' || config.configPath.length === 0) {
    fail('service configPath is required', 'ERR_RUNTIME_CONFIG');
  }
  if (await humanControlActive(config.runtime)) return { status: 'held', reason: 'human_control_active' };
  const lock = await acquireServiceLock(config.runtime.root, config.configPath);
  let stopped = false;

  const handleSignal = () => {
    stopped = true;
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    if (await humanControlActive(config.runtime)) return { status: 'held', reason: 'human_control_active' };
    if (once) {
      return await runRuntimeCycle({ config, driver, context });
    }

    while (!stopped) {
      if (await checkStopRequested(config.runtime.root)) {
        stopped = true;
        break;
      }
      await runRuntimeCycle({ config, driver, context });
      if (typeof context?.clock?.sleep === 'function') {
        await context.clock.sleep(1000);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } finally {
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
    await lock.release();
  }
}
