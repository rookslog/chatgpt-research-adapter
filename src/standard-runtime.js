import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { canonicalJson } from './canonical-json.js';

const RUNTIME_STATE_SCHEMA = 'standard.runtime-state.v1';
const PRIORITIES = new Set(['high', 'normal', 'background']);
const PHASES = new Set(['queued', 'dispatching', 'observing', 'collecting', 'settled']);
const EFFECTS = new Set(['known_unsent', 'unknown', 'accepted']);
const MAX_OPERATIONS = 256;
const MAX_PROMPT_BYTES = 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;

const fail = (message, code = 'ERR_RUNTIME_INTERNAL') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const inProcessLocks = new Map();

function historyUnavailable(message) {
  fail(message, 'ERR_RUNTIME_HISTORY_UNAVAILABLE');
}

function ownedByCurrentUser(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

function sameIdentity(stat, expected) {
  return Boolean(stat && expected && stat.dev === expected.dev && stat.ino === expected.ino);
}

function isPlainObject(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

async function validateRuntimeRoot(root) {
  if (typeof root !== 'string' || !isAbsolute(root)) {
    fail('runtime root must be an absolute path', 'ERR_RUNTIME_ROOT');
  }
  let stat;
  try {
    stat = await lstat(root);
  } catch {
    fail('runtime root is unavailable', 'ERR_RUNTIME_ROOT');
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('runtime root must be a regular directory and not a symlink', 'ERR_RUNTIME_ROOT');
  }
  if (!ownedByCurrentUser(stat)) {
    fail('runtime root must be owned by the current user', 'ERR_RUNTIME_ROOT');
  }
  return stat;
}

async function assertRuntimeRootIdentity(root, expected, message) {
  const current = await validateRuntimeRoot(root).catch(() => null);
  if (!sameIdentity(current, expected)) {
    fail(message, 'ERR_RUNTIME_ROOT_REPLACED');
  }
}

async function readOwnedRegularFile(path, unavailableMessage, sizeLimit = null) {
  let fd;
  try {
    fd = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    historyUnavailable(unavailableMessage);
  }
  try {
    const stat = await fd.stat();
    if (!stat.isFile() || !ownedByCurrentUser(stat)) {
      historyUnavailable(unavailableMessage);
    }
    if (sizeLimit !== null && stat.size > sizeLimit) {
      historyUnavailable('runtime state exceeds size limit');
    }
    return { text: await fd.readFile('utf8'), stat };
  } catch (error) {
    if (error?.code === 'ERR_RUNTIME_HISTORY_UNAVAILABLE') throw error;
    historyUnavailable(unavailableMessage);
  } finally {
    await fd.close().catch(() => {});
  }
}

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

async function readLockRecord(lockPath) {
  let fd;
  try {
    fd = await open(lockPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    fail('lock owner file is unavailable', 'ERR_RUNTIME_OWNER_UNRESOLVED');
  }
  try {
    const stat = await fd.stat();
    if (!stat.isFile() || !ownedByCurrentUser(stat)) {
      fail('lock owner file is not a regular owned file', 'ERR_RUNTIME_OWNER_UNRESOLVED');
    }
    let record;
    try {
      record = JSON.parse(await fd.readFile('utf8'));
    } catch {
      fail('lock owner file is corrupt', 'ERR_RUNTIME_OWNER_UNRESOLVED');
    }
    return { record, stat };
  } finally {
    await fd.close().catch(() => {});
  }
}

async function assertLockOwnership(handle, expectedEpoch) {
  const { record, stat } = await readLockRecord(handle.lockPath);
  if (
    !sameIdentity(stat, handle) ||
    !isPlainObject(record) ||
    record.token !== handle.token ||
    record.pid !== process.pid ||
    record.epoch !== expectedEpoch ||
    record.dev !== handle.dev ||
    record.ino !== handle.ino
  ) {
    fail('lock ownership changed or is inconsistent', 'ERR_RUNTIME_OWNER_UNRESOLVED');
  }
}

async function acquireLock(lockPath, epoch, { isStateLock = false } = {}) {
  const maxAttempts = isStateLock ? 30 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (inProcessLocks.has(lockPath)) {
      if (!isStateLock) {
        fail('effect lock already held in current process', 'ERR_RUNTIME_BUSY');
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 15)));
        continue;
      }
      fail('state lock contended in current process', 'ERR_RUNTIME_BUSY');
    }

    let fd;
    try {
      fd = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600);
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      let lockData = null;
      for (let readAttempt = 0; readAttempt < 10; readAttempt++) {
        let stat;
        try {
          stat = await lstat(lockPath);
        } catch (statErr) {
          if (statErr?.code === 'ENOENT') break;
          fail('lock file stat unavailable', 'ERR_RUNTIME_OWNER_UNRESOLVED');
        }
        if (stat.isSymbolicLink() || !stat.isFile() || !ownedByCurrentUser(stat)) {
          fail('lock file is not a regular file', 'ERR_RUNTIME_OWNER_UNRESOLVED');
        }
        try {
          const text = await readFile(lockPath, 'utf8');
          if (text.length > 0) {
            lockData = JSON.parse(text);
            if (
              lockData &&
              typeof lockData.pid === 'number' &&
              typeof lockData.token === 'string' &&
              lockData.epoch === epoch &&
              lockData.dev === stat.dev &&
              lockData.ino === stat.ino
            ) {
              break;
            }
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 10)));
      }

      const statNow = await lstat(lockPath).catch(() => null);
      if (!statNow) continue;

      if (!lockData || typeof lockData.pid !== 'number' || typeof lockData.token !== 'string') {
        fail('lock file is corrupt or unreadable', 'ERR_RUNTIME_OWNER_UNRESOLVED');
      }

      const alive = isProcessAlive(lockData.pid);
      if (!alive) {
        fail(`lock owner process ${lockData.pid} is terminated`, 'ERR_RUNTIME_OWNER_UNRESOLVED');
      }

      if (!isStateLock) {
        fail('effect lock held by active worker', 'ERR_RUNTIME_BUSY');
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10 + Math.floor(Math.random() * 20)));
        continue;
      }
      fail('state lock busy', 'ERR_RUNTIME_BUSY');
    }

    const stat = await fd.stat();
    if (!stat.isFile() || !ownedByCurrentUser(stat)) {
      await fd.close().catch(() => {});
      fail('new lock is not a regular owned file', 'ERR_RUNTIME_OWNER_UNRESOLVED');
    }
    const token = randomUUID();
    const payload = JSON.stringify({
      pid: process.pid,
      token,
      epoch,
      dev: stat.dev,
      ino: stat.ino,
      acquired_at: Date.now()
    });
    try {
      await fd.writeFile(payload, 'utf8');
      await fd.sync();
    } catch (error) {
      await fd.close().catch(() => {});
      throw error;
    }
    const handle = { fd, lockPath, token, dev: stat.dev, ino: stat.ino };
    try {
      await assertLockOwnership(handle, epoch);
    } catch (error) {
      await fd.close().catch(() => {});
      throw error;
    }
    inProcessLocks.set(lockPath, { token, dev: stat.dev, ino: stat.ino });
    return handle;
  }
  fail('failed to acquire lock', 'ERR_RUNTIME_BUSY');
}

async function releaseLock(handle) {
  if (!handle) return;
  const tracked = inProcessLocks.get(handle.lockPath);
  const trackedOwner = tracked?.token === handle.token && tracked.dev === handle.dev && tracked.ino === handle.ino;
  let ownershipReleased = false;
  let releaseError = null;
  try {
    let stat;
    try {
      stat = await lstat(handle.lockPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        ownershipReleased = true;
      } else {
        throw error;
      }
    }
    if (stat && stat.dev === handle.dev && stat.ino === handle.ino) {
      let parsed;
      try {
        parsed = JSON.parse(await readFile(handle.lockPath, 'utf8'));
      } catch (error) {
        throw new Error('owned lock record cannot be read during release', { cause: error });
      }
      if (parsed?.token === handle.token) {
        await unlink(handle.lockPath);
      }
      ownershipReleased = true;
    } else if (stat) {
      ownershipReleased = true;
    }
  } catch (error) {
    releaseError = error;
  } finally {
    try {
      await handle.fd.close();
    } catch (error) {
      releaseError ??= error;
    }
  }
  if (ownershipReleased && trackedOwner) {
    inProcessLocks.delete(handle.lockPath);
  }
  if (releaseError) {
    const error = new Error('runtime lock release did not complete', { cause: releaseError });
    error.code = 'ERR_RUNTIME_LOCK_RELEASE';
    throw error;
  }
}

async function withStateLock(runtimeRoot, epoch, fn) {
  const rootIdentity = await validateRuntimeRoot(runtimeRoot);
  const lockPath = join(runtimeRoot, 'state.lock');
  const handle = await acquireLock(lockPath, epoch, { isStateLock: true });
  try {
    await assertRuntimeRootIdentity(runtimeRoot, rootIdentity, 'runtime directory replaced while state lock held');
    await assertLockOwnership(handle, epoch);
    const result = await fn({ rootIdentity, lockHandle: handle });
    await assertRuntimeRootIdentity(runtimeRoot, rootIdentity, 'runtime directory replaced while state lock held');
    await assertLockOwnership(handle, epoch);
    return result;
  } finally {
    await releaseLock(handle);
  }
}

function isPrintableRequestKey(key) {
  if (typeof key !== 'string' || key.length < 1 || key.length > 128) return false;
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code < 32 || code > 126) return false;
  }
  return true;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function immutableCallbackView(value) {
  return deepFreeze(structuredClone(value));
}

function isValidBinding(binding) {
  return isPlainObject(binding) &&
    isNonEmptyString(binding.conversationId) &&
    isNonEmptyString(binding.userMessageId);
}

function validateStoredIntent(intent) {
  if (!isPlainObject(intent)) historyUnavailable('runtime intent is malformed');
  for (const field of [
    'job_id', 'turn_id', 'output_root', 'job_root', 'model_family', 'effort',
    'prompt_sha256', 'prompt', 'template_id', 'template_version'
  ]) {
    if (typeof intent[field] !== 'string' || (field !== 'prompt' && intent[field].length === 0)) {
      historyUnavailable(`runtime intent ${field} is invalid`);
    }
  }
  if (!isAbsolute(intent.output_root) || !isAbsolute(intent.job_root)) {
    historyUnavailable('runtime intent paths must be absolute');
  }
  if (Buffer.byteLength(intent.prompt, 'utf8') > MAX_PROMPT_BYTES) {
    historyUnavailable('runtime intent prompt exceeds size limit');
  }
}

function validateSnapshot(state, expectedEpoch) {
  if (!isPlainObject(state)) historyUnavailable('runtime state is not a plain object');
  if (state.schema !== RUNTIME_STATE_SCHEMA) historyUnavailable('runtime state schema is unsupported');
  if (typeof expectedEpoch !== 'string' || expectedEpoch.length === 0) {
    fail('runtime expected epoch is required', 'ERR_RUNTIME_EPOCH');
  }
  if (typeof state.epoch !== 'string' || state.epoch.length === 0) {
    historyUnavailable('runtime state missing epoch');
  }
  if (state.epoch !== expectedEpoch) {
    fail(`runtime epoch mismatch: expected ${expectedEpoch}, got ${state.epoch}`, 'ERR_RUNTIME_EPOCH');
  }
  if (!Number.isInteger(state.capacity) || state.capacity < 1 || state.capacity > 4) {
    historyUnavailable('runtime state capacity must be integer 1 to 4');
  }
  if (!Number.isInteger(state.revision) || state.revision < 0) {
    historyUnavailable('runtime state revision must be non-negative integer');
  }
  if (!Number.isInteger(state.arrival_counter) || state.arrival_counter < 0) {
    historyUnavailable('runtime state arrival counter must be a non-negative integer');
  }
  if (!isPlainObject(state.pacing)) historyUnavailable('runtime state pacing is malformed');
  for (const field of ['last_attempt_at', 'cooldown_until']) {
    const value = state.pacing[field];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
      historyUnavailable(`runtime pacing ${field} is invalid`);
    }
  }
  if (!Array.isArray(state.reservations)) historyUnavailable('runtime state reservations must be an array');
  if (!isPlainObject(state.operations)) historyUnavailable('runtime state operations must be a plain object');
  if (!isPlainObject(state.key_map)) historyUnavailable('runtime state key_map must be a plain object');
  if (!isPlainObject(state.intents)) historyUnavailable('runtime state intents must be a plain object');

  const operationEntries = Object.entries(state.operations);
  if (operationEntries.length > MAX_OPERATIONS) historyUnavailable('runtime operations exceed limit');
  if (Object.keys(state.key_map).length !== operationEntries.length || Object.keys(state.intents).length !== operationEntries.length) {
    historyUnavailable('runtime key, intent, and operation histories do not correspond');
  }

  const reservationSet = new Set();
  for (const opRef of state.reservations) {
    if (!isNonEmptyString(opRef) || reservationSet.has(opRef) || !Object.hasOwn(state.operations, opRef)) {
      historyUnavailable('runtime reservation is invalid or duplicated');
    }
    reservationSet.add(opRef);
  }
  if (reservationSet.size > state.capacity) historyUnavailable('runtime reservations exceed capacity');

  const arrivalSequences = new Set();
  const mappedOperations = new Set();
  for (const [mapKey, opRef] of Object.entries(state.key_map)) {
    if (!mapKey.startsWith('rk:') || !isPrintableRequestKey(mapKey.slice(3)) || !isNonEmptyString(opRef)) {
      historyUnavailable('runtime request-key mapping is malformed');
    }
    if (!Object.hasOwn(state.operations, opRef) || mappedOperations.has(opRef)) {
      historyUnavailable('runtime request-key mapping is missing, redirected, or duplicated');
    }
    const op = state.operations[opRef];
    if (!isPlainObject(op) || mapKey !== `rk:${op.request_key}`) {
      historyUnavailable('runtime request-key mapping disagrees with operation');
    }
    mappedOperations.add(opRef);
  }

  let operationRevisionTotal = 0;
  for (const [opRef, op] of operationEntries) {
    if (!isPlainObject(op) || op.operation_ref !== opRef || !/^op_[a-f0-9]{32}$/.test(opRef)) {
      historyUnavailable('operation entry is malformed');
    }
    if (!/^job_[a-f0-9]{32}$/.test(op.job_ref ?? '') || !isPrintableRequestKey(op.request_key)) {
      historyUnavailable('operation identity is malformed');
    }
    if (!Number.isInteger(op.revision) || op.revision < 1) historyUnavailable('operation revision must be positive integer');
    if (!PHASES.has(op.phase)) historyUnavailable('operation phase invalid');
    if (!EFFECTS.has(op.submission_effect)) historyUnavailable('operation submission effect invalid');
    if (!PRIORITIES.has(op.priority)) historyUnavailable('operation priority invalid');
    if (!Number.isInteger(op.arrival_sequence) || op.arrival_sequence < 1 || op.arrival_sequence > state.arrival_counter || arrivalSequences.has(op.arrival_sequence)) {
      historyUnavailable('operation arrival sequence invalid or duplicated');
    }
    arrivalSequences.add(op.arrival_sequence);
    operationRevisionTotal += op.revision;

    if (!Object.hasOwn(state.intents, opRef)) historyUnavailable('operation intent history is missing');
    const storedIntent = state.intents[opRef];
    validateStoredIntent(storedIntent);
    validateStoredIntent(op.intent);
    if (canonicalJson(storedIntent) !== canonicalJson(op.intent)) {
      historyUnavailable('operation immutable intent disagrees with intent history');
    }

    const reserved = reservationSet.has(opRef);
    const bindingValid = isValidBinding(op.binding);
    const observationEvidenceValid = op.observation_evidence_ref === null || isNonEmptyString(op.observation_evidence_ref);
    const combinationValid =
      (op.phase === 'queued' && op.submission_effect === 'known_unsent' && !reserved && op.binding === null && op.evidence_ref === null && op.observation_evidence_ref === null && op.attention === null) ||
      (op.phase === 'dispatching' && op.submission_effect === 'unknown' && reserved && op.binding === null && op.evidence_ref === null && op.observation_evidence_ref === null && op.attention === null) ||
      (op.phase === 'observing' && op.submission_effect === 'accepted' && reserved && bindingValid && observationEvidenceValid && op.attention === null) ||
      (op.phase === 'collecting' && op.submission_effect === 'accepted' && !reserved && bindingValid && isNonEmptyString(op.observation_evidence_ref) && op.attention === null) ||
      (op.phase === 'settled' && op.submission_effect === 'accepted' && !reserved && bindingValid && isNonEmptyString(op.observation_evidence_ref) && isNonEmptyString(op.attention));
    if (!combinationValid) historyUnavailable('operation phase, effect, reservation, and binding disagree');
    if (op.submission_effect === 'accepted' && !isNonEmptyString(op.evidence_ref)) {
      historyUnavailable('accepted operation is missing effect evidence');
    }
  }

  if (mappedOperations.size !== operationEntries.length || arrivalSequences.size !== state.arrival_counter) {
    historyUnavailable('runtime operation history is incomplete');
  }
  for (const opRef of Object.keys(state.intents)) {
    if (!Object.hasOwn(state.operations, opRef)) historyUnavailable('orphaned runtime intent found');
  }
  if (operationRevisionTotal !== state.revision) historyUnavailable('runtime and operation revisions disagree');
  return state;
}

async function readSnapshot(runtimeRoot, expectedEpoch) {
  const rootIdentity = await validateRuntimeRoot(runtimeRoot);
  const finalPath = join(runtimeRoot, 'runtime-state.json');
  const { text } = await readOwnedRegularFile(finalPath, 'runtime state unavailable or untrusted', MAX_SNAPSHOT_BYTES);
  await assertRuntimeRootIdentity(runtimeRoot, rootIdentity, 'runtime directory replaced while reading state');
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    fail('runtime state is corrupt', 'ERR_RUNTIME_HISTORY_UNAVAILABLE');
  }
  return validateSnapshot(state, expectedEpoch);
}

function durabilityFailure(message, cause) {
  const error = new Error(message, { cause });
  error.code = 'ERR_RUNTIME_DURABILITY';
  throw error;
}

async function confirmDirectoryDurability(runtimeRoot, rootIdentity) {
  let dirFd;
  try {
    dirFd = await open(runtimeRoot, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const dirStat = await dirFd.stat();
    if (!dirStat.isDirectory() || !ownedByCurrentUser(dirStat) || !sameIdentity(dirStat, rootIdentity)) {
      fail('runtime directory identity changed during durability check', 'ERR_RUNTIME_ROOT_REPLACED');
    }
    await dirFd.sync();
  } catch (error) {
    if (error?.code?.startsWith('ERR_RUNTIME_')) throw error;
    durabilityFailure('runtime snapshot directory could not be synchronized', error);
  } finally {
    await dirFd?.close().catch(() => {});
  }
}

async function saveSnapshotAtomically(runtimeRoot, state, guards = {}) {
  const rootIdentity = guards.rootIdentity ?? await validateRuntimeRoot(runtimeRoot);
  validateSnapshot(state, guards.epoch ?? state.epoch);
  const payload = canonicalJson(state) + '\n';
  const payloadBytes = Buffer.from(payload, 'utf8');
  if (payloadBytes.byteLength > MAX_SNAPSHOT_BYTES) {
    fail('snapshot exceeds 16MiB limit', 'ERR_RUNTIME_SNAPSHOT_SIZE');
  }
  const tmpPath = join(runtimeRoot, `runtime-state.json.tmp.${randomUUID()}`);
  const finalPath = join(runtimeRoot, 'runtime-state.json');
  let fd;
  try {
    fd = await open(tmpPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    const tmpStat = await fd.stat();
    if (!tmpStat.isFile() || !ownedByCurrentUser(tmpStat)) historyUnavailable('temporary runtime state file is untrusted');
    await fd.writeFile(payloadBytes);
    await fd.sync();
  } catch (error) {
    if (error?.code?.startsWith('ERR_RUNTIME_')) throw error;
    durabilityFailure('runtime snapshot file could not be synchronized', error);
  } finally {
    await fd?.close().catch(() => {});
  }

  await assertRuntimeRootIdentity(runtimeRoot, rootIdentity, 'runtime directory replaced before state publication');
  if (guards.lockHandle) await assertLockOwnership(guards.lockHandle, guards.epoch ?? state.epoch);
  if (guards.effectHandle) await assertLockOwnership(guards.effectHandle, guards.epoch ?? state.epoch);
  try {
    await rename(tmpPath, finalPath);
  } catch (error) {
    durabilityFailure('runtime snapshot could not be published', error);
  }

  await confirmDirectoryDurability(runtimeRoot, rootIdentity);

  await assertRuntimeRootIdentity(runtimeRoot, rootIdentity, 'runtime directory replaced after state publication');
  if (guards.lockHandle) await assertLockOwnership(guards.lockHandle, guards.epoch ?? state.epoch);
  if (guards.effectHandle) await assertLockOwnership(guards.effectHandle, guards.epoch ?? state.epoch);
}

function validateRequestKey(key) {
  if (!isPrintableRequestKey(key)) {
    fail('requestKey must be 1-128 printable ASCII characters', 'ERR_RUNTIME_REQUEST_KEY');
  }
}

function checkAuthorization(context, candidate) {
  const priority = candidate.priority ?? 'normal';
  if (!PRIORITIES.has(priority)) {
    fail('invalid priority level', 'ERR_RUNTIME_PRIORITY');
  }
  const authorizeFn = context?.authorize ?? ((op) => op.priority === 'normal');
  let authResult;
  try {
    authResult = authorizeFn(immutableCallbackView(candidate));
  } catch {
    authResult = false;
  }
  if (authResult !== true) {
    fail('operation not authorized for admission', 'ERR_RUNTIME_UNAUTHORIZED');
  }
}

function validateRuntimeDescriptor(runtime) {
  if (!runtime || typeof runtime.root !== 'string' || !isAbsolute(runtime.root)) {
    fail('runtime root must be an absolute path', 'ERR_RUNTIME_ROOT');
  }
  if (typeof runtime.epoch !== 'string' || runtime.epoch.length === 0) {
    fail('runtime expected epoch is required', 'ERR_RUNTIME_EPOCH');
  }
}

function checkDispatchGate(context, name, candidate) {
  const fallback = name === 'authorize' ? ((op) => op.priority === 'normal') : (() => false);
  const callback = typeof context?.[name] === 'function' ? context[name] : fallback;
  try {
    return callback(immutableCallbackView(candidate)) === true;
  } catch {
    return false;
  }
}

export async function initializeStandardRuntime({ root, capacity = 4 } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) {
    fail('root must be an absolute path', 'ERR_RUNTIME_ROOT');
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) {
    fail('capacity must be an integer between 1 and 4', 'ERR_RUNTIME_CAPACITY');
  }
  let rootStat = null;
  try {
    rootStat = await lstat(root);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  if (rootStat) {
    fail('runtime root already exists', 'ERR_RUNTIME_ROOT_EXISTS');
  }
  const parentDir = dirname(root);
  let parentStat;
  try {
    parentStat = await lstat(parentDir);
  } catch {
    fail('parent directory does not exist', 'ERR_RUNTIME_ROOT_PARENT');
  }
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory() || !ownedByCurrentUser(parentStat)) {
    fail('parent is not a regular directory', 'ERR_RUNTIME_ROOT_PARENT');
  }
  try {
    await mkdir(root, { recursive: false });
  } catch (err) {
    if (err?.code === 'EEXIST') {
      fail('runtime root already exists', 'ERR_RUNTIME_ROOT_EXISTS');
    }
    throw err;
  }

  const runtime_epoch = randomUUID();
  const initialState = {
    schema: RUNTIME_STATE_SCHEMA,
    epoch: runtime_epoch,
    revision: 0,
    capacity,
    key_map: {},
    intents: {},
    operations: {},
    reservations: [],
    pacing: {
      last_attempt_at: null,
      cooldown_until: null
    },
    arrival_counter: 0
  };
  await saveSnapshotAtomically(root, initialState);
  return { runtime_epoch, capacity };
}

export async function inspectStandardRuntime({ runtime, operationRef, requestKey } = {}) {
  validateRuntimeDescriptor(runtime);
  await validateRuntimeRoot(runtime.root);
  const state = await readSnapshot(runtime.root, runtime.epoch);
  const occupied = (state.reservations ?? []).length;
  let ops = Object.values(state.operations ?? {});
  if (operationRef) {
    ops = ops.filter((o) => o.operation_ref === operationRef);
  }
  if (requestKey) {
    ops = ops.filter((o) => o.request_key === requestKey);
  }
  const operations = ops.map((o) => ({
    operation_ref: o.operation_ref,
    job_ref: o.job_ref,
    revision: o.revision,
    phase: o.phase,
    submission_effect: o.submission_effect,
    priority: o.priority,
    arrival_sequence: o.arrival_sequence,
    intent: o.intent,
    binding: o.binding,
    observation_evidence_ref: o.observation_evidence_ref,
    attention: o.attention ?? null
  }));
  return {
    runtime_epoch: state.epoch,
    revision: state.revision,
    capacity: state.capacity,
    occupied,
    operations
  };
}

export async function admitStandardJob({ runtime, outputRoot, bundle, requestKey, context } = {}) {
  validateRuntimeDescriptor(runtime);
  await validateRuntimeRoot(runtime.root);
  validateRequestKey(requestKey);
  if (typeof bundle?.prompt === 'string' && Buffer.byteLength(bundle.prompt, 'utf8') > MAX_PROMPT_BYTES) {
    fail('prompt exceeds 1MiB limit', 'ERR_RUNTIME_PROMPT_LIMIT');
  }
  return await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
    const state = await readSnapshot(runtime.root, runtime.epoch);
    const intent = {
      job_id: bundle.job_id,
      turn_id: bundle.turn_id,
      output_root: outputRoot,
      job_root: bundle.job_root,
      model_family: bundle.model_family,
      effort: bundle.effort,
      prompt_sha256: bundle.prompt_sha256,
      prompt: bundle.prompt,
      template_id: bundle.template_id,
      template_version: bundle.template_version
    };

    const mapKey = 'rk:' + requestKey;
    if (Object.hasOwn(state.key_map, mapKey)) {
      const existingRef = state.key_map[mapKey];
      const existingOp = state.operations[existingRef];
      const existingIntent = state.intents[existingRef];
      const same = Boolean(existingIntent && canonicalJson(intent) === canonicalJson(existingIntent));
      if (!same) {
        fail('duplicate requestKey with conflicting intent', 'ERR_RUNTIME_REQUEST_KEY_CONFLICT');
      }
      checkAuthorization(context, existingOp);
      await confirmDirectoryDurability(runtime.root, ownership.rootIdentity);
      return {
        admission: 'existing',
        runtime_epoch: state.epoch,
        job_ref: existingOp.job_ref,
        operation_ref: existingOp.operation_ref,
        revision: existingOp.revision,
        phase: existingOp.phase,
        submission_effect: existingOp.submission_effect,
        attention: existingOp.attention ?? null
      };
    }

    if (Object.keys(state.operations).length >= MAX_OPERATIONS) {
      fail('maximum operations limit reached', 'ERR_RUNTIME_CAPACITY_EXCEEDED');
    }

    const priority = context?.priority ?? 'normal';
    checkAuthorization(context, { priority, intent });

    const job_ref = `job_${randomUUID().replace(/-/g, '')}`;
    const operation_ref = `op_${randomUUID().replace(/-/g, '')}`;
    state.arrival_counter = (state.arrival_counter ?? 0) + 1;
    const op = {
      operation_ref,
      job_ref,
      request_key: requestKey,
      revision: 1,
      phase: 'queued',
      submission_effect: 'known_unsent',
      priority,
      arrival_sequence: state.arrival_counter,
      intent,
      binding: null,
      evidence_ref: null,
      observation_evidence_ref: null,
      attention: null
    };

    state.key_map[mapKey] = operation_ref;
    state.intents[operation_ref] = intent;
    state.operations[operation_ref] = op;
    state.revision = (state.revision ?? 0) + 1;
    await saveSnapshotAtomically(runtime.root, state, { ...ownership, epoch: runtime.epoch });

    return {
      admission: 'accepted',
      runtime_epoch: state.epoch,
      job_ref,
      operation_ref,
      revision: 1,
      phase: 'queued',
      submission_effect: 'known_unsent',
      attention: null
    };
  });
}

export async function dispatchNextStandard({ runtime, context, driver } = {}) {
  validateRuntimeDescriptor(runtime);
  const initialRootStat = await validateRuntimeRoot(runtime.root);
  const rootDev = initialRootStat.dev;
  const rootIno = initialRootStat.ino;

  const effectLockPath = join(runtime.root, 'effect.lock');
  const effectHandle = await acquireLock(effectLockPath, runtime.epoch, { isStateLock: false });
  try {
    let state = await readSnapshot(runtime.root, runtime.epoch);
    const occupied = (state.reservations ?? []).length;
    if (occupied >= state.capacity) {
      return { status: 'idle', operation_ref: null, reason: 'capacity_full', snapshot: null };
    }

    const eligible = Object.values(state.operations ?? {}).filter(
      (o) => o.phase === 'queued' && o.submission_effect === 'known_unsent'
    );
    if (eligible.length === 0) {
      return { status: 'idle', operation_ref: null, reason: 'no_queued_work', snapshot: null };
    }

    const priorityRank = { high: 0, normal: 1, background: 2 };
    eligible.sort((a, b) => {
      const pDiff = (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
      if (pDiff !== 0) return pDiff;
      return a.arrival_sequence - b.arrival_sequence;
    });

    let selectedOp = null;
    let preparedTarget = null;
    for (const cand of eligible) {
      if (!checkDispatchGate(context, 'authorize', cand)) continue;
      if (!checkDispatchGate(context, 'deliveryReady', cand)) continue;

      if (typeof driver?.prepare !== 'function') {
        fail('driver.prepare is required', 'ERR_RUNTIME_DRIVER');
      }
      let prep;
      try {
        prep = await driver.prepare(immutableCallbackView(cand));
      } catch {
        continue;
      }
      if (prep?.status === 'held') continue;
      const targetPresent = prep?.target !== undefined && prep?.target !== null &&
        (typeof prep.target !== 'string' || prep.target.trim().length > 0);
      if (prep?.status === 'ready' && targetPresent && isNonEmptyString(prep.evidenceRef)) {
        selectedOp = cand;
        preparedTarget = prep.target;
        break;
      }
    }

    const postPrepRootStat = await lstat(runtime.root).catch(() => null);
    if (!postPrepRootStat || postPrepRootStat.isSymbolicLink() || !postPrepRootStat.isDirectory() || postPrepRootStat.dev !== rootDev || postPrepRootStat.ino !== rootIno) {
      fail('runtime directory replaced during dispatch preparation', 'ERR_RUNTIME_ROOT_REPLACED');
    }
    const postPrepLockStat = await lstat(effectHandle.lockPath).catch(() => null);
    if (!postPrepLockStat || postPrepLockStat.dev !== effectHandle.dev || postPrepLockStat.ino !== effectHandle.ino) {
      fail('effect lock replaced during dispatch preparation', 'ERR_RUNTIME_OWNER_UNRESOLVED');
    }

    if (!selectedOp) {
      return { status: 'held', operation_ref: null, reason: 'work_held_or_gated', snapshot: null };
    }

    let r = typeof context?.random === 'function' ? context.random() : Math.random();
    if (typeof r !== 'number' || !Number.isFinite(r) || r < 0 || r >= 1) r = 0;
    const jitter = Math.floor(r * 1001);
    const quietPeriod = 4000 + jitter;
    let waitMs = quietPeriod;
    const defaultClock = {
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    };
    const clock = {
      now: typeof context?.clock?.now === 'function' ? () => context.clock.now() : defaultClock.now,
      sleep: typeof context?.clock?.sleep === 'function' ? (ms) => context.clock.sleep(ms) : defaultClock.sleep
    };
    const currentNow = clock.now();
    if (state.pacing?.cooldown_until && state.pacing.cooldown_until > currentNow) {
      const remaining = state.pacing.cooldown_until - currentNow;
      if (remaining > waitMs) waitMs = remaining;
    }
    await clock.sleep(waitMs);

    const postPacingRootStat = await lstat(runtime.root).catch(() => null);
    if (!postPacingRootStat || postPacingRootStat.isSymbolicLink() || !postPacingRootStat.isDirectory() || postPacingRootStat.dev !== rootDev || postPacingRootStat.ino !== rootIno) {
      fail('runtime directory replaced during pacing', 'ERR_RUNTIME_ROOT_REPLACED');
    }
    const postPacingLockStat = await lstat(effectHandle.lockPath).catch(() => null);
    if (!postPacingLockStat || postPacingLockStat.dev !== effectHandle.dev || postPacingLockStat.ino !== effectHandle.ino) {
      fail('effect lock replaced during pacing', 'ERR_RUNTIME_OWNER_UNRESOLVED');
    }

    if (!checkDispatchGate(context, 'authorize', selectedOp)) {
      return { status: 'held', operation_ref: null, reason: 'authorization_revoked', snapshot: null };
    }
    if (!checkDispatchGate(context, 'deliveryReady', selectedOp)) {
      return { status: 'held', operation_ref: null, reason: 'delivery_gate_revoked', snapshot: null };
    }

    if (typeof driver?.send !== 'function') {
      fail('driver.send is required', 'ERR_RUNTIME_DRIVER');
    }

    await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
      state = await readSnapshot(runtime.root, runtime.epoch);
      const opToReserve = state.operations[selectedOp.operation_ref];
      opToReserve.phase = 'dispatching';
      opToReserve.submission_effect = 'unknown';
      opToReserve.revision = (opToReserve.revision ?? 1) + 1;
      state.revision = (state.revision ?? 0) + 1;
      if (!state.reservations.includes(opToReserve.operation_ref)) {
        state.reservations.push(opToReserve.operation_ref);
      }
      state.pacing = state.pacing ?? {};
      state.pacing.last_attempt_at = clock.now();
      await saveSnapshotAtomically(runtime.root, state, {
        ...ownership,
        effectHandle,
        epoch: runtime.epoch
      });
    });

    const preSendRootStat = await lstat(runtime.root).catch(() => null);
    if (!preSendRootStat || preSendRootStat.dev !== rootDev || preSendRootStat.ino !== rootIno) {
      fail('runtime directory replaced before send', 'ERR_RUNTIME_ROOT_REPLACED');
    }
    await assertLockOwnership(effectHandle, runtime.epoch);
    const sendResult = await driver.send(
      immutableCallbackView(state.operations[selectedOp.operation_ref]),
      preparedTarget
    );
    const binding = sendResult?.binding;
    if (
      sendResult?.status !== 'accepted' ||
      !binding ||
      typeof binding !== 'object' ||
      typeof binding.conversationId !== 'string' ||
      binding.conversationId.trim().length === 0 ||
      typeof binding.userMessageId !== 'string' ||
      binding.userMessageId.trim().length === 0 ||
      typeof sendResult?.evidenceRef !== 'string' ||
      sendResult.evidenceRef.trim().length === 0
    ) {
      fail('driver send returned malformed acceptance or missing identifiers', 'ERR_RUNTIME_DRIVER_SEND');
    }

    await assertRuntimeRootIdentity(runtime.root, initialRootStat, 'runtime directory replaced after send');
    await assertLockOwnership(effectHandle, runtime.epoch);

    let acceptedSnapshot;
    await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
      state = await readSnapshot(runtime.root, runtime.epoch);
      const opAccepted = state.operations[selectedOp.operation_ref];
      opAccepted.phase = 'observing';
      opAccepted.submission_effect = 'accepted';
      opAccepted.binding = {
        conversationId: binding.conversationId,
        userMessageId: binding.userMessageId
      };
      opAccepted.evidence_ref = sendResult.evidenceRef;
      opAccepted.revision = (opAccepted.revision ?? 1) + 1;
      state.revision = (state.revision ?? 0) + 1;
      await saveSnapshotAtomically(runtime.root, state, {
        ...ownership,
        effectHandle,
        epoch: runtime.epoch
      });
      acceptedSnapshot = state;
    });

    return {
      status: 'dispatched',
      operation_ref: selectedOp.operation_ref,
      reason: null,
      snapshot: acceptedSnapshot
    };
  } finally {
    await releaseLock(effectHandle);
  }
}

export async function recordStandardObservation({ runtime, operationRef, expectedRevision, observation, context } = {}) {
  validateRuntimeDescriptor(runtime);
  await validateRuntimeRoot(runtime.root);
  return await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
    const state = await readSnapshot(runtime.root, runtime.epoch);
    const op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
    if (!op) {
      fail(`operation ${operationRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
    }
    if (op.phase !== 'observing') {
      fail(`operation phase is ${op.phase}, observation rejected`, 'ERR_RUNTIME_PHASE_INVALID');
    }
    if (op.submission_effect !== 'accepted') {
      fail(`operation effect is ${op.submission_effect}, observation rejected`, 'ERR_RUNTIME_EFFECT_INVALID');
    }
    if (typeof expectedRevision !== 'number' || op.revision !== expectedRevision) {
      fail(`revision conflict: expected ${expectedRevision}, found ${op.revision}`, 'ERR_RUNTIME_REVISION_CONFLICT');
    }
    if (!op.binding || observation?.conversationId !== op.binding.conversationId || observation?.userMessageId !== op.binding.userMessageId) {
      fail('observation binding mismatch', 'ERR_RUNTIME_BINDING');
    }
    if (!['running', 'completed', 'failed'].includes(observation?.status)) {
      fail('invalid observation status', 'ERR_RUNTIME_OBSERVATION_STATUS');
    }
    if (!isNonEmptyString(observation?.evidenceRef)) {
      fail('observation evidenceRef is required', 'ERR_RUNTIME_OBSERVATION_EVIDENCE');
    }
    op.observation_evidence_ref = observation.evidenceRef;
    if (observation.status === 'completed') {
      op.phase = 'collecting';
      state.reservations = (state.reservations ?? []).filter((id) => id !== op.operation_ref);
    } else if (observation.status === 'failed') {
      op.phase = 'settled';
      op.attention = observation.attention ?? observation.reason ?? 'failed';
      state.reservations = (state.reservations ?? []).filter((id) => id !== op.operation_ref);
    }
    op.revision = (op.revision ?? 1) + 1;
    state.revision = (state.revision ?? 0) + 1;
    await saveSnapshotAtomically(runtime.root, state, { ...ownership, epoch: runtime.epoch });
    return {
      operation_ref: op.operation_ref,
      job_ref: op.job_ref,
      revision: op.revision,
      phase: op.phase,
      submission_effect: op.submission_effect,
      binding: op.binding,
      observation_evidence_ref: op.observation_evidence_ref,
      attention: op.attention ?? null
    };
  });
}
