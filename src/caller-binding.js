import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { lstat, mkdir, open, readdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonicalJson } from './canonical-json.js';
import { inspectStandardRuntime } from './standard-runtime.js';

const MAX_ACTIVE_OBSERVERS = 256;
const MAX_TTL_MS = 60000;
const OPERATION_REF = /^op_[a-f0-9]{32}$/;

const fail = (message, code = 'ERR_CALLER_BINDING') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

function ownedByCurrentUser(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

function getObserversDir(runtimeRoot) {
  return join(runtimeRoot, 'observers');
}

function getLeasePath(runtimeRoot, operationRef) {
  return join(getObserversDir(runtimeRoot), `${operationRef}.json`);
}

function validLease(lease, { operationRef, epoch } = {}) {
  if (!lease || Array.isArray(lease) || typeof lease !== 'object') return false;
  const allowed = new Set(['schema', 'operation_ref', 'observer_id', 'generation', 'epoch', 'activated_at', 'renewed_at', 'expires_at', 'ttl_ms']);
  if (Object.keys(lease).some((key) => !allowed.has(key))) return false;
  if (
    lease.schema !== 'research.observer-lease.v1' ||
    !OPERATION_REF.test(lease.operation_ref ?? '') ||
    (operationRef !== undefined && lease.operation_ref !== operationRef) ||
    typeof lease.observer_id !== 'string' || lease.observer_id.trim().length === 0 ||
    typeof lease.generation !== 'string' || lease.generation.trim().length === 0 ||
    typeof lease.epoch !== 'string' || lease.epoch.length === 0 ||
    (epoch !== undefined && lease.epoch !== epoch) ||
    !Number.isInteger(lease.activated_at) || lease.activated_at < 0 ||
    !Number.isInteger(lease.expires_at) || lease.expires_at <= lease.activated_at ||
    !Number.isInteger(lease.ttl_ms) || lease.ttl_ms < 1 || lease.ttl_ms > MAX_TTL_MS
  ) return false;
  const basis = lease.renewed_at ?? lease.activated_at;
  return Number.isInteger(basis) && basis >= lease.activated_at && lease.expires_at === basis + lease.ttl_ms;
}

async function requireObserversDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory() || !ownedByCurrentUser(stat)) {
    fail('observers directory is untrusted', 'ERR_BINDING_UNTRUSTED');
  }
  return stat;
}

async function syncDirectory(path, identity) {
  const fd = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await fd.stat();
    if (!stat.isDirectory() || stat.dev !== identity.dev || stat.ino !== identity.ino) {
      fail('observers directory changed', 'ERR_BINDING_UNTRUSTED');
    }
    await fd.sync();
  } finally {
    await fd.close().catch(() => {});
  }
}

async function readLeaseFile(leasePath, operationRef, epoch) {
  let fd;
  try { fd = await open(leasePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
  catch (error) {
    if (error?.code === 'ENOENT') fail(`no active lease found for operation ${operationRef}`, 'ERR_BINDING_NOT_FOUND');
    fail('lease file is untrusted', 'ERR_BINDING_UNTRUSTED');
  }
  let stat;
  let lease;
  try {
    stat = await fd.stat();
    if (!stat.isFile() || !ownedByCurrentUser(stat) || stat.size > 16 * 1024) fail('lease file is untrusted', 'ERR_BINDING_UNTRUSTED');
    lease = JSON.parse(await fd.readFile('utf8'));
  } catch (error) {
    if (error?.code?.startsWith('ERR_BINDING_')) throw error;
    fail('lease file is malformed', 'ERR_BINDING_UNTRUSTED');
  } finally {
    await fd.close().catch(() => {});
  }
  if (!validLease(lease, { operationRef, epoch })) fail('lease file is malformed', 'ERR_BINDING_UNTRUSTED');
  return { lease, stat };
}

async function writeLeaseFile(leasePath, payload, { directoryIdentity, replaceIdentity = null } = {}) {
  if (!replaceIdentity) {
    const fd = await open(leasePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    const identity = await fd.stat();
    try {
      await fd.writeFile(payload, 'utf8');
      await fd.sync();
    } finally {
      await fd.close().catch(() => {});
    }
    const published = await lstat(leasePath).catch(() => null);
    if (!published || published.isSymbolicLink() || !published.isFile() || !ownedByCurrentUser(published) || published.dev !== identity.dev || published.ino !== identity.ino) {
      fail('lease publication identity is unresolved', 'ERR_BINDING_UNTRUSTED');
    }
    await syncDirectory(dirname(leasePath), directoryIdentity);
    return;
  }
  const tmpPath = `${leasePath}.tmp.${randomUUID()}`;
  const fd = await open(tmpPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  const tmpIdentity = await fd.stat();
  try {
    await fd.writeFile(payload, 'utf8');
    await fd.sync();
  } finally {
    await fd.close().catch(() => {});
  }
  const written = await lstat(tmpPath).catch(() => null);
  if (!written || written.isSymbolicLink() || !written.isFile() || !ownedByCurrentUser(written) || written.dev !== tmpIdentity.dev || written.ino !== tmpIdentity.ino) {
    fail('lease update identity is unresolved', 'ERR_BINDING_UNTRUSTED');
  }
  const current = await lstat(leasePath).catch(() => null);
  if (!current || current.dev !== replaceIdentity.dev || current.ino !== replaceIdentity.ino || current.isSymbolicLink() || !current.isFile()) {
    fail('lease owner changed before update', 'ERR_BINDING_STALE_GENERATION');
  }
  await rename(tmpPath, leasePath);
  const published = await lstat(leasePath).catch(() => null);
  if (!published || published.isSymbolicLink() || !published.isFile() || !ownedByCurrentUser(published) || published.dev !== tmpIdentity.dev || published.ino !== tmpIdentity.ino) {
    fail('lease update publication is unresolved', 'ERR_BINDING_UNTRUSTED');
  }
  await syncDirectory(dirname(leasePath), directoryIdentity);
}

export async function activateObserver({
  config,
  operationRef,
  observerId,
  generation,
  ttlMs,
  clock,
  replaceExpired = false
} = {}) {
  if (!config || !config.runtime?.root || !config.runtime?.epoch) {
    fail('valid runtime config is required', 'ERR_BINDING_CONFIG');
  }
  if (typeof operationRef !== 'string' || !OPERATION_REF.test(operationRef)) {
    fail('operationRef is required', 'ERR_BINDING_OPERATION');
  }
  if (typeof observerId !== 'string' || observerId.trim().length === 0) {
    fail('observerId is required', 'ERR_BINDING_OBSERVER');
  }
  if (typeof generation !== 'string' || generation.trim().length === 0) {
    fail('generation is required', 'ERR_BINDING_GENERATION');
  }
  if (typeof ttlMs !== 'number' || !Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    fail(`ttlMs must be a positive integer <= ${MAX_TTL_MS}`, 'ERR_BINDING_TTL');
  }

  // Verify operation exists in runtime
  const state = await inspectStandardRuntime({ runtime: config.runtime, operationRef });
  if (!state.operations || state.operations.length === 0) {
    fail(`operation ${operationRef} not found in runtime`, 'ERR_BINDING_OPERATION_NOT_FOUND');
  }

  const observersDir = getObserversDir(config.runtime.root);
  const directoryIdentity = await requireObserversDirectory(observersDir);

  const now = typeof clock?.now === 'function' ? clock.now() : Date.now();
  if (!Number.isInteger(now) || now < 0) fail('observer clock is invalid', 'ERR_BINDING_TTL');
  const lease = {
    schema: 'research.observer-lease.v1',
    operation_ref: operationRef,
    observer_id: observerId,
    generation,
    epoch: config.runtime.epoch,
    activated_at: now,
    expires_at: now + ttlMs,
    ttl_ms: ttlMs
  };

  const leasePath = getLeasePath(config.runtime.root, operationRef);
  let replaceIdentity = null;
  try {
    const existing = await readLeaseFile(leasePath, operationRef, config.runtime.epoch);
    if (now < existing.lease.expires_at) {
      fail('operation already has an active observer lease', 'ERR_BINDING_ACTIVE');
    }
    if (replaceExpired !== true) {
      fail('expired observer replacement requires explicit authority', 'ERR_BINDING_REPLACEMENT_REQUIRED');
    }
    replaceIdentity = existing.stat;
  } catch (error) {
    if (error?.code !== 'ERR_BINDING_NOT_FOUND') throw error;
  }
  if (!replaceIdentity) {
    const existingEntries = await readdir(observersDir).catch(() => []);
    const activeCount = existingEntries.filter((file) => file.endsWith('.json') && !file.includes('.tmp.')).length;
    if (activeCount >= MAX_ACTIVE_OBSERVERS) {
      fail(`maximum active observers limit (${MAX_ACTIVE_OBSERVERS}) reached`, 'ERR_BINDING_CAPACITY');
    }
  }
  await writeLeaseFile(leasePath, canonicalJson(lease) + '\n', { directoryIdentity, replaceIdentity });
  return lease;
}

export async function renewObserver({
  config,
  operationRef,
  observerId,
  generation,
  ttlMs,
  clock
} = {}) {
  if (!config || !config.runtime?.root || !config.runtime?.epoch) {
    fail('valid runtime config is required', 'ERR_BINDING_CONFIG');
  }
  if (typeof operationRef !== 'string' || !OPERATION_REF.test(operationRef)) {
    fail('operationRef is required', 'ERR_BINDING_OPERATION');
  }
  if (typeof observerId !== 'string' || observerId.trim().length === 0) {
    fail('observerId is required', 'ERR_BINDING_OBSERVER');
  }
  if (typeof generation !== 'string' || generation.trim().length === 0) {
    fail('generation is required', 'ERR_BINDING_GENERATION');
  }
  if (typeof ttlMs !== 'number' || !Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    fail(`ttlMs must be a positive integer <= ${MAX_TTL_MS}`, 'ERR_BINDING_TTL');
  }

  const leasePath = getLeasePath(config.runtime.root, operationRef);
  const observersDir = getObserversDir(config.runtime.root);
  const directoryIdentity = await requireObserversDirectory(observersDir);
  const read = await readLeaseFile(leasePath, operationRef, config.runtime.epoch);
  const existing = read.lease;

  if (existing.generation !== generation) {
    fail(`generation mismatch on renewal: expected ${existing.generation}, got ${generation}`, 'ERR_BINDING_STALE_GENERATION');
  }
  if (existing.observer_id !== observerId) {
    fail(`observer mismatch on renewal: expected ${existing.observer_id}, got ${observerId}`, 'ERR_BINDING_OBSERVER_MISMATCH');
  }

  const now = typeof clock?.now === 'function' ? clock.now() : Date.now();
  if (!Number.isInteger(now) || now < 0) fail('observer clock is invalid', 'ERR_BINDING_TTL');
  if (now >= existing.expires_at) {
    fail(`observer lease expired at ${existing.expires_at}, current time is ${now}`, 'ERR_BINDING_EXPIRED');
  }

  existing.expires_at = now + ttlMs;
  existing.renewed_at = now;
  existing.ttl_ms = ttlMs;

  await writeLeaseFile(leasePath, canonicalJson(existing) + '\n', { directoryIdentity, replaceIdentity: read.stat });
  return existing;
}

export function deliveryReady({ config, operationRef, clock } = {}) {
  if (!config || !config.runtime?.root || !config.runtime?.epoch || !operationRef) {
    return false;
  }
  const leasePath = getLeasePath(config.runtime.root, operationRef);
  let fd;
  let stat;
  try {
    fd = openSync(leasePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    stat = fstatSync(fd);
  } catch {
    return false;
  }
  if (!stat.isFile() || !ownedByCurrentUser(stat) || stat.size > 16 * 1024) {
    try { closeSync(fd); } catch {}
    return false;
  }

  try {
    const text = readFileSync(fd, 'utf8');
    const lease = JSON.parse(text);
    if (!validLease(lease, { operationRef, epoch: config.runtime.epoch })) {
      return false;
    }
    const now = typeof clock?.now === 'function' ? clock.now() : Date.now();
    if (!Number.isInteger(now) || now < 0 || now >= lease.expires_at) {
      return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    try { closeSync(fd); } catch {}
  }
}
