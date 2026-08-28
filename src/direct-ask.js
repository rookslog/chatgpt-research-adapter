import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, rename, rm, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from './canonical-json.js';
import { preflightOpenCli, runOpenCliAsk, runOpenCliDeepResearchResult, runOpenCliDeepResearchStatus, runOpenCliDetail } from './opencli-transport.js';
import { prepareResearchJob } from './prepare.js';
import { loadPreparedBundle } from './prepared-bundle.js';

const templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url));
const rigorRoot = fileURLToPath(new URL('../rigor/', import.meta.url));
const fail = (message, code) => { const error = new TypeError(message); error.code = code; throw error; };
const fault = (seam, point) => { if (seam?.failAt === point) fail(`injected fault at ${point}`, 'ERR_INJECTED_FAULT'); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MODE_TO_TOOL = Object.freeze({ standard: '', web: 'Web Search', deep: 'Deep Research' });
const CHATGPT_CONVERSATION_ROOT = ['https:', '', 'chatgpt.com', 'c'].join('/');
const TRANSPORT_OPTION_KEYS = new Set(['askTimeoutSeconds', 'deepTimeoutSeconds', 'spawnImpl', 'environment', 'timeoutMs', 'killGraceMs']);
const RESPONSE_FILE_LIMIT = 128 * 1024;

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } catch (error) { if (!['EINVAL', 'ENOTSUP', 'ENOSYS'].includes(error?.code)) throw error; } finally { await handle.close(); }
}

async function writeDurableExclusive(path, bytes, directory) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (payload.length > 256 * 1024) fail('direct response artifact exceeds its byte limit', 'ERR_DIRECT_RECEIPT');
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await handle.writeFile(payload); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(directory);
  return hash(payload);
}

async function writeDurableJson(path, value, directory) {
  return writeDurableExclusive(path, Buffer.from(`${canonicalJson(value)}\n`), directory);
}

async function readResponseBytes(path, limit = RESPONSE_FILE_LIMIT) {
  const entry = await lstat(path).catch(() => null);
  if (!entry?.isFile() || entry.isSymbolicLink() || entry.size > limit) fail('direct response receipt is invalid', 'ERR_DIRECT_RECEIPT');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => fail('direct response receipt is invalid', 'ERR_DIRECT_RECEIPT'));
  let bytes;
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.size > limit || current.dev !== entry.dev || current.ino !== entry.ino) fail('direct response receipt changed during read', 'ERR_DIRECT_RECEIPT');
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  if (bytes.length !== entry.size) fail('direct response receipt changed during read', 'ERR_DIRECT_RECEIPT');
  return bytes;
}

function parseCanonicalJsonBytes(bytes) {
  let text; let value;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); value = JSON.parse(text); } catch { fail('direct response receipt is invalid', 'ERR_DIRECT_RECEIPT'); }
  if (!isRegularObject(value) || `${canonicalJson(value)}\n` !== text) fail('direct response receipt must use canonical JSON', 'ERR_DIRECT_RECEIPT');
  return Object.freeze(value);
}

function isRegularObject(value) { return value && !Array.isArray(value) && typeof value === 'object'; }
function sameKeys(value, keys) { return isRegularObject(value) && Object.keys(value).sort().join('\n') === [...keys].sort().join('\n'); }
function isHash(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value); }
function isCanonicalTime(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }

function validateDeepIntent(value, bundle, jobId) {
  if (!sameKeys(value, ['schema', 'status', 'job_id', 'mode', 'prompt_sha256', 'opencli_path', 'opencli_version', 'intent_recorded_at']) || value.schema !== 'm004.direct-intent.v1' || value.status !== 'dispatching' || value.job_id !== jobId || value.mode !== 'deep' || value.prompt_sha256 !== bundle.prompt_sha256 || typeof value.opencli_path !== 'string' || !isAbsolute(value.opencli_path) || value.opencli_version !== '1.8.7' || !isCanonicalTime(value.intent_recorded_at)) fail('Deep intent receipt is invalid', 'ERR_DIRECT_RECEIPT');
  return value;
}

function validateDeepHandoff(value, intentSha256, jobId) {
  if (!sameKeys(value, ['schema', 'status', 'job_id', 'mode', 'intent_sha256', 'conversation_id', 'conversation_url', 'tool', 'accepted_at']) || value.schema !== 'm004.direct-handoff.v1' || value.status !== 'accepted' || value.job_id !== jobId || value.mode !== 'deep' || value.intent_sha256 !== intentSha256 || !/^[A-Za-z0-9_-]+$/.test(value.conversation_id) || value.conversation_url !== `${CHATGPT_CONVERSATION_ROOT}/${value.conversation_id}` || value.tool !== 'Deep Research' || !isCanonicalTime(value.accepted_at)) fail('Deep handoff receipt is invalid', 'ERR_DIRECT_RECEIPT');
  return value;
}

function validateDeepRunning(value, intentSha256, handoffSha256, handoff, jobId) {
  if (!sameKeys(value, ['schema', 'status', 'job_id', 'mode', 'intent_sha256', 'handoff_sha256', 'conversation_id', 'conversation_url', 'tool', 'accepted_at', 'running_at', 'remote_effect']) || value.schema !== 'm006.deep-running.v1' || value.status !== 'running' || value.job_id !== jobId || value.mode !== 'deep' || value.intent_sha256 !== intentSha256 || value.handoff_sha256 !== handoffSha256 || value.conversation_id !== handoff.conversation_id || value.conversation_url !== handoff.conversation_url || value.tool !== handoff.tool || value.accepted_at !== handoff.accepted_at || value.remote_effect !== 'accepted' || !isCanonicalTime(value.running_at)) fail('Deep running receipt is invalid', 'ERR_DIRECT_RECEIPT');
  return value;
}

async function publishDirectIntent({ jobPath, responseRoot, intent, receiptTestSeam }) {
  const stagingRoot = join(jobPath, `.response-staging-${randomUUID()}`);
  await mkdir(stagingRoot, { mode: 0o700 });
  let published = false;
  try {
    const intentSha256 = await writeDurableJson(join(stagingRoot, 'intent.json'), intent, stagingRoot);
    fault(receiptTestSeam, 'after-direct-intent-write');
    try { await rename(stagingRoot, responseRoot); }
    catch (error) { if (['EEXIST', 'ENOTEMPTY'].includes(error?.code)) fail('direct response already exists', 'ERR_DIRECT_EXISTS'); throw error; }
    published = true;
    await syncDirectory(jobPath);
    return intentSha256;
  } finally {
    if (!published) await rm(stagingRoot, { recursive: true, force: true });
  }
}

function directTransportOptions(value) {
  const options = value ?? {};
  if (!options || Array.isArray(options) || typeof options !== 'object' || Object.keys(options).some((key) => !TRANSPORT_OPTION_KEYS.has(key))) fail('direct transport options are invalid', 'ERR_DIRECT_TRANSPORT_OPTIONS');
  const { askTimeoutSeconds = 600, deepTimeoutSeconds = 1200, spawnImpl, environment, timeoutMs, killGraceMs } = options;
  const runtimeOptions = {};
  if (spawnImpl !== undefined) runtimeOptions.spawnImpl = spawnImpl;
  if (environment !== undefined) runtimeOptions.environment = environment;
  if (timeoutMs !== undefined) runtimeOptions.timeoutMs = timeoutMs;
  if (killGraceMs !== undefined) runtimeOptions.killGraceMs = killGraceMs;
  return Object.freeze({ askTimeoutSeconds, deepTimeoutSeconds, runtimeOptions: Object.freeze(runtimeOptions) });
}

function validateHandoff(answer, mode) {
  if (!answer || typeof answer !== 'object' || typeof answer.conversationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(answer.conversationId) || answer.conversationUrl !== `${CHATGPT_CONVERSATION_ROOT}/${answer.conversationId}` || answer.tool !== MODE_TO_TOOL[mode]) fail('direct ask provider handoff is invalid', 'ERR_DIRECT_HANDOFF');
}

function disposition(error) {
  return typeof error?.code === 'string' && /^ERR_[A-Z0-9_]+$/.test(error.code) ? error.code : 'ERR_OPENCLI_UNKNOWN';
}

function directResultBase({ bundle, jobId, mode, intentSha256, handoffSha256 = null, conversationId = null, conversationUrl = null, tool = null, now }) {
  return { schema: 'm004.direct-result.v1', job_id: jobId, mode, rigor_protocol_id: bundle.rigor_protocol_id, rigor_protocol_version: bundle.rigor_protocol_version, rigor_profile_id: bundle.rigor_profile_id, rigor_profile_version: bundle.rigor_profile_version, rigor_profile_sha256: bundle.rigor_profile_sha256, citation_level: bundle.citation_level, audit_appendix: bundle.audit_appendix, intent_sha256: intentSha256, handoff_sha256: handoffSha256, conversation_id: conversationId, conversation_url: conversationUrl, tool, answer_path: null, answer_sha256: null, answer_bytes: null, report_path: null, report_sha256: null, report_bytes: null, sources: [], finished_at: now };
}

const DIRECT_RESULT_KEYS = Object.freeze(['schema', 'job_id', 'mode', 'rigor_protocol_id', 'rigor_protocol_version', 'rigor_profile_id', 'rigor_profile_version', 'rigor_profile_sha256', 'citation_level', 'audit_appendix', 'intent_sha256', 'handoff_sha256', 'conversation_id', 'conversation_url', 'tool', 'answer_path', 'answer_sha256', 'answer_bytes', 'report_path', 'report_sha256', 'report_bytes', 'sources', 'finished_at', 'status', 'process_disposition', 'remote_effect', 'retry_decision']);

function validateDeepCompletedResult(value, state, jobId) {
  if (!sameKeys(value, DIRECT_RESULT_KEYS) || value.schema !== 'm004.direct-result.v1' || value.status !== 'completed' || value.mode !== 'deep' || value.job_id !== jobId || value.intent_sha256 !== state.intentSha256 || value.handoff_sha256 !== state.handoffSha256 || value.conversation_id !== state.handoff.conversation_id || value.conversation_url !== state.handoff.conversation_url || value.tool !== 'Deep Research' || value.answer_path !== null || value.answer_sha256 !== null || value.answer_bytes !== null || value.report_path !== join(state.responseRoot, 'report.md') || !isHash(value.report_sha256) || !Number.isSafeInteger(value.report_bytes) || value.report_bytes < 1 || !Array.isArray(value.sources) || value.process_disposition !== 'exit_0_validated' || value.remote_effect !== 'completed' || value.retry_decision !== 'not_applicable' || !isCanonicalTime(value.finished_at)) fail('Deep completed result is invalid', 'ERR_DIRECT_RECEIPT');
  for (const key of ['rigor_protocol_id', 'rigor_protocol_version', 'rigor_profile_id', 'rigor_profile_version', 'rigor_profile_sha256', 'citation_level', 'audit_appendix']) if (value[key] !== state.bundle[key]) fail('Deep completed result provenance is invalid', 'ERR_DIRECT_RECEIPT');
  return value;
}

function validateDeepAmbiguousResult(value, bundle, intentSha256, jobId) {
  if (!sameKeys(value, DIRECT_RESULT_KEYS) || value.schema !== 'm004.direct-result.v1' || value.status !== 'ambiguous_effect' || value.mode !== 'deep' || value.job_id !== jobId || value.intent_sha256 !== intentSha256 || value.handoff_sha256 !== null || value.conversation_id !== null || value.conversation_url !== null || value.tool !== null || value.answer_path !== null || value.answer_sha256 !== null || value.answer_bytes !== null || value.report_path !== null || value.report_sha256 !== null || value.report_bytes !== null || !Array.isArray(value.sources) || value.sources.length !== 0 || value.remote_effect !== 'unknown' || value.retry_decision !== 'prohibited' || typeof value.process_disposition !== 'string' || !/^ERR_[A-Z0-9_]+$/.test(value.process_disposition) || !isCanonicalTime(value.finished_at)) fail('Deep ambiguous result is invalid', 'ERR_DIRECT_RECEIPT');
  for (const key of ['rigor_protocol_id', 'rigor_protocol_version', 'rigor_profile_id', 'rigor_profile_version', 'rigor_profile_sha256', 'citation_level', 'audit_appendix']) if (value[key] !== bundle[key]) fail('Deep ambiguous result provenance is invalid', 'ERR_DIRECT_RECEIPT');
  return value;
}

async function persistDirectResult(responseRoot, result, testSeam) {
  const finalPath = join(responseRoot, 'result.json');
  const stagingPath = join(responseRoot, `.result-staging-${randomUUID()}.json`);
  const payload = Buffer.from(`${canonicalJson(Object.freeze(result))}\n`);
  if (payload.length > RESPONSE_FILE_LIMIT) fail('direct response receipt exceeds its byte limit', 'ERR_DIRECT_RECEIPT');
  let handle;
  let published = false;
  try {
    handle = await open(stagingPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await handle.writeFile(payload);
      fault(testSeam, 'after-direct-result-write');
      await handle.sync();
    } finally {
      await handle.close();
      handle = undefined;
    }
    try { await link(stagingPath, finalPath); }
    catch (error) { if (error?.code === 'EEXIST') fail('direct response already exists', 'ERR_DIRECT_EXISTS'); throw error; }
    published = true;
    fault(testSeam, 'after-direct-result-publish');
    await syncDirectory(responseRoot);
    await unlink(stagingPath);
    return Object.freeze(result);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (published) {
      const [finalEntry, stagingEntry] = await Promise.all([lstat(finalPath).catch(() => null), lstat(stagingPath).catch(() => null)]);
      if (finalEntry?.isFile() && stagingEntry?.isFile() && finalEntry.dev === stagingEntry.dev && finalEntry.ino === stagingEntry.ino) {
        await unlink(finalPath);
        await syncDirectory(responseRoot);
      }
    }
    await rm(stagingPath, { force: true });
    throw error;
  }
}

async function readDeepResponse({ outputRoot, jobId }) {
  const bundle = await loadPreparedBundle({ outputRoot, jobId, allowedModes: ['deep'] });
  const responseRoot = join(bundle.job_root, 'response');
  const responseEntry = await lstat(responseRoot).catch(() => null);
  if (!responseEntry) return Object.freeze({ bundle, responseRoot, status: Object.freeze({ status: 'prepared', job_id: jobId, mode: 'deep' }) });
  if (!responseEntry.isDirectory() || responseEntry.isSymbolicLink()) fail('Deep response directory is invalid', 'ERR_DIRECT_RECEIPT');
  const intentPath = join(responseRoot, 'intent.json');
  const intentEntry = await lstat(intentPath).catch(() => null);
  if (!intentEntry) return Object.freeze({ bundle, responseRoot, status: Object.freeze({ status: 'prepared', job_id: jobId, mode: 'deep' }) });
  const intentBytes = await readResponseBytes(intentPath);
  const intentSha256 = hash(intentBytes);
  const intent = validateDeepIntent(parseCanonicalJsonBytes(intentBytes), bundle, jobId);
  const handoffPath = join(responseRoot, 'handoff.json');
  const handoffEntry = await lstat(handoffPath).catch(() => null);
  if (!handoffEntry) {
    const resultPath = join(responseRoot, 'result.json');
    const resultEntry = await lstat(resultPath).catch(() => null);
    if (resultEntry) {
      const resultBytes = await readResponseBytes(resultPath);
      const result = validateDeepAmbiguousResult(parseCanonicalJsonBytes(resultBytes), bundle, intentSha256, jobId);
      return Object.freeze({ bundle, responseRoot, intent, intentSha256, result, status: result });
    }
    return Object.freeze({ bundle, responseRoot, intent, intentSha256, status: Object.freeze({ status: 'attention_required', job_id: jobId, mode: 'deep', intent_sha256: intentSha256, retry_decision: 'prohibited' }) });
  }
  const handoffBytes = await readResponseBytes(handoffPath);
  const handoffSha256 = hash(handoffBytes);
  const handoff = validateDeepHandoff(parseCanonicalJsonBytes(handoffBytes), intentSha256, jobId);
  const resultPath = join(responseRoot, 'result.json');
  const resultEntry = await lstat(resultPath).catch(() => null);
  if (resultEntry) {
    const resultBytes = await readResponseBytes(resultPath);
    const result = validateDeepCompletedResult(parseCanonicalJsonBytes(resultBytes), { bundle, responseRoot, intentSha256, handoffSha256, handoff }, jobId);
    const report = await readResponseBytes(result.report_path, 256 * 1024).catch(() => fail('Deep completed report is unavailable', 'ERR_DIRECT_RECEIPT'));
    if (hash(report) !== result.report_sha256 || report.length !== result.report_bytes || report.toString('utf8').trim().length === 0) fail('Deep completed report is invalid', 'ERR_DIRECT_RECEIPT');
    return Object.freeze({ bundle, responseRoot, intent, intentSha256, handoff, handoffSha256, result, status: result });
  }
  const runningPath = join(responseRoot, 'running.json');
  const runningEntry = await lstat(runningPath).catch(() => null);
  if (!runningEntry) return Object.freeze({ bundle, responseRoot, intent, intentSha256, handoff, handoffSha256, status: Object.freeze({ ...handoff }) });
  const running = validateDeepRunning(parseCanonicalJsonBytes(await readResponseBytes(runningPath)), intentSha256, handoffSha256, handoff, jobId);
  return Object.freeze({ bundle, responseRoot, intent, intentSha256, handoff, handoffSha256, running, status: running });
}

function validateCollectionLock(value) {
  if (!sameKeys(value, ['schema', 'nonce', 'pid', 'acquired_at']) || value.schema !== 'm006.deep-collector-lock.v1' || typeof value.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(value.nonce) || !Number.isSafeInteger(value.pid) || value.pid < 1 || !isCanonicalTime(value.acquired_at)) fail('Deep collector lock is invalid', 'ERR_DIRECT_LOCK');
  return value;
}

function isOwnerLive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error?.code === 'ESRCH') return false; if (error?.code === 'EPERM') return true; throw error; }
}

function sameInode(left, right) { return left?.dev === right?.dev && left?.ino === right?.ino; }

function sameCollectionLock(left, right) {
  return sameInode(left?.entry, right?.entry) && (right?.owner ? left?.owner?.nonce === right.owner.nonce : left?.owner === null);
}

async function readCollectionLock(path) {
  const entry = await lstat(path).catch(() => null);
  if (!entry) return null;
  if (!entry.isFile() || entry.isSymbolicLink()) fail('Deep collector lock is invalid', 'ERR_DIRECT_LOCK');
  return Object.freeze({ entry: Object.freeze({ dev: entry.dev, ino: entry.ino }), owner: entry.size === 0 ? null : validateCollectionLock(parseCanonicalJsonBytes(await readResponseBytes(path))) });
}

async function finishLockRemoval(path, lock) {
  const gatePath = `${path}.reclaim`;
  let gate = await readCollectionLock(gatePath);
  if (!gate) {
    try { await link(path, gatePath); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    gate = await readCollectionLock(gatePath);
  }
  const current = await readCollectionLock(path);
  if (!sameCollectionLock(gate, lock) || !sameCollectionLock(current, lock)) return false;
  try { await unlink(path); }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
  await syncDirectory(dirname(path));
  const finalGate = await readCollectionLock(gatePath);
  if (!sameCollectionLock(finalGate, lock)) return false;
  try { await unlink(gatePath); }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
  await syncDirectory(dirname(path));
  return true;
}

async function recoverReclaimGate(path) {
  const gatePath = `${path}.reclaim`;
  const gate = await readCollectionLock(gatePath);
  if (!gate) return true;
  if (gate.owner && isOwnerLive(gate.owner.pid)) return false;
  const lock = await readCollectionLock(path);
  if (sameCollectionLock(lock, gate)) return finishLockRemoval(path, gate);
  try { await unlink(gatePath); }
  catch (error) { if (error?.code === 'ENOENT') return true; throw error; }
  await syncDirectory(dirname(path));
  return true;
}

async function acquireCollectionLock(responseRoot, now) {
  const path = join(responseRoot, '.collect.lock');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await recoverReclaimGate(path))) return Object.freeze({ path, owner: null, acquired: false });
    const owner = Object.freeze({ schema: 'm006.deep-collector-lock.v1', nonce: randomUUID(), pid: process.pid, acquired_at: now() });
    const stagingPath = join(responseRoot, `.collect-lock-${owner.nonce}.json`);
    await writeDurableJson(stagingPath, owner, responseRoot);
    try {
      await link(stagingPath, path);
      const entry = await lstat(path);
      return Object.freeze({ path, owner, entry: Object.freeze({ dev: entry.dev, ino: entry.ino }), acquired: true, stagingPath });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readCollectionLock(path);
      if (!existing) continue;
      if (!existing.owner || !isOwnerLive(existing.owner.pid)) { await finishLockRemoval(path, existing); continue; }
      return Object.freeze({ path, owner: null, acquired: false, stagingPath });
    } finally {
      await unlink(stagingPath).catch(() => {});
    }
  }
  return Object.freeze({ path, owner: null, acquired: false });
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function waitForCollection(responseRoot, outputRoot, jobId) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const state = await readDeepResponse({ outputRoot, jobId });
    if (state.status.status === 'completed') return state.result;
    const lock = await lstat(join(responseRoot, '.collect.lock')).catch(() => null);
    if (!lock) return null;
    await delay(10);
  }
  return null;
}

export async function getDeepPreparedJobStatus({ outputRoot, jobId } = {}) {
  const state = await readDeepResponse({ outputRoot, jobId });
  return Object.freeze(state.status);
}

async function collectDeepPreparedJobInternal({ outputRoot, jobId, openCliPath, wait, transportOptions = {}, now = () => new Date().toISOString(), preflight = preflightOpenCli, readDeep = runOpenCliDeepResearchResult, readStatus = runOpenCliDeepResearchStatus, receiptTestSeam } = {}) {
  let state = await readDeepResponse({ outputRoot, jobId });
  if (state.status.status !== 'running' && state.status.status !== 'accepted') return Object.freeze(state.status);
  const lock = await acquireCollectionLock(state.responseRoot, now);
  if (!lock.acquired) {
    const completed = await waitForCollection(state.responseRoot, outputRoot, jobId);
    return completed ?? Object.freeze((await readDeepResponse({ outputRoot, jobId })).status);
  }
  try {
    state = await readDeepResponse({ outputRoot, jobId });
    if (state.status.status !== 'running' && state.status.status !== 'accepted') return Object.freeze(state.status);
    const { deepTimeoutSeconds, runtimeOptions } = directTransportOptions(transportOptions);
    let observation;
    try {
      const identity = await preflight({ ...runtimeOptions, executablePath: openCliPath });
      observation = await (wait ? readDeep : readStatus)({ ...runtimeOptions, executablePath: openCliPath, identity, conversationId: state.handoff.conversation_id, timeoutSeconds: deepTimeoutSeconds });
    } catch (error) {
      return Object.freeze({ ...state.status, collection_disposition: disposition(error) });
    }
    if (observation?.status === 'not_ready') return Object.freeze(state.status);
    if (!observation || observation.conversationId !== state.handoff.conversation_id || observation.status !== 'completed' || typeof observation.report !== 'string' || observation.report.trim().length === 0 || !Array.isArray(observation.sources)) return Object.freeze({ ...state.status, collection_disposition: 'ERR_OPENCLI_OUTPUT' });
    try { canonicalJson(observation.sources); }
    catch (error) { return Object.freeze({ ...state.status, collection_disposition: disposition(error) }); }
    const reportPayload = Buffer.from(observation.report);
    const reportPath = join(state.responseRoot, 'report.md');
    try { await writeDurableExclusive(reportPath, reportPayload, state.responseRoot); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const report = await readResponseBytes(reportPath, 256 * 1024);
    const reportSha256 = hash(report);
    if (reportSha256 !== hash(reportPayload) || report.length !== reportPayload.length) fail('Deep report publication raced with a different payload', 'ERR_DIRECT_RECEIPT');
    const result = { ...directResultBase({ bundle: state.bundle, jobId, mode: 'deep', intentSha256: state.intentSha256, handoffSha256: state.handoffSha256, conversationId: state.handoff.conversation_id, conversationUrl: state.handoff.conversation_url, tool: state.handoff.tool, now: now() }), status: 'completed', process_disposition: 'exit_0_validated', remote_effect: 'completed', retry_decision: 'not_applicable', report_path: reportPath, report_sha256: reportSha256, report_bytes: report.length, sources: observation.sources };
    try { return await persistDirectResult(state.responseRoot, result, receiptTestSeam); }
    catch (error) {
      if (error?.code !== 'ERR_DIRECT_EXISTS') throw error;
      return (await readDeepResponse({ outputRoot, jobId })).result;
    }
  } finally { if (lock.owner) await finishLockRemoval(lock.path, { entry: lock.entry, owner: lock.owner }); }
}

export async function collectDeepPreparedJob(options = {}) { return collectDeepPreparedJobInternal({ ...options, wait: false }); }
export async function waitDeepPreparedJob(options = {}) { return collectDeepPreparedJobInternal({ ...options, wait: true }); }

async function readStableWebDetail(readDetail, detailOptions) {
  await readDetail(detailOptions);
  const second = await readDetail(detailOptions);
  const third = await readDetail(detailOptions);
  if (third.response !== second.response) {
    fail('ChatGPT Web answer did not stabilize before the bounded read limit', 'ERR_OPENCLI_DETAIL_UNSTABLE');
  }
  return third;
}

export async function submitDirectPreparedJob({ mode, outputRoot, jobId, jobPath, openCliPath, transportOptions = {}, now = () => new Date().toISOString(), preflight = preflightOpenCli, ask = runOpenCliAsk, readDetail = runOpenCliDetail, readDeep = runOpenCliDeepResearchResult, receiptTestSeam } = {}) {
  const bundle = await loadPreparedBundle({ outputRoot, jobId, allowedModes: [mode] });
  if (bundle.mode !== mode || bundle.job_root !== jobPath) fail('prepared job does not match direct ask', 'ERR_DIRECT_ASK_JOB');
  const { askTimeoutSeconds, deepTimeoutSeconds, runtimeOptions } = directTransportOptions(transportOptions);
  const responseRoot = join(jobPath, 'response');
  if (mode === 'deep' && await lstat(responseRoot).catch(() => null)) fail('direct response already exists', 'ERR_DIRECT_EXISTS');
  const identity = await preflight({ ...runtimeOptions, executablePath: openCliPath });
  const intent = Object.freeze({
    schema: 'm004.direct-intent.v1',
    status: 'dispatching',
    job_id: jobId,
    mode,
    prompt_sha256: bundle.prompt_sha256,
    opencli_path: openCliPath,
    opencli_version: identity.version,
    intent_recorded_at: now()
  });
  const intentSha256 = await publishDirectIntent({ jobPath, responseRoot, intent, receiptTestSeam });
  let answer;
  try {
    answer = await ask({ ...runtimeOptions, executablePath: openCliPath, identity, prompt: bundle.prompt, mode, timeoutSeconds: askTimeoutSeconds });
    validateHandoff(answer, mode);
  } catch (error) {
    return persistDirectResult(responseRoot, { ...directResultBase({ bundle, jobId, mode, intentSha256, now: now() }), status: 'ambiguous_effect', process_disposition: disposition(error), remote_effect: 'unknown', retry_decision: 'prohibited' });
  }
  const handoff = Object.freeze({
    schema: 'm004.direct-handoff.v1',
    status: 'accepted',
    job_id: jobId,
    mode,
    intent_sha256: intentSha256,
    conversation_id: answer.conversationId,
    conversation_url: answer.conversationUrl,
    tool: answer.tool,
    accepted_at: now()
  });
  const handoffSha256 = await writeDurableJson(join(responseRoot, 'handoff.json'), handoff, responseRoot);
  if (mode === 'deep') {
    const running = Object.freeze({
      schema: 'm006.deep-running.v1',
      status: 'running',
      job_id: jobId,
      mode,
      intent_sha256: intentSha256,
      handoff_sha256: handoffSha256,
      conversation_id: answer.conversationId,
      conversation_url: answer.conversationUrl,
      tool: answer.tool,
      accepted_at: handoff.accepted_at,
      running_at: now(),
      remote_effect: 'accepted'
    });
    await writeDurableJson(join(responseRoot, 'running.json'), running, responseRoot);
    return running;
  }
  let answerPath = null; let answerSha256 = null; let answerBytes = null; let report; let reportPath = null; let reportSha256 = null; let reportBytes = null;
  try {
    {
      const detailOptions = { ...runtimeOptions, executablePath: openCliPath, identity, conversationId: answer.conversationId, timeoutSeconds: askTimeoutSeconds };
      const detail = mode === 'web'
        ? await readStableWebDetail(readDetail, detailOptions)
        : await readDetail(detailOptions);
      const answerPayload = Buffer.from(detail.response);
      answerPath = join(responseRoot, 'answer.md');
      answerSha256 = await writeDurableExclusive(answerPath, answerPayload, responseRoot);
      answerBytes = answerPayload.length;
    }
    const result = { ...directResultBase({ bundle, jobId, mode, intentSha256, handoffSha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, tool: answer.tool, now: now() }), status: 'completed', process_disposition: 'exit_0_validated', remote_effect: 'completed', retry_decision: 'not_applicable', answer_path: answerPath, answer_sha256: answerSha256, answer_bytes: answerBytes, report_path: reportPath, report_sha256: reportSha256, report_bytes: reportBytes, sources: report?.sources ?? [] };
    canonicalJson(result);
    return await persistDirectResult(responseRoot, result, receiptTestSeam);
  } catch (error) {
    await persistDirectResult(responseRoot, { ...directResultBase({ bundle, jobId, mode, intentSha256, handoffSha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, tool: answer.tool, now: now() }), status: 'recovery_required', process_disposition: disposition(error), remote_effect: 'accepted', retry_decision: 'prohibited' });
    throw error;
  }
}

export async function directAsk({ question, prompt, mode, rigorProfile, rigorProfileVersion, rigorProfileFile, citationLevel, auditAppendix, outputRoot, openCliPath, transportOptions, clock = () => new Date().toISOString(), newJobId, newTurnId, submit = submitDirectPreparedJob, templatesRoot: templateRoot = templatesRoot, rigorRoot: profileRoot = rigorRoot } = {}) {
  if (question !== undefined && prompt !== undefined) fail('provide question or prompt, not both', 'ERR_DIRECT_ASK_INPUT');
  if (typeof outputRoot !== 'string' || !isAbsolute(outputRoot)) fail('output root must be absolute', 'ERR_DIRECT_ASK_OUTPUT');
  if (typeof openCliPath !== 'string' || !isAbsolute(openCliPath)) fail('OpenCLI path must be absolute', 'ERR_OPENCLI_PATH');
  const requestedMode = mode ?? 'standard';
  if (!['standard', 'web', 'deep'].includes(requestedMode)) fail('mode must be standard, web, or deep', 'ERR_DIRECT_ASK_MODE');
  const request = { question: question ?? prompt, template_id: 'research-question', template_version: '1.0.0' };
  if (mode !== undefined) request.mode = mode;
  if (requestedMode !== 'standard') request.mode_reason = 'direct-ask';
  if (rigorProfile !== undefined) request.rigor_profile = rigorProfile;
  if (rigorProfileVersion !== undefined) request.rigor_profile_version = rigorProfileVersion;
  if (rigorProfileFile !== undefined) request.rigor_profile_file = rigorProfileFile;
  if (citationLevel !== undefined) request.citation_level = citationLevel;
  if (auditAppendix !== undefined) request.audit_appendix = auditAppendix;
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const job = await prepareResearchJob({ request, outputRoot, templatesRoot: templateRoot, rigorRoot: profileRoot, now: clock(), newJobId, newTurnId });
  const jobPath = join(outputRoot, 'jobs', job.job_id);
  const result = await submit({ mode: job.mode, outputRoot, jobId: job.job_id, jobPath, openCliPath, transportOptions, now: clock });
  return Object.freeze({ job, jobPath, result });
}
