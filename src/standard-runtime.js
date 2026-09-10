import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, sep } from 'node:path';
import { canonicalJson } from './canonical-json.js';
import { humanControlActive } from './human-control.js';

const RUNTIME_STATE_SCHEMA = 'standard.runtime-state.v1';
const PRIORITIES = new Set(['high', 'normal', 'background']);
const PHASES = new Set(['queued', 'dispatching', 'observing', 'collecting', 'settled']);
const EFFECTS = new Set(['known_unsent', 'unknown', 'accepted']);
const KINDS = new Set(['initial', 'continuation']);
const MAX_OPERATIONS = 256;
const MAX_PROMPT_BYTES = 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const MAX_LOCK_RECORD_BYTES = 4096;
const HASH = /^[0-9a-f]{64}$/;
const PREPARED_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RESOURCE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;

const fail = (message, code = 'ERR_RUNTIME_INTERNAL') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const inProcessLocks = new Map();
const activeEffectHandles = new Map();

function historyUnavailable(message) {
  fail(message, 'ERR_RUNTIME_HISTORY_UNAVAILABLE');
}

function ownedByCurrentUser(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

function sameIdentity(stat, expected) {
  return Boolean(stat && expected && stat.dev === expected.dev && stat.ino === expected.ino);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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
  await assertNoSymlinkAncestors(root);
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

async function assertNoSymlinkAncestors(path) {
  const root = parse(path).root;
  const parts = path.slice(root.length).split(sep).filter((part) => part.length > 0);
  if (parts.some((part) => part === '.' || part === '..')) {
    fail('runtime path must not contain dot traversal', 'ERR_RUNTIME_ROOT');
  }
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = current === root ? `${root}${part}` : `${current}${sep}${part}`;
    const stat = await lstat(current).catch(() => null);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
      fail('runtime path ancestor must be a regular directory', 'ERR_RUNTIME_ROOT');
    }
  }
}

async function assertRuntimeRootIdentity(root, expected, message) {
  const current = await validateRuntimeRoot(root).catch(() => null);
  if (!sameIdentity(current, expected)) {
    fail(message, 'ERR_RUNTIME_ROOT_REPLACED');
  }
}

async function assertOwnedDirectoryIdentity(path, expected, message, code) {
  const current = await lstat(path).catch(() => null);
  if (
    !current ||
    current.isSymbolicLink() ||
    !current.isDirectory() ||
    !ownedByCurrentUser(current) ||
    !sameIdentity(current, expected)
  ) {
    fail(message, code);
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
    if (!stat.isFile() || !ownedByCurrentUser(stat) || stat.size > MAX_LOCK_RECORD_BYTES) {
      fail('lock owner file is not a regular owned file', 'ERR_RUNTIME_OWNER_UNRESOLVED');
    }
    let record;
    try {
      record = JSON.parse(await readBoundedText(fd, MAX_LOCK_RECORD_BYTES));
    } catch {
      fail('lock owner file is corrupt', 'ERR_RUNTIME_OWNER_UNRESOLVED');
    }
    return { record, stat };
  } finally {
    await fd.close().catch(() => {});
  }
}

async function readBoundedText(fd, limit) {
  const bytes = Buffer.alloc(limit + 1);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await fd.read(bytes, offset, bytes.length - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > limit) fail('lock owner file exceeds size limit', 'ERR_RUNTIME_OWNER_UNRESOLVED');
  return bytes.subarray(0, offset).toString('utf8');
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

function lifecycleFailure(message, primaryError, cleanupError, code = 'ERR_RUNTIME_LOCK_RELEASE') {
  const error = new Error(message, { cause: new AggregateError([primaryError, cleanupError]) });
  error.code = code;
  return error;
}

async function cleanupFailedLockCreation(lockPath, identity, directoryIdentity, fd, originalError, expectedRecord = null) {
  let cleanupError = null;
  let removed = false;
  let createdIdentity = identity;
  if (!createdIdentity) {
    try {
      createdIdentity = await fd.stat();
    } catch (error) {
      cleanupError = error;
    }
  }
  try {
    await fd.close();
  } catch (error) {
    cleanupError ??= error;
  }
  if (createdIdentity) {
    try {
      await assertOwnedDirectoryIdentity(
        dirname(lockPath),
        directoryIdentity,
        'lock directory changed during failed creation cleanup',
        'ERR_RUNTIME_OWNER_UNRESOLVED'
      );
      const current = await lstat(lockPath);
      if (!sameIdentity(current, createdIdentity) || !current.isFile() || !ownedByCurrentUser(current)) {
        fail('created lock ownership changed before cleanup', 'ERR_RUNTIME_OWNER_UNRESOLVED');
      }
      if (expectedRecord) {
        let record;
        let recordStat;
        try {
          ({ record, stat: recordStat } = await readLockRecord(lockPath));
        } catch {
          fail('created lock record changed before cleanup', 'ERR_RUNTIME_OWNER_UNRESOLVED');
        }
        if (
          !sameIdentity(recordStat, createdIdentity) ||
          !isPlainObject(record) ||
          record.token !== expectedRecord.token ||
          record.pid !== expectedRecord.pid ||
          record.epoch !== expectedRecord.epoch ||
          record.dev !== expectedRecord.dev ||
          record.ino !== expectedRecord.ino
        ) fail('created lock record changed before cleanup', 'ERR_RUNTIME_OWNER_UNRESOLVED');
      }
      await unlink(lockPath);
      removed = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') cleanupError ??= error;
    }
  }
  if (removed) {
    try {
      await confirmDirectoryDurability(dirname(lockPath), directoryIdentity);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (cleanupError) {
    throw lifecycleFailure('failed initial lock publication could not be cleaned up', originalError, cleanupError);
  }
  throw originalError;
}

async function acquireLock(lockPath, epoch, { isStateLock = false } = {}) {
  const maxAttempts = isStateLock ? 30 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const lockDirectoryIdentity = await validateRuntimeRoot(dirname(lockPath));
    if (inProcessLocks.has(lockPath)) {
      const tracked = inProcessLocks.get(lockPath);
      if (tracked?.retirementUncertain === true) {
        const current = await lstat(lockPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
        if (current) fail('retired lock path was republished or replaced', 'ERR_RUNTIME_OWNER_UNRESOLVED');
        await confirmDirectoryDurability(dirname(lockPath), tracked.directoryIdentity);
        inProcessLocks.delete(lockPath);
      }
    }
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
        if (stat.size > MAX_LOCK_RECORD_BYTES) {
          fail('lock file exceeds size limit', 'ERR_RUNTIME_OWNER_UNRESOLVED');
        }
        try {
          const readHandle = await open(lockPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          let text;
          try {
            const openedStat = await readHandle.stat();
            if (!sameIdentity(openedStat, stat) || !openedStat.isFile() || !ownedByCurrentUser(openedStat) || openedStat.size > MAX_LOCK_RECORD_BYTES) {
              fail('lock file changed while reading', 'ERR_RUNTIME_OWNER_UNRESOLVED');
            }
            text = await readBoundedText(readHandle, MAX_LOCK_RECORD_BYTES);
          } finally {
            await readHandle.close().catch(() => {});
          }
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

    let stat;
    try {
      stat = await fd.stat();
    } catch (error) {
      await cleanupFailedLockCreation(lockPath, null, lockDirectoryIdentity, fd, error);
    }
    if (!stat.isFile() || !ownedByCurrentUser(stat)) {
      const error = new Error('new lock is not a regular owned file');
      error.code = 'ERR_RUNTIME_OWNER_UNRESOLVED';
      await cleanupFailedLockCreation(lockPath, stat, lockDirectoryIdentity, fd, error);
    }
    const token = randomUUID();
    const record = {
      pid: process.pid,
      token,
      epoch,
      dev: stat.dev,
      ino: stat.ino,
      acquired_at: Date.now()
    };
    const payload = JSON.stringify(record);
    try {
      await fd.writeFile(payload, 'utf8');
      await fd.sync();
    } catch (error) {
      await cleanupFailedLockCreation(lockPath, stat, lockDirectoryIdentity, fd, error);
    }
    const handle = { fd, lockPath, token, dev: stat.dev, ino: stat.ino, epoch, directoryIdentity: lockDirectoryIdentity };
    try {
      await assertLockOwnership(handle, epoch);
    } catch (error) {
      await cleanupFailedLockCreation(lockPath, stat, lockDirectoryIdentity, fd, error, record);
    }
    inProcessLocks.set(lockPath, { token, dev: stat.dev, ino: stat.ino, directoryIdentity: lockDirectoryIdentity });
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
  let directoryIdentity = null;
  let unlinked = false;
  try {
    directoryIdentity = handle.directoryIdentity;
    await assertOwnedDirectoryIdentity(
      dirname(handle.lockPath),
      directoryIdentity,
      'lock directory changed before release',
      'ERR_RUNTIME_OWNER_UNRESOLVED'
    );
    await assertLockOwnership(handle, handle.epoch);
    let pathStat;
    let pathRecord;
    try {
      ({ record: pathRecord, stat: pathStat } = await readLockRecord(handle.lockPath));
    } catch (error) {
      throw new Error('owned lock record cannot be read during release', { cause: error });
    }
    if (
      !sameIdentity(pathStat, handle) ||
      pathStat.isSymbolicLink() ||
      !pathStat.isFile() ||
      !ownedByCurrentUser(pathStat) ||
      !isPlainObject(pathRecord) ||
      pathRecord.token !== handle.token ||
      pathRecord.pid !== process.pid ||
      pathRecord.epoch !== handle.epoch ||
      pathRecord.dev !== handle.dev ||
      pathRecord.ino !== handle.ino
    ) fail('lock ownership changed before release', 'ERR_RUNTIME_OWNER_UNRESOLVED');
    await unlink(handle.lockPath);
    unlinked = true;
    await confirmDirectoryDurability(dirname(handle.lockPath), directoryIdentity);
    ownershipReleased = true;
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
  } else if (unlinked && trackedOwner && directoryIdentity) {
    inProcessLocks.set(handle.lockPath, {
      token: handle.token,
      dev: handle.dev,
      ino: handle.ino,
      retirementUncertain: true,
      directoryIdentity
    });
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
  let workError = null;
  try {
    await assertRuntimeRootIdentity(runtimeRoot, rootIdentity, 'runtime directory replaced while state lock held');
    await assertLockOwnership(handle, epoch);
    const result = await fn({ rootIdentity, lockHandle: handle });
    await assertRuntimeRootIdentity(runtimeRoot, rootIdentity, 'runtime directory replaced while state lock held');
    await assertLockOwnership(handle, epoch);
    return result;
  } catch (error) {
    workError = error;
    throw error;
  } finally {
    try {
      await releaseLock(handle);
    } catch (cleanupError) {
      if (workError) throw lifecycleFailure('runtime state work and lock release both failed', workError, cleanupError);
      throw cleanupError;
    }
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

function isCanonicalUtcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function createPreparedIntent(bundle, outputRoot) {
  const provenance = {
    events: bundle.events,
    current: bundle.current
  };
  return {
    prepared_schema: bundle.current.schema,
    caller: bundle.current.job.caller,
    created_at: bundle.current.job.created_at,
    prepared_at: bundle.current.turn.prepared_at,
    job_id: bundle.job_id,
    turn_id: bundle.turn_id,
    output_root: outputRoot,
    job_root: bundle.job_root,
    mode: bundle.mode,
    mode_reason: bundle.mode_reason,
    model_family: bundle.model_family,
    effort: bundle.effort,
    prompt_sha256: bundle.prompt_sha256,
    prompt: bundle.prompt,
    template_id: bundle.template_id,
    template_version: bundle.template_version,
    template_sha256: bundle.template_sha256,
    template_body_sha256: bundle.template_body_sha256,
    rigor_protocol_id: bundle.rigor_protocol_id,
    rigor_protocol_version: bundle.rigor_protocol_version,
    rigor_profile_id: bundle.rigor_profile_id,
    rigor_profile_version: bundle.rigor_profile_version,
    rigor_profile_sha256: bundle.rigor_profile_sha256,
    citation_level: bundle.citation_level,
    audit_appendix: bundle.audit_appendix,
    prepared_provenance_sha256: sha256(canonicalJson(provenance))
  };
}

function validateStoredIntent(intent) {
  if (!isPlainObject(intent)) historyUnavailable('runtime intent is malformed');
  for (const field of [
    'prepared_schema', 'caller', 'created_at', 'prepared_at', 'job_id', 'turn_id',
    'output_root', 'job_root', 'mode', 'mode_reason', 'model_family', 'effort',
    'prompt_sha256', 'prompt', 'template_id', 'template_version', 'template_sha256',
    'template_body_sha256', 'rigor_protocol_id', 'rigor_protocol_version',
    'rigor_profile_id', 'rigor_profile_version', 'rigor_profile_sha256',
    'citation_level', 'prepared_provenance_sha256'
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
  for (const field of [
    'prompt_sha256', 'template_sha256', 'template_body_sha256',
    'rigor_profile_sha256', 'prepared_provenance_sha256'
  ]) {
    if (!HASH.test(intent[field])) historyUnavailable(`runtime intent ${field} is invalid`);
  }
  if (sha256(intent.prompt) !== intent.prompt_sha256) {
    historyUnavailable('runtime intent prompt disagrees with its digest');
  }
  if (
    intent.prepared_schema !== 'standard.prepared.v2' ||
    intent.mode !== 'standard' ||
    intent.model_family !== 'gpt-5.6-pro' ||
    !['standard', 'extended'].includes(intent.effort) ||
    intent.caller !== 'codex' ||
    !PREPARED_ID.test(intent.job_id) ||
    !PREPARED_ID.test(intent.turn_id) ||
    !RESOURCE_ID.test(intent.template_id) ||
    !VERSION.test(intent.template_version) ||
    !RESOURCE_ID.test(intent.rigor_profile_id) ||
    !VERSION.test(intent.rigor_profile_version) ||
    intent.rigor_protocol_id !== 'chatgpt-research-epistemic' ||
    intent.rigor_protocol_version !== '1.0.0' ||
    !['principal', 'expanded'].includes(intent.citation_level) ||
    intent.created_at !== intent.prepared_at ||
    !isCanonicalUtcTimestamp(intent.created_at) ||
    intent.job_root !== join(intent.output_root, 'jobs', intent.job_id) ||
    typeof intent.audit_appendix !== 'boolean'
  ) {
    historyUnavailable('runtime prepared identity is invalid');
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
  if (!isPlainObject(state.results)) historyUnavailable('runtime state results must be a plain object');
  if (!Array.isArray(state.events)) historyUnavailable('runtime state events must be an array');
  if (state.unresolved_executor !== null) {
    const fence = state.unresolved_executor;
    if (
      !isPlainObject(fence) ||
      !isNonEmptyString(fence.commandId) ||
      !isNonEmptyString(fence.operationRef) ||
      !Number.isInteger(fence.operationRevision) ||
      fence.operationRevision < 1 ||
      !isNonEmptyString(fence.action) ||
      (fence.pageId !== null && !isNonEmptyString(fence.pageId)) ||
      (fence.contextId !== null && !isNonEmptyString(fence.contextId)) ||
      !isPlainObject(fence.commandIntent)
    ) {
      historyUnavailable('runtime unresolved executor fence is malformed');
    }
  }

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
    if (!KINDS.has(op.kind)) historyUnavailable('operation kind invalid');
    if (op.result_ref !== null && !isNonEmptyString(op.result_ref)) historyUnavailable('operation result reference invalid');
    if (op.base_result_ref !== null && !isNonEmptyString(op.base_result_ref)) historyUnavailable('operation base result reference invalid');
    if (op.kind === 'initial' && op.base_result_ref !== null) historyUnavailable('initial operation cannot have a base result');
    if (op.kind === 'continuation' && op.base_result_ref === null) historyUnavailable('continuation operation requires a base result');
    if (op.control !== null && !isPlainObject(op.control)) historyUnavailable('operation control is malformed');

    const reserved = reservationSet.has(opRef);
    const bindingValid = isValidBinding(op.binding);
    const observationEvidenceValid = op.observation_evidence_ref === null || isNonEmptyString(op.observation_evidence_ref);
    const combinationValid =
      (op.phase === 'queued' && op.submission_effect === 'known_unsent' && !reserved && op.binding === null && op.evidence_ref === null && op.observation_evidence_ref === null && (op.attention === null || (op.kind === 'continuation' && isNonEmptyString(op.attention)))) ||
      (op.phase === 'dispatching' && op.submission_effect === 'unknown' && reserved && op.binding === null && op.evidence_ref === null && op.observation_evidence_ref === null && op.attention === null) ||
      (op.phase === 'observing' && op.submission_effect === 'accepted' && reserved && bindingValid && observationEvidenceValid && op.attention === null) ||
      (op.phase === 'collecting' && op.submission_effect === 'accepted' && !reserved && bindingValid && isNonEmptyString(op.observation_evidence_ref) && op.attention === null) ||
      (op.phase === 'settled' && op.submission_effect === 'accepted' && !reserved && bindingValid && isNonEmptyString(op.observation_evidence_ref) && (isNonEmptyString(op.attention) || isNonEmptyString(op.result_ref)));
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
  for (const [resultRef, result] of Object.entries(state.results)) {
    if (!/^res_[a-f0-9]{32}$/.test(resultRef) || !isPlainObject(result) || result.result_ref !== resultRef) {
      historyUnavailable('runtime result entry is malformed');
    }
    if (!Object.hasOwn(state.operations, result.operation_ref) || state.operations[result.operation_ref].result_ref !== resultRef) {
      historyUnavailable('runtime result does not correspond to its operation');
    }
    if (
      result.job_ref !== state.operations[result.operation_ref].job_ref ||
      typeof result.text !== 'string' ||
      !HASH.test(result.content_sha256) ||
      sha256(result.text) !== result.content_sha256 ||
      result.content_bytes !== Buffer.byteLength(result.text, 'utf8') ||
      !isAbsolute(result.content_path) ||
      !Array.isArray(result.citations) ||
      !HASH.test(result.citations_sha256) ||
      sha256(canonicalJson(result.citations)) !== result.citations_sha256 ||
      !HASH.test(result.capture_identity_sha256) ||
      !isNonEmptyString(result.conversation_id) ||
      !isNonEmptyString(result.user_message_id) ||
      !isNonEmptyString(result.assistant_message_id) ||
      !isNonEmptyString(result.evidence_ref) ||
      !isNonEmptyString(result.media_type) ||
      !Number.isFinite(result.published_at)
    ) {
      historyUnavailable('runtime result metadata is inconsistent');
    }
    const expectedIdentity = sha256(canonicalJson({
      conversation_id: result.conversation_id,
      user_message_id: result.user_message_id,
      assistant_message_id: result.assistant_message_id,
      content_sha256: result.content_sha256,
      citations_sha256: result.citations_sha256,
      media_type: result.media_type
    }));
    if (result.capture_identity_sha256 !== expectedIdentity) historyUnavailable('runtime result capture identity is inconsistent');
  }
  const eventCursors = new Map();
  for (const event of state.events) {
    if (
      !isPlainObject(event) || event.schema !== 'research.event.v1' ||
      !isNonEmptyString(event.event_id) || !Number.isInteger(event.cursor) || event.cursor < 1 ||
      !isNonEmptyString(event.operation_ref) || !Object.hasOwn(state.operations, event.operation_ref) ||
      event.job_ref !== state.operations[event.operation_ref].job_ref || !isNonEmptyString(event.type) ||
      (event.result_ref !== undefined && !Object.hasOwn(state.results, event.result_ref)) ||
      (event.payload !== undefined && !isPlainObject(event.payload))
    ) historyUnavailable('runtime event history is malformed');
    const expectedCursor = (eventCursors.get(event.operation_ref) ?? 0) + 1;
    if (event.cursor !== expectedCursor) historyUnavailable('runtime event cursors are not contiguous');
    eventCursors.set(event.operation_ref, event.cursor);
  }
  if (state.unresolved_executor) {
    const fence = state.unresolved_executor;
    const fencedOperation = Object.hasOwn(state.operations, fence.operationRef)
      ? state.operations[fence.operationRef]
      : null;
    if (!fencedOperation) historyUnavailable('runtime unresolved executor operation is missing');
    if (fencedOperation.revision !== fence.operationRevision + 1) {
      historyUnavailable('runtime unresolved executor revision does not match its operation');
    }
    if (
      Object.hasOwn(fence.commandIntent, 'action') &&
      (
        fence.commandIntent.action !== fence.action ||
        (fence.commandIntent.pageId ?? null) !== fence.pageId ||
        (fence.commandIntent.contextId ?? null) !== fence.contextId
      )
    ) historyUnavailable('runtime unresolved executor intent does not match its owner');
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
  let tmpIdentity;
  try {
    fd = await open(tmpPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    const tmpStat = await fd.stat();
    if (!tmpStat.isFile() || !ownedByCurrentUser(tmpStat)) historyUnavailable('temporary runtime state file is untrusted');
    tmpIdentity = tmpStat;
    await fd.writeFile(payloadBytes);
    await fd.sync();
  } catch (error) {
    if (error?.code?.startsWith('ERR_RUNTIME_')) throw error;
    durabilityFailure('runtime snapshot file could not be synchronized', error);
  } finally {
    await fd?.close().catch(() => {});
  }

  await assertRuntimeRootIdentity(runtimeRoot, rootIdentity, 'runtime directory replaced before state publication');
  const currentTmp = await lstat(tmpPath).catch(() => null);
  if (!currentTmp || currentTmp.isSymbolicLink() || !currentTmp.isFile() || !ownedByCurrentUser(currentTmp) || !sameIdentity(currentTmp, tmpIdentity)) {
    fail('temporary runtime state identity changed before publication', 'ERR_RUNTIME_OWNER_UNRESOLVED');
  }
  if (guards.lockHandle) await assertLockOwnership(guards.lockHandle, guards.epoch ?? state.epoch);
  if (guards.effectHandle) await assertLockOwnership(guards.effectHandle, guards.epoch ?? state.epoch);
  try {
    await rename(tmpPath, finalPath);
  } catch (error) {
    durabilityFailure('runtime snapshot could not be published', error);
  }

  const published = await lstat(finalPath).catch(() => null);
  if (!published || published.isSymbolicLink() || !published.isFile() || !ownedByCurrentUser(published) || !sameIdentity(published, tmpIdentity)) {
    fail('published runtime state identity is unresolved', 'ERR_RUNTIME_OWNER_UNRESOLVED');
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
  await assertNoSymlinkAncestors(root);
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
    await mkdir(root, { recursive: false, mode: 0o700 });
  } catch (err) {
    if (err?.code === 'EEXIST') {
      fail('runtime root already exists', 'ERR_RUNTIME_ROOT_EXISTS');
    }
    throw err;
  }
  const rootIdentity = await validateRuntimeRoot(root);
  await assertOwnedDirectoryIdentity(
    parentDir,
    parentStat,
    'runtime parent changed during initialization',
    'ERR_RUNTIME_ROOT_PARENT_REPLACED'
  );
  await confirmDirectoryDurability(parentDir, parentStat);
  await assertRuntimeRootIdentity(root, rootIdentity, 'runtime root changed during parent synchronization');
  await assertOwnedDirectoryIdentity(
    parentDir,
    parentStat,
    'runtime parent changed during initialization',
    'ERR_RUNTIME_ROOT_PARENT_REPLACED'
  );
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
    results: {},
    events: [],
    unresolved_executor: null,
    pacing: {
      last_attempt_at: null,
      cooldown_until: null
    },
    arrival_counter: 0
  };
  await saveSnapshotAtomically(root, initialState, { rootIdentity, epoch: runtime_epoch });
  await assertOwnedDirectoryIdentity(
    parentDir,
    parentStat,
    'runtime parent changed during initialization',
    'ERR_RUNTIME_ROOT_PARENT_REPLACED'
  );
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
    evidence_ref: o.evidence_ref,
    observation_evidence_ref: o.observation_evidence_ref,
    attention: o.attention ?? null,
    result_ref: o.result_ref,
    kind: o.kind,
    base_result_ref: o.base_result_ref,
    control: o.control
  }));
  return {
    runtime_epoch: state.epoch,
    revision: state.revision,
    capacity: state.capacity,
    occupied,
    operations,
    events: structuredClone(state.events),
    unresolved_executor: state.unresolved_executor ? structuredClone(state.unresolved_executor) : null
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
    const intent = createPreparedIntent(bundle, outputRoot);

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
      kind: 'initial',
      base_result_ref: null,
      result_ref: null,
      control: null,
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
    state.events.push({
      schema: 'research.event.v1',
      event_id: `evt_${randomUUID().replace(/-/g, '')}`,
      cursor: 1,
      operation_ref,
      job_ref,
      type: 'operation.queued'
    });
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

  if (await humanControlActive(runtime)) {
    return { status: 'held', operation_ref: null, reason: 'human_control_active', snapshot: null };
  }

  const effectLockPath = join(runtime.root, 'effect.lock');
  const effectHandle = await acquireLock(effectLockPath, runtime.epoch, { isStateLock: false });
  activeEffectHandles.set(runtime.root, effectHandle);
  let workError = null;
  try {
    await assertRuntimeRootIdentity(runtime.root, initialRootStat, 'runtime directory replaced before dispatch state inspection');
    await assertLockOwnership(effectHandle, runtime.epoch);
    if (await humanControlActive(runtime)) {
      return { status: 'held', operation_ref: null, reason: 'human_control_active', snapshot: null };
    }
    let state;
    await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
      state = await readSnapshot(runtime.root, runtime.epoch);
      if (state.unresolved_executor) {
        fail('prior browser executor remains unresolved', 'ERR_RUNTIME_EXECUTOR_UNRESOLVED');
      }
      let changed = false;
      for (const op of Object.values(state.operations)) {
        if (op.kind !== 'continuation' || op.phase !== 'queued' || op.attention) continue;
        const jobResults = Object.values(state.results)
          .filter((result) => result.job_ref === op.job_ref)
          .sort((a, b) => state.operations[a.operation_ref].arrival_sequence - state.operations[b.operation_ref].arrival_sequence);
        const latestResult = jobResults.at(-1);
        const activeSibling = Object.values(state.operations).some((other) =>
          other.operation_ref !== op.operation_ref &&
          other.kind === 'continuation' &&
          other.job_ref === op.job_ref &&
          other.base_result_ref === op.base_result_ref &&
          other.phase !== 'queued'
        );
        if (!latestResult || latestResult.result_ref !== op.base_result_ref) {
          op.attention = 'stale_base_result';
        } else if (activeSibling) {
          op.attention = 'base_result_already_consumed';
        } else {
          continue;
        }
        op.revision += 1;
        state.revision += 1;
        changed = true;
      }
      if (changed) await saveSnapshotAtomically(runtime.root, state, { ...ownership, effectHandle, epoch: runtime.epoch });
    });
    const occupied = (state.reservations ?? []).length;
    if (occupied >= state.capacity) {
      return { status: 'idle', operation_ref: null, reason: 'capacity_full', snapshot: null };
    }

    const eligible = Object.values(state.operations ?? {}).filter(
      (o) => o.phase === 'queued' && o.submission_effect === 'known_unsent' && !o.attention
    );
    if (eligible.length === 0) {
      return { status: 'idle', operation_ref: null, reason: 'no_queued_work', snapshot: null };
    }

    const priorityRank = { high: 0, normal: 1, background: 2 };
    eligible.sort((a, b) => {
      const pDiff = (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
      if (pDiff !== 0) return pDiff;
      if (a.kind !== b.kind) return a.kind === 'continuation' ? -1 : 1;
      return a.arrival_sequence - b.arrival_sequence;
    });

    let selectedOp = null;
    let preparedTarget = null;
    let preparationError = null;
    let preparationHold = null;
    for (const cand of eligible) {
      if (!checkDispatchGate(context, 'authorize', cand)) continue;
      if (!checkDispatchGate(context, 'deliveryReady', cand)) continue;

      if (typeof driver?.prepare !== 'function') {
        fail('driver.prepare is required', 'ERR_RUNTIME_DRIVER');
      }
      let prep;
      try {
        prep = await driver.prepare(immutableCallbackView(cand));
      } catch (error) {
        if (error?.executorUnresolved === true) throw error;
        preparationError ??= error;
        continue;
      }
      let prepStatus;
      let detachedTarget;
      let prepEvidenceRef;
      let prepReason;
      try {
        prepStatus = prep?.status;
        const target = prep?.target;
        prepEvidenceRef = prep?.evidenceRef;
        prepReason = prep?.reason;
        detachedTarget = immutableCallbackView(target);
      } catch {
        continue;
      }
      if (prepStatus === 'held') {
        preparationHold ??= {
          operation_ref: cand.operation_ref,
          reason: isNonEmptyString(prepReason) && Buffer.byteLength(prepReason, 'utf8') <= 256
            ? prepReason
            : 'preparation_held'
        };
        continue;
      }
      const targetPresent = detachedTarget !== undefined && detachedTarget !== null &&
        (typeof detachedTarget !== 'string' || detachedTarget.trim().length > 0);
      if (prepStatus === 'ready' && targetPresent && isNonEmptyString(prepEvidenceRef)) {
        preparedTarget = detachedTarget;
        selectedOp = cand;
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

    if (await humanControlActive(runtime)) {
      return { status: 'held', operation_ref: null, reason: 'human_control_active', snapshot: null };
    }

    if (!selectedOp) {
      if (preparationError) throw preparationError;
      return preparationHold
        ? { status: 'held', operation_ref: preparationHold.operation_ref, reason: preparationHold.reason, snapshot: null }
        : { status: 'held', operation_ref: null, reason: 'work_held_or_gated', snapshot: null };
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
    if (await humanControlActive(runtime)) {
      return { status: 'held', operation_ref: null, reason: 'human_control_active', snapshot: null };
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
    let sendResult;
    try {
      sendResult = await driver.send(
        immutableCallbackView(state.operations[selectedOp.operation_ref]),
        preparedTarget
      );
    } catch (error) {
      if (error?.executorUnresolved === true && isNonEmptyString(error.commandId)) {
        await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
          state = await readSnapshot(runtime.root, runtime.epoch);
          if (state.unresolved_executor) {
            if (
              state.unresolved_executor.commandId === error.commandId &&
              state.unresolved_executor.operationRef === selectedOp.operation_ref
            ) return;
            fail('cannot replace unresolved executor owner', 'ERR_RUNTIME_EXECUTOR_UNRESOLVED');
          }
          const fencedOp = state.operations[selectedOp.operation_ref];
          state.unresolved_executor = {
            commandId: error.commandId,
            operationRef: fencedOp.operation_ref,
            operationRevision: fencedOp.revision,
            action: 'driver.send',
            pageId: null,
            contextId: null,
            commandIntent: { source: 'driver', effect: 'unknown' }
          };
          fencedOp.revision += 1;
          state.revision += 1;
          await saveSnapshotAtomically(runtime.root, state, { ...ownership, effectHandle, epoch: runtime.epoch });
        });
      }
      throw error;
    }
    let acceptance;
    try {
      const binding = sendResult?.binding;
      acceptance = Object.freeze({
        status: sendResult?.status,
        conversationId: binding?.conversationId,
        userMessageId: binding?.userMessageId,
        evidenceRef: sendResult?.evidenceRef
      });
    } catch {
      fail('driver send returned unreadable acceptance identifiers', 'ERR_RUNTIME_DRIVER_SEND');
    }
    if (
      acceptance.status !== 'accepted' ||
      typeof acceptance.conversationId !== 'string' ||
      acceptance.conversationId.trim().length === 0 ||
      typeof acceptance.userMessageId !== 'string' ||
      acceptance.userMessageId.trim().length === 0 ||
      typeof acceptance.evidenceRef !== 'string' ||
      acceptance.evidenceRef.trim().length === 0
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
        conversationId: acceptance.conversationId,
        userMessageId: acceptance.userMessageId
      };
      opAccepted.evidence_ref = acceptance.evidenceRef;
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
  } catch (error) {
    workError = error;
    throw error;
  } finally {
    let cleanupError = null;
    try {
      await releaseLock(effectHandle);
    } catch (error) {
      cleanupError = error;
    }
    if (activeEffectHandles.get(runtime.root)?.token === effectHandle.token) activeEffectHandles.delete(runtime.root);
    if (cleanupError) {
      if (workError) throw lifecycleFailure('runtime dispatch work and effect lock release both failed', workError, cleanupError);
      throw cleanupError;
    }
  }
}

export async function recordStandardObservation({ runtime, operationRef, expectedRevision, observation, context } = {}) {
  validateRuntimeDescriptor(runtime);
  await validateRuntimeRoot(runtime.root);
  let observed;
  try {
    observed = Object.freeze({
      status: observation?.status,
      conversationId: observation?.conversationId,
      userMessageId: observation?.userMessageId,
      evidenceRef: observation?.evidenceRef,
      attention: observation?.attention,
      reason: observation?.reason
    });
  } catch {
    fail('observation fields are unreadable', 'ERR_RUNTIME_OBSERVATION_STATUS');
  }
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
    if (!op.binding || observed.conversationId !== op.binding.conversationId || observed.userMessageId !== op.binding.userMessageId) {
      fail('observation binding mismatch', 'ERR_RUNTIME_BINDING');
    }
    if (!['running', 'completed', 'failed'].includes(observed.status)) {
      fail('invalid observation status', 'ERR_RUNTIME_OBSERVATION_STATUS');
    }
    if (!isNonEmptyString(observed.evidenceRef)) {
      fail('observation evidenceRef is required', 'ERR_RUNTIME_OBSERVATION_EVIDENCE');
    }
    op.observation_evidence_ref = observed.evidenceRef;
    if (observed.status === 'completed') {
      op.phase = 'collecting';
      state.reservations = (state.reservations ?? []).filter((id) => id !== op.operation_ref);
    } else if (observed.status === 'failed') {
      op.phase = 'settled';
      op.attention = observed.attention ?? observed.reason ?? 'failed';
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

export async function observeStandardWithEffect({ runtime, operationRef, expectedRevision, driver } = {}) {
  validateRuntimeDescriptor(runtime);
  const initialRootStat = await validateRuntimeRoot(runtime.root);
  if (!isNonEmptyString(operationRef) || !Number.isInteger(expectedRevision) || typeof driver?.observe !== 'function') {
    fail('owned observation descriptor and driver are required', 'ERR_RUNTIME_DRIVER');
  }
  if (await humanControlActive(runtime)) {
    fail('human browser control is active', 'ERR_HUMAN_CONTROL_ACTIVE');
  }

  const effectHandle = await acquireLock(join(runtime.root, 'effect.lock'), runtime.epoch, { isStateLock: false });
  activeEffectHandles.set(runtime.root, effectHandle);
  let workError = null;
  try {
    if (await humanControlActive(runtime)) {
      fail('human browser control is active', 'ERR_HUMAN_CONTROL_ACTIVE');
    }
    let observedOperation;
    await withStateLock(runtime.root, runtime.epoch, async () => {
      const state = await readSnapshot(runtime.root, runtime.epoch);
      if (state.unresolved_executor) {
        fail('prior browser executor remains unresolved', 'ERR_RUNTIME_EXECUTOR_UNRESOLVED');
      }
      const op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
      if (!op) fail(`operation ${operationRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
      if (op.phase !== 'observing' || op.submission_effect !== 'accepted' || !op.binding) {
        fail('operation is not eligible for owned observation', 'ERR_RUNTIME_PHASE_INVALID');
      }
      if (op.revision !== expectedRevision) {
        fail(`revision conflict: expected ${expectedRevision}, found ${op.revision}`, 'ERR_RUNTIME_REVISION_CONFLICT');
      }
      observedOperation = immutableCallbackView(op);
    });
    await assertRuntimeRootIdentity(runtime.root, initialRootStat, 'runtime directory replaced before observation');
    await assertLockOwnership(effectHandle, runtime.epoch);
    if (await humanControlActive(runtime)) {
      fail('human browser control is active', 'ERR_HUMAN_CONTROL_ACTIVE');
    }
    return await driver.observe(observedOperation);
  } catch (error) {
    workError = error;
    throw error;
  } finally {
    let cleanupError = null;
    try {
      await releaseLock(effectHandle);
    } catch (error) {
      cleanupError = error;
    }
    if (activeEffectHandles.get(runtime.root)?.token === effectHandle.token) activeEffectHandles.delete(runtime.root);
    if (cleanupError) {
      if (workError) throw lifecycleFailure('runtime observation work and effect lock release both failed', workError, cleanupError);
      throw cleanupError;
    }
  }
}

export async function executeStandardCommand({ runtime, operationRef, expectedRevision, command, execute } = {}) {
  validateRuntimeDescriptor(runtime);
  if (!isPlainObject(command) || !isNonEmptyString(command.id) || !isNonEmptyString(command.action) || typeof execute !== 'function') {
    fail('owned command descriptor and executor are required', 'ERR_RUNTIME_CONTROL');
  }
  if (!['exec', 'tabs', 'cdp'].includes(command.action)) fail('owned command action is unsupported', 'ERR_RUNTIME_CONTROL');
  const effectHandle = activeEffectHandles.get(runtime.root);
  if (!effectHandle) fail('no active runtime effect owner for command', 'ERR_RUNTIME_OWNER_UNRESOLVED');
  const commandRootIdentity = await validateRuntimeRoot(runtime.root);
  await assertLockOwnership(effectHandle, runtime.epoch);
  const commandIntent = {
    action: command.action,
    pageId: command.page ?? null,
    contextId: command.contextId ?? null,
    session: command.session ?? null,
    op: command.op ?? null,
    url: command.url ?? null,
    code_sha256: typeof command.code === 'string' ? sha256(command.code) : null
  };
  let markedRevision;
  await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
    await assertRuntimeRootIdentity(runtime.root, commandRootIdentity, 'runtime directory replaced before command intent publication');
    const state = await readSnapshot(runtime.root, runtime.epoch);
    const op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
    if (!op) fail(`operation ${operationRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
    if (!Number.isInteger(expectedRevision) || op.revision !== expectedRevision) fail('owned command revision conflict', 'ERR_RUNTIME_REVISION_CONFLICT');
    if (state.unresolved_executor) fail('an executor command is already unresolved', 'ERR_RUNTIME_EXECUTOR_UNRESOLVED');
    state.unresolved_executor = {
      commandId: command.id,
      operationRef: op.operation_ref,
      operationRevision: op.revision,
      action: command.action,
      pageId: command.page ?? null,
      contextId: command.contextId ?? null,
      commandIntent
    };
    const previous = isPlainObject(op.control) ? op.control : {};
    op.control = { ...previous, last_kind: 'executor_intent', executor_intent: {
      kind: 'executor_intent', commandId: command.id, action: command.action,
      pageId: command.page ?? null, contextId: command.contextId ?? null
    } };
    op.revision += 1;
    state.revision += 1;
    markedRevision = op.revision;
    await saveSnapshotAtomically(runtime.root, state, { ...ownership, effectHandle, epoch: runtime.epoch });
  });

  let response;
  try {
    await assertRuntimeRootIdentity(runtime.root, commandRootIdentity, 'runtime directory replaced before owned command');
    await assertLockOwnership(effectHandle, runtime.epoch);
    response = await execute(immutableCallbackView(command));
  } catch (error) {
    if (error?.executorUnresolved !== false) {
      error.executorUnresolved = true;
      error.commandId = command.id;
      throw error;
    }
    try {
      await assertRuntimeRootIdentity(runtime.root, commandRootIdentity, 'runtime directory replaced before known command rejection publication');
      await assertLockOwnership(effectHandle, runtime.epoch);
      await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
        const state = await readSnapshot(runtime.root, runtime.epoch);
        const op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
        const fence = state.unresolved_executor;
        if (
          !op || op.revision !== markedRevision || !fence ||
          fence.commandId !== command.id || fence.operationRef !== operationRef ||
          canonicalJson(fence.commandIntent) !== canonicalJson(commandIntent)
        ) fail('known command rejection does not match its fence', 'ERR_RUNTIME_EXECUTOR_UNRESOLVED');
        state.unresolved_executor = null;
        const previous = isPlainObject(op.control) ? op.control : {};
        op.control = { ...previous, last_kind: 'executor_settled', executor_settled: {
          kind: 'executor_settled', commandId: command.id, action: command.action,
          pageId: command.page ?? null, contextId: command.contextId ?? null
        } };
        op.revision += 1;
        state.revision += 1;
        await saveSnapshotAtomically(runtime.root, state, { ...ownership, effectHandle, epoch: runtime.epoch });
      });
    } catch (settlementError) {
      settlementError.executorUnresolved = true;
      settlementError.commandId = command.id;
      throw settlementError;
    }
    error.commandId = command.id;
    throw error;
  }

  try {
    await assertRuntimeRootIdentity(runtime.root, commandRootIdentity, 'runtime directory replaced before command completion publication');
    await assertLockOwnership(effectHandle, runtime.epoch);
    await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
      await assertRuntimeRootIdentity(runtime.root, commandRootIdentity, 'runtime directory replaced before command completion publication');
      const state = await readSnapshot(runtime.root, runtime.epoch);
      const op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
      const fence = state.unresolved_executor;
      if (
        !op || op.revision !== markedRevision || !fence ||
        fence.commandId !== command.id || fence.operationRef !== operationRef ||
        canonicalJson(fence.commandIntent) !== canonicalJson(commandIntent)
      ) fail('owned command completion does not match its fence', 'ERR_RUNTIME_EXECUTOR_UNRESOLVED');
      state.unresolved_executor = null;
      const previous = isPlainObject(op.control) ? op.control : {};
      op.control = { ...previous, last_kind: 'executor_settled', executor_settled: {
        kind: 'executor_settled', commandId: command.id, action: command.action,
        pageId: command.page ?? null, contextId: command.contextId ?? null
      } };
      op.revision += 1;
      state.revision += 1;
      markedRevision = op.revision;
      await saveSnapshotAtomically(runtime.root, state, { ...ownership, effectHandle, epoch: runtime.epoch });
    });
  } catch (error) {
    error.executorUnresolved = true;
    error.commandId = command.id;
    throw error;
  }
  return { response, revision: markedRevision };
}

export async function recordStandardControl({ runtime, operationRef, expectedRevision, control } = {}) {
  validateRuntimeDescriptor(runtime);
  await validateRuntimeRoot(runtime.root);
  if (!isPlainObject(control)) fail('control must be a plain object', 'ERR_RUNTIME_CONTROL');
  const allowed = {
    target_creation_intent: new Set(['kind', 'commandId', 'contextId']),
    target_bound: new Set(['kind', 'commandId', 'pageId', 'contextId']),
    draft_write_intent: new Set(['kind', 'commandId', 'pageId', 'prompt_sha256']),
    draft_written: new Set(['kind', 'commandId', 'pageId', 'prompt_sha256']),
    executor_intent: new Set(['kind', 'commandId', 'action', 'pageId', 'contextId']),
    executor_settled: new Set(['kind', 'commandId', 'action', 'pageId', 'contextId'])
  };
  if (!Object.hasOwn(allowed, control.kind) || Object.keys(control).some((key) => !allowed[control.kind].has(key))) {
    fail('control kind or fields are unsupported', 'ERR_RUNTIME_CONTROL');
  }

  return await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
    const state = await readSnapshot(runtime.root, runtime.epoch);
    const op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
    if (!op) fail(`operation ${operationRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
    if (!Number.isInteger(expectedRevision) || op.revision !== expectedRevision) {
      fail(`revision conflict: expected ${expectedRevision}, found ${op.revision}`, 'ERR_RUNTIME_REVISION_CONFLICT');
    }
    if (!isNonEmptyString(control.commandId)) fail('control commandId is required', 'ERR_RUNTIME_CONTROL');

    const previous = isPlainObject(op.control) ? op.control : {};
    if (control.kind === 'executor_intent') {
      if (!isNonEmptyString(control.action)) fail('executor action is required', 'ERR_RUNTIME_CONTROL');
      if (state.unresolved_executor) fail('an executor command is already unresolved', 'ERR_RUNTIME_EXECUTOR_UNRESOLVED');
      state.unresolved_executor = {
        commandId: control.commandId,
        operationRef: op.operation_ref,
        operationRevision: op.revision,
        action: control.action,
        pageId: control.pageId ?? null,
        contextId: control.contextId ?? null,
        commandIntent: {
          action: control.action,
          pageId: control.pageId ?? null,
          contextId: control.contextId ?? null
        }
      };
    } else if (control.kind === 'executor_settled') {
      const fence = state.unresolved_executor;
      if (
        !fence ||
        fence.commandId !== control.commandId ||
        fence.operationRef !== op.operation_ref ||
        (control.action !== undefined && control.action !== fence.action) ||
        (control.pageId !== undefined && control.pageId !== fence.pageId) ||
        (control.contextId !== undefined && control.contextId !== fence.contextId)
      ) {
        fail('executor settlement does not match its owning command', 'ERR_RUNTIME_CONTROL');
      }
      state.unresolved_executor = null;
    } else if (control.kind === 'target_creation_intent') {
      if (!isNonEmptyString(control.contextId)) fail('target creation context is required', 'ERR_RUNTIME_CONTROL');
      if (previous.target || previous.target_creation_intent) fail('target ownership is already established or pending', 'ERR_RUNTIME_CONTROL');
    } else if (control.kind === 'target_bound') {
      const intent = previous.target_creation_intent;
      if (
        !intent ||
        !isNonEmptyString(control.pageId) ||
        !isNonEmptyString(control.contextId) ||
        control.commandId !== intent.commandId ||
        control.contextId !== intent.contextId
      ) {
        fail('target binding does not match target creation intent', 'ERR_RUNTIME_CONTROL');
      }
    } else if (control.kind === 'draft_write_intent') {
      if (
        !previous.target ||
        !isNonEmptyString(control.pageId) ||
        control.pageId !== previous.target.pageId ||
        control.prompt_sha256 !== op.intent.prompt_sha256
      ) {
        fail('draft intent does not match the owned target and prompt', 'ERR_RUNTIME_CONTROL');
      }
    } else if (control.kind === 'draft_written') {
      const intent = previous.draft_write_intent;
      if (
        !intent ||
        control.commandId !== intent.commandId ||
        control.pageId !== intent.pageId ||
        control.prompt_sha256 !== intent.prompt_sha256
      ) {
        fail('draft completion does not match draft intent', 'ERR_RUNTIME_CONTROL');
      }
    }

    const savedControl = immutableCallbackView(control);
    const updated = { ...previous, last_kind: control.kind, [control.kind]: savedControl };
    if (control.kind === 'target_bound') {
      updated.target = {
        pageId: control.pageId,
        contextId: control.contextId,
        commandId: control.commandId
      };
    } else if (previous.target) {
      updated.target = previous.target;
    }
    op.control = updated;
    op.revision += 1;
    state.revision += 1;
    await saveSnapshotAtomically(runtime.root, state, { ...ownership, epoch: runtime.epoch });
    return { operation_ref: op.operation_ref, revision: op.revision, control: structuredClone(op.control) };
  });
}

function validateCapture(capture) {
  if (!isPlainObject(capture) || capture.complete !== true || capture.stable !== true || capture.completionEvidence !== 'qualified-turn-complete') {
    fail('capture is not a qualified stable completion', 'ERR_RUNTIME_CAPTURE');
  }
  for (const field of ['conversationId', 'userMessageId', 'assistantMessageId', 'text', 'evidenceRef']) {
    if (!isNonEmptyString(capture[field])) fail(`capture ${field} is invalid`, 'ERR_RUNTIME_CAPTURE');
  }
  if (Buffer.byteLength(capture.text, 'utf8') > MAX_PROMPT_BYTES) fail('capture text exceeds 1MiB limit', 'ERR_RUNTIME_CAPTURE');
  if (!Array.isArray(capture.citations)) fail('capture citations must be an array', 'ERR_RUNTIME_CAPTURE');
  if (capture.citations.some((item) => !isPlainObject(item))) fail('capture citations are malformed', 'ERR_RUNTIME_CAPTURE');
  if (!Array.isArray(capture.laterUserMessageIds) || capture.laterUserMessageIds.length > 0) {
    fail('capture contains later or malformed user-message history', 'ERR_RUNTIME_CAPTURE');
  }
}

function captureIdentity(capture) {
  const mediaType = isNonEmptyString(capture.mediaType) ? capture.mediaType : 'text/markdown';
  const citations_sha256 = sha256(canonicalJson(capture.citations));
  const content_sha256 = sha256(capture.text);
  return {
    conversation_id: capture.conversationId,
    user_message_id: capture.userMessageId,
    assistant_message_id: capture.assistantMessageId,
    content_sha256,
    citations_sha256,
    media_type: mediaType,
    capture_identity_sha256: sha256(canonicalJson({
      conversation_id: capture.conversationId,
      user_message_id: capture.userMessageId,
      assistant_message_id: capture.assistantMessageId,
      content_sha256,
      citations_sha256,
      media_type: mediaType
    }))
  };
}

function resultMatchesCapture(result, capture) {
  return Boolean(result && result.capture_identity_sha256 === captureIdentity(capture).capture_identity_sha256);
}

async function requireContentRoot(contentRoot) {
  if (!isNonEmptyString(contentRoot) || !isAbsolute(contentRoot)) fail('contentRoot must be an absolute path', 'ERR_RUNTIME_CONTENT_ROOT');
  const identity = await lstat(contentRoot).catch(() => null);
  if (!identity || identity.isSymbolicLink() || !identity.isDirectory() || !ownedByCurrentUser(identity)) {
    fail('contentRoot must be an owned regular directory', 'ERR_RUNTIME_CONTENT_ROOT');
  }
  return identity;
}

async function publishContentFile(contentRoot, rootIdentity, text, digest) {
  const finalPath = join(contentRoot, `content_${digest}.txt`);
  const tmpPath = join(contentRoot, `.content_tmp_${randomUUID()}`);
  let fd;
  try {
    fd = await open(tmpPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    await fd.writeFile(Buffer.from(text, 'utf8'));
    await fd.sync();
    await fd.close();
    fd = null;
    await assertOwnedDirectoryIdentity(contentRoot, rootIdentity, 'content root changed during publication', 'ERR_RUNTIME_CONTENT_ROOT');
    try {
      await link(tmpPath, finalPath);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readOwnedRegularFile(finalPath, 'existing content file is unavailable', MAX_PROMPT_BYTES);
      if (sha256(existing.text) !== digest || existing.text !== text) fail('content-addressed file conflicts with result', 'ERR_RUNTIME_RESULT_CONFLICT');
    }
    await unlink(tmpPath);
    await confirmDirectoryDurability(contentRoot, rootIdentity);
    return finalPath;
  } catch (error) {
    await fd?.close().catch(() => {});
    const current = await lstat(tmpPath).catch(() => null);
    if (current?.isFile() && ownedByCurrentUser(current)) await unlink(tmpPath).catch(() => {});
    if (error?.code?.startsWith('ERR_RUNTIME_')) throw error;
    durabilityFailure('result content could not be published', error);
  }
}

export async function collectStandardResult({ runtime, operationRef, expectedRevision, capture, context } = {}) {
  validateRuntimeDescriptor(runtime);
  validateCapture(capture);
  const contentRoot = context?.contentRoot;
  const contentRootIdentity = await requireContentRoot(contentRoot);
  let state = await readSnapshot(runtime.root, runtime.epoch);
  let op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
  if (!op) fail(`operation ${operationRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
  if (op.submission_effect !== 'accepted' || !['observing', 'settled'].includes(op.phase)) fail('operation cannot publish a result', 'ERR_RUNTIME_EFFECT_INVALID');
  if (!Number.isInteger(expectedRevision) || op.revision !== expectedRevision) fail('result revision conflict', 'ERR_RUNTIME_REVISION_CONFLICT');
  if (capture.conversationId !== op.binding?.conversationId || capture.userMessageId !== op.binding?.userMessageId) fail('capture binding mismatch', 'ERR_RUNTIME_BINDING');
  if (op.result_ref) {
    const existing = state.results[op.result_ref];
    if (!resultMatchesCapture(existing, capture)) fail('conflicting capture cannot replace result', 'ERR_RUNTIME_RESULT_CONFLICT');
    return { result_ref: existing.result_ref, operation_ref: op.operation_ref, job_ref: op.job_ref, content_sha256: existing.content_sha256 };
  }

  const identity = captureIdentity(capture);
  const contentPath = await publishContentFile(contentRoot, contentRootIdentity, capture.text, identity.content_sha256);
  return await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
    state = await readSnapshot(runtime.root, runtime.epoch);
    op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
    if (!op || op.submission_effect !== 'accepted' || op.phase !== 'observing') fail('operation changed before result publication', 'ERR_RUNTIME_REVISION_CONFLICT');
    if (op.revision !== expectedRevision) fail('result revision conflict', 'ERR_RUNTIME_REVISION_CONFLICT');
    if (capture.conversationId !== op.binding?.conversationId || capture.userMessageId !== op.binding?.userMessageId) fail('capture binding mismatch', 'ERR_RUNTIME_BINDING');
    const result_ref = `res_${randomUUID().replace(/-/g, '')}`;
    const result = {
      result_ref,
      operation_ref: op.operation_ref,
      job_ref: op.job_ref,
      ...identity,
      content_bytes: Buffer.byteLength(capture.text, 'utf8'),
      content_path: contentPath,
      text: capture.text,
      citations: structuredClone(capture.citations),
      evidence_ref: capture.evidenceRef,
      published_at: Date.now()
    };
    state.results[result_ref] = result;
    op.result_ref = result_ref;
    op.phase = 'settled';
    op.observation_evidence_ref = capture.evidenceRef;
    op.revision += 1;
    state.revision += 1;
    state.reservations = state.reservations.filter((ref) => ref !== op.operation_ref);
    const eventCursor = state.events.filter((event) => event.operation_ref === op.operation_ref).length + 1;
    state.events.push({
      schema: 'research.event.v1', event_id: `evt_${randomUUID().replace(/-/g, '')}`,
      cursor: eventCursor, operation_ref: op.operation_ref, job_ref: op.job_ref,
      type: 'result.available', result_ref, published_at: result.published_at
    });
    await saveSnapshotAtomically(runtime.root, state, { ...ownership, epoch: runtime.epoch });
    return { result_ref, operation_ref: op.operation_ref, job_ref: op.job_ref, content_sha256: result.content_sha256 };
  });
}

export async function getStandardResult({ runtime, resultRef, operationRef } = {}) {
  validateRuntimeDescriptor(runtime);
  if (!isNonEmptyString(resultRef)) fail('resultRef must be a non-empty string', 'ERR_RUNTIME_RESULT_REF');
  const state = await readSnapshot(runtime.root, runtime.epoch);
  const result = Object.hasOwn(state.results, resultRef) ? state.results[resultRef] : null;
  if (!result) fail(`result ${resultRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
  if (operationRef !== undefined && result.operation_ref !== operationRef) fail('operation reference mismatch', 'ERR_RUNTIME_OPERATION_MISMATCH');
  const file = await readOwnedRegularFile(result.content_path, 'result content is unavailable', MAX_PROMPT_BYTES);
  if (file.text !== result.text || sha256(file.text) !== result.content_sha256) historyUnavailable('result content disagrees with stored metadata');
  return {
    result_ref: result.result_ref,
    operation_ref: result.operation_ref,
    job_ref: result.job_ref,
    text: result.text,
    citations: structuredClone(result.citations),
    content_sha256: result.content_sha256,
    media_type: result.media_type,
    evidence_ref: result.evidence_ref,
    conversation_id: result.conversation_id,
    user_message_id: result.user_message_id,
    assistant_message_id: result.assistant_message_id
  };
}

export async function exportStandardResult({ runtime, resultRef, destination, context } = {}) {
  validateRuntimeDescriptor(runtime);
  if (!isNonEmptyString(destination) || !isAbsolute(destination)) fail('destination must be absolute', 'ERR_RUNTIME_DESTINATION');
  let authorized = false;
  try {
    authorized = context?.authorize?.(immutableCallbackView({ action: 'export', destination, resultRef })) === true;
  } catch {}
  if (!authorized) fail('export unauthorized', 'ERR_RUNTIME_UNAUTHORIZED');
  const result = await getStandardResult({ runtime, resultRef });
  const parentDir = dirname(destination);
  const parentIdentity = await lstat(parentDir).catch(() => null);
  if (!parentIdentity || parentIdentity.isSymbolicLink() || !parentIdentity.isDirectory() || !ownedByCurrentUser(parentIdentity)) {
    fail('destination parent is not an owned regular directory', 'ERR_RUNTIME_DESTINATION');
  }
  if (await lstat(destination).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error))) {
    fail('destination already exists', 'ERR_RUNTIME_DESTINATION_EXISTS');
  }
  const tmpPath = join(parentDir, `.export_tmp_${randomUUID()}`);
  let fd;
  try {
    fd = await open(tmpPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    await fd.writeFile(Buffer.from(result.text, 'utf8'));
    await fd.sync();
    await fd.close();
    fd = null;
    await assertOwnedDirectoryIdentity(parentDir, parentIdentity, 'destination parent changed during export', 'ERR_RUNTIME_DESTINATION');
    await link(tmpPath, destination);
    await unlink(tmpPath);
    await confirmDirectoryDurability(parentDir, parentIdentity);
  } catch (error) {
    await fd?.close().catch(() => {});
    await unlink(tmpPath).catch(() => {});
    if (error?.code === 'EEXIST') fail('destination already exists', 'ERR_RUNTIME_DESTINATION_EXISTS');
    if (error?.code?.startsWith('ERR_RUNTIME_')) throw error;
    durabilityFailure('result export could not be published', error);
  }
  return { result_ref: resultRef, destination, bytes_written: Buffer.byteLength(result.text, 'utf8') };
}

export async function continueStandardJob({ runtime, jobRef, baseResultRef, requestKey, prompt, context } = {}) {
  validateRuntimeDescriptor(runtime);
  if (!isNonEmptyString(jobRef)) fail('jobRef must be a non-empty string', 'ERR_RUNTIME_JOB_REF');
  if (!isNonEmptyString(baseResultRef)) fail('baseResultRef must be a non-empty string', 'ERR_RUNTIME_RESULT_REF');
  validateRequestKey(requestKey);
  if (!isNonEmptyString(prompt)) fail('prompt must be a non-empty string', 'ERR_RUNTIME_PROMPT');
  if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES) fail('prompt exceeds 1MiB limit', 'ERR_RUNTIME_PROMPT_LIMIT');

  return await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
    const state = await readSnapshot(runtime.root, runtime.epoch);
    const base = Object.hasOwn(state.results, baseResultRef) ? state.results[baseResultRef] : null;
    if (!base) fail(`base result ${baseResultRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
    if (base.job_ref !== jobRef) fail('base result job mismatch', 'ERR_RUNTIME_JOB_MISMATCH');
    const baseOp = state.operations[base.operation_ref];
    if (!baseOp || baseOp.result_ref !== baseResultRef || baseOp.phase !== 'settled') fail('base operation is invalid', 'ERR_RUNTIME_INVALID_BASE');
    const mapKey = `rk:${requestKey}`;
    if (Object.hasOwn(state.key_map, mapKey)) {
      const existing = state.operations[state.key_map[mapKey]];
      if (
        existing?.kind !== 'continuation' ||
        existing.job_ref !== jobRef ||
        existing.base_result_ref !== baseResultRef ||
        existing.intent?.prompt !== prompt ||
        existing.intent?.prompt_sha256 !== sha256(prompt)
      ) fail('duplicate requestKey with conflicting continuation intent', 'ERR_RUNTIME_REQUEST_KEY_CONFLICT');
      checkAuthorization(context, existing);
      await confirmDirectoryDurability(runtime.root, ownership.rootIdentity);
      return {
        admission: 'existing', job_ref: existing.job_ref, operation_ref: existing.operation_ref,
        revision: existing.revision, phase: existing.phase, submission_effect: existing.submission_effect,
        base_result_ref: existing.base_result_ref
      };
    }
    if (Object.keys(state.operations).length >= MAX_OPERATIONS) fail('maximum operations limit reached', 'ERR_RUNTIME_CAPACITY_EXCEEDED');
    const prompt_sha256 = sha256(prompt);
    const turn_id = `turn_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const intent = { ...structuredClone(baseOp.intent), turn_id, prompt_sha256, prompt };
    const priority = baseOp.priority;
    checkAuthorization(context, { priority, intent, kind: 'continuation' });
    const operation_ref = `op_${randomUUID().replace(/-/g, '')}`;
    state.arrival_counter += 1;
    const op = {
      operation_ref, job_ref: jobRef, request_key: requestKey, kind: 'continuation',
      base_result_ref: baseResultRef, result_ref: null, control: null, revision: 1,
      phase: 'queued', submission_effect: 'known_unsent', priority,
      arrival_sequence: state.arrival_counter, intent, binding: null, evidence_ref: null,
      observation_evidence_ref: null, attention: null
    };
    state.key_map[mapKey] = operation_ref;
    state.intents[operation_ref] = intent;
    state.operations[operation_ref] = op;
    state.events.push({
      schema: 'research.event.v1', event_id: `evt_${randomUUID().replace(/-/g, '')}`,
      cursor: 1, operation_ref, job_ref: jobRef, type: 'operation.queued'
    });
    state.revision += 1;
    await saveSnapshotAtomically(runtime.root, state, { ...ownership, epoch: runtime.epoch });
    return {
      admission: 'accepted', job_ref: jobRef, operation_ref, revision: 1,
      phase: 'queued', submission_effect: 'known_unsent', base_result_ref: baseResultRef
    };
  });
}

export async function recordStandardEvent({ runtime, operationRef, type, resultRef = null, payload = null } = {}) {
  validateRuntimeDescriptor(runtime);
  if (!isNonEmptyString(type)) fail('event type is required', 'ERR_RUNTIME_EVENTS');
  if (resultRef !== null && !isNonEmptyString(resultRef)) fail('event result reference is invalid', 'ERR_RUNTIME_EVENTS');
  if (payload !== null && !isPlainObject(payload)) fail('event payload is invalid', 'ERR_RUNTIME_EVENTS');
  return await withStateLock(runtime.root, runtime.epoch, async (ownership) => {
    const state = await readSnapshot(runtime.root, runtime.epoch);
    const op = Object.hasOwn(state.operations, operationRef) ? state.operations[operationRef] : null;
    if (!op) fail(`operation ${operationRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
    if (resultRef !== null && !Object.hasOwn(state.results, resultRef)) fail('event result does not exist', 'ERR_RUNTIME_NOT_FOUND');
    if (resultRef !== null && state.results[resultRef].operation_ref !== operationRef) {
      fail('event result does not belong to its operation', 'ERR_RUNTIME_EVENTS');
    }
    const prior = state.events.filter((event) => event.operation_ref === operationRef);
    const event = {
      schema: 'research.event.v1',
      event_id: `evt_${randomUUID().replace(/-/g, '')}`,
      cursor: prior.length + 1,
      operation_ref: op.operation_ref,
      job_ref: op.job_ref,
      type,
      ...(resultRef ? { result_ref: resultRef } : {}),
      ...(payload ? { payload: structuredClone(payload) } : {})
    };
    state.events.push(event);
    op.revision += 1;
    state.revision += 1;
    await saveSnapshotAtomically(runtime.root, state, { ...ownership, epoch: runtime.epoch });
    return structuredClone(event);
  });
}
