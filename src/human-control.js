import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from './canonical-json.js';

const SCHEMA = 'research.human-control.v1';

const fail = (message, code = 'ERR_HUMAN_CONTROL') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const owned = (stat) => typeof process.getuid !== 'function' || stat.uid === process.getuid();
const pathFor = (runtime) => join(runtime.root, 'human-control.json');

async function runtimeIdentity(runtime) {
  if (!runtime || typeof runtime.root !== 'string' || typeof runtime.epoch !== 'string' || runtime.epoch.length === 0) {
    fail('runtime identity is required', 'ERR_HUMAN_CONTROL_RUNTIME');
  }
  const stat = await lstat(runtime.root).catch(() => null);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory() || !owned(stat)) {
    fail('runtime root is unavailable', 'ERR_HUMAN_CONTROL_RUNTIME');
  }
  return stat;
}

function valid(record, runtime) {
  const backend = record?.backend;
  const validBackend = backend === null || Boolean(
    backend && !Array.isArray(backend) && typeof backend === 'object' &&
    Object.keys(backend).sort().join('\n') === ['host_identity_sha256', 'pid', 'profile_path', 'started_at'].sort().join('\n') &&
    Number.isInteger(backend.pid) && backend.pid > 0 &&
    Number.isInteger(backend.started_at) && backend.started_at >= 0 &&
    typeof backend.profile_path === 'string' && backend.profile_path.length > 0 &&
    /^[0-9a-f]{64}$/.test(backend.host_identity_sha256)
  );
  return Boolean(
    record && !Array.isArray(record) && typeof record === 'object' &&
    Object.keys(record).sort().join('\n') === ['backend', 'epoch', 'nonce', 'requested_at', 'schema'].sort().join('\n') &&
    record.schema === SCHEMA &&
    record.epoch === runtime.epoch &&
    typeof record.nonce === 'string' && record.nonce.length > 0 &&
    Number.isInteger(record.requested_at) && record.requested_at >= 0 &&
    validBackend
  );
}

async function readControl(runtime) {
  const path = pathFor(runtime);
  let fd;
  try { fd = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    fail('human-control record is untrusted', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  }
  let stat;
  let record;
  try {
    stat = await fd.stat();
    if (!stat.isFile() || !owned(stat) || stat.size > 4096) fail('human-control record is untrusted', 'ERR_HUMAN_CONTROL_UNTRUSTED');
    record = JSON.parse(await fd.readFile('utf8'));
  } catch (error) {
    if (error?.code?.startsWith('ERR_HUMAN_CONTROL_')) throw error;
    fail('human-control record is malformed', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  } finally {
    await fd.close().catch(() => {});
  }
  if (!valid(record, runtime)) fail('human-control record is malformed', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  return { path, stat, record };
}

async function syncRoot(runtime, identity) {
  const fd = await open(runtime.root, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await fd.stat();
    if (!stat.isDirectory() || stat.dev !== identity.dev || stat.ino !== identity.ino) {
      fail('runtime root changed during human-control update', 'ERR_HUMAN_CONTROL_RUNTIME');
    }
    await fd.sync();
  } finally {
    await fd.close().catch(() => {});
  }
}

export async function acquireHumanControl(runtime, now = Date.now()) {
  const root = await runtimeIdentity(runtime);
  const existing = await readControl(runtime);
  if (existing) return { ...existing.record, existing: true };
  if (!Number.isInteger(now) || now < 0) fail('human-control clock is invalid');
  const record = { schema: SCHEMA, epoch: runtime.epoch, nonce: randomUUID(), requested_at: now, backend: null };
  const path = pathFor(runtime);
  let fd;
  let createdIdentity;
  try {
    fd = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    createdIdentity = await fd.stat();
    await fd.writeFile(`${canonicalJson(record)}\n`, 'utf8');
    await fd.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const raced = await readControl(runtime);
      if (raced) return { ...raced.record, existing: true };
    }
    throw error;
  } finally {
    await fd?.close().catch(() => {});
  }
  const published = await lstat(path).catch(() => null);
  if (!published || published.isSymbolicLink() || !published.isFile() || !owned(published) || published.dev !== createdIdentity.dev || published.ino !== createdIdentity.ino) {
    fail('human-control record changed during publication', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  }
  await syncRoot(runtime, root);
  return { ...record, existing: false };
}

export async function recordHumanBackend(runtime, nonce, backend) {
  const root = await runtimeIdentity(runtime);
  const current = await readControl(runtime);
  if (!current || current.record.nonce !== nonce || current.record.backend !== null) {
    fail('human-control backend owner is unresolved', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  }
  const updated = { ...current.record, backend };
  if (!valid(updated, runtime)) fail('human-control backend identity is invalid', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  const tmpPath = `${current.path}.tmp.${randomUUID()}`;
  const fd = await open(tmpPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
  const tmpIdentity = await fd.stat();
  try {
    await fd.writeFile(`${canonicalJson(updated)}\n`, 'utf8');
    await fd.sync();
  } finally {
    await fd.close().catch(() => {});
  }
  const written = await lstat(tmpPath).catch(() => null);
  if (!written || written.isSymbolicLink() || !written.isFile() || !owned(written) || written.dev !== tmpIdentity.dev || written.ino !== tmpIdentity.ino) {
    fail('human-control backend update changed before publication', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  }
  const latest = await lstat(current.path).catch(() => null);
  if (!latest || latest.dev !== current.stat.dev || latest.ino !== current.stat.ino || latest.isSymbolicLink() || !latest.isFile()) {
    fail('human-control owner changed before backend publication', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  }
  await rename(tmpPath, current.path);
  const published = await lstat(current.path).catch(() => null);
  if (!published || published.isSymbolicLink() || !published.isFile() || !owned(published) || published.dev !== tmpIdentity.dev || published.ino !== tmpIdentity.ino) {
    fail('human-control backend publication is unresolved', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  }
  await syncRoot(runtime, root);
  return updated.backend;
}

export async function releaseHumanControl(runtime) {
  const root = await runtimeIdentity(runtime);
  const current = await readControl(runtime);
  if (!current) return false;
  const latest = await lstat(current.path).catch(() => null);
  if (!latest || latest.dev !== current.stat.dev || latest.ino !== current.stat.ino || latest.isSymbolicLink() || !latest.isFile()) {
    fail('human-control owner changed before release', 'ERR_HUMAN_CONTROL_UNTRUSTED');
  }
  await unlink(current.path);
  await syncRoot(runtime, root);
  return true;
}

export async function humanControlActive(runtime) {
  await runtimeIdentity(runtime);
  try { return Boolean(await readControl(runtime)); }
  catch { return true; }
}
