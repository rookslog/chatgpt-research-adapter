import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { canonicalJson } from './canonical-json.js';
import { OPENCLI_COMMAND_CONTRACT_SHA256 } from './opencli-transport.js';

const HASH = /^[0-9a-f]{64}$/;
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CHATGPT_CONVERSATION_ROOT = ['https:', '', 'chatgpt.com', 'c'].join('/');
const fail = (message, code) => { const error = new Error(message); error.code = code; throw error; };
const fault = (seam, point) => { if (seam?.failAt === point) fail(`injected fault at ${point}`, 'ERR_INJECTED_FAULT'); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function time(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail('dispatch time must be canonical UTC', 'ERR_DISPATCH_TIME'); }
function bundleValue(bundle, key) { if (!bundle || typeof bundle[key] !== 'string' || bundle[key].length === 0) fail('dispatch bundle identity is invalid', 'ERR_DISPATCH_SCHEMA'); return bundle[key]; }
function rigorIdentity(bundle) {
  if (bundle?.rigor_protocol_id !== 'chatgpt-research-epistemic' || bundle?.rigor_protocol_version !== '1.0.0' || !HASH.test(bundle?.rigor_profile_sha256 ?? '') || !['principal', 'expanded'].includes(bundle?.citation_level) || typeof bundle?.audit_appendix !== 'boolean') fail('dispatch rigor identity is invalid', 'ERR_DISPATCH_SCHEMA');
  return { rigor_protocol_id: bundle.rigor_protocol_id, rigor_protocol_version: bundle.rigor_protocol_version, rigor_profile_id: bundleValue(bundle, 'rigor_profile_id'), rigor_profile_version: bundleValue(bundle, 'rigor_profile_version'), rigor_profile_sha256: bundle.rigor_profile_sha256, citation_level: bundle.citation_level, audit_appendix: bundle.audit_appendix };
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } catch (error) { if (!['EINVAL', 'ENOTSUP', 'ENOSYS'].includes(error?.code)) throw error; } finally { await handle.close(); }
}

async function requireDirectory(path) {
  const entry = await lstat(path).catch(() => fail('dispatch directory is unavailable', 'ERR_DISPATCH_PATH'));
  if (!entry.isDirectory() || entry.isSymbolicLink()) fail('dispatch path must be a regular directory', 'ERR_DISPATCH_PATH');
}

async function verifyIntent(dispatchRoot, expectedHash) {
  const path = join(dispatchRoot, 'intent.json'); const entry = await lstat(path).catch(() => fail('dispatch intent is unavailable', 'ERR_DISPATCH_INTENT'));
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 64 * 1024) fail('dispatch intent is invalid', 'ERR_DISPATCH_INTENT');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => fail('dispatch intent is unavailable', 'ERR_DISPATCH_INTENT'));
  try {
    const info = await handle.stat(); if (!info.isFile() || info.dev !== entry.dev || info.ino !== entry.ino || info.size !== entry.size) fail('dispatch intent identity changed', 'ERR_DISPATCH_INTENT');
    const bytes = Buffer.alloc(info.size); let offset = 0;
    while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (bytesRead === 0) fail('dispatch intent was truncated', 'ERR_DISPATCH_INTENT'); offset += bytesRead; }
    if (hash(bytes) !== expectedHash) fail('dispatch intent hash mismatch', 'ERR_DISPATCH_INTENT');
  } finally { await handle.close(); }
}

async function writeExclusive(path, bytes, name, seam) {
  let handle;
  try { handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600); }
  catch (error) { if (error?.code === 'EEXIST') fail('dispatch artifact already exists', 'ERR_DISPATCH_EXISTS'); throw error; }
  try {
    fault(seam, `after-${name}-open`); await handle.writeFile(bytes); fault(seam, `after-${name}-write`); await handle.sync(); fault(seam, `after-${name}-sync`);
  } finally { await handle.close(); fault(seam, `after-${name}-close`); }
}

export function createDispatchIntent({ bundle, executable, now } = {}) {
  time(now);
  if (!ID.test(bundle?.job_id ?? '') || !ID.test(bundle?.turn_id ?? '') || bundle?.mode !== 'standard' || !HASH.test(bundle?.prompt_sha256 ?? '') || !HASH.test(bundle?.template_sha256 ?? '') || !HASH.test(bundle?.template_body_sha256 ?? '')) fail('dispatch bundle identity is invalid', 'ERR_DISPATCH_SCHEMA');
  if (!executable || executable.version !== '1.8.7' || !isAbsolute(executable.supplied_path ?? '') || !isAbsolute(executable.real_path ?? '') || !HASH.test(executable.sha256 ?? '') || !Number.isSafeInteger(executable.size) || executable.size <= 0 || typeof executable.device !== 'string' || typeof executable.inode !== 'string') fail('dispatch executable identity is invalid', 'ERR_DISPATCH_SCHEMA');
  return Object.freeze({ schema: 'm003.dispatch-intent.v1', job_id: bundle.job_id, turn_id: bundle.turn_id, attempt: 1, template_id: bundleValue(bundle, 'template_id'), template_version: bundleValue(bundle, 'template_version'), template_sha256: bundle.template_sha256, template_body_sha256: bundle.template_body_sha256, mode: 'standard', mode_reason: bundleValue(bundle, 'mode_reason'), ...rigorIdentity(bundle), prompt_sha256: bundle.prompt_sha256, command_contract_sha256: OPENCLI_COMMAND_CONTRACT_SHA256, executable: Object.freeze({ supplied_path: executable.supplied_path, real_path: executable.real_path, sha256: executable.sha256, size: executable.size, device: executable.device, inode: executable.inode, version: executable.version }), intent_recorded_at: now, retry_policy: 'none' });
}

export async function persistDispatchIntent({ jobRoot, intent, testSeam } = {}) {
  if (typeof jobRoot !== 'string' || !isAbsolute(jobRoot) || !intent || intent.schema !== 'm003.dispatch-intent.v1') fail('dispatch intent is invalid', 'ERR_DISPATCH_SCHEMA');
  await requireDirectory(jobRoot);
  const dispatchRoot = join(jobRoot, 'dispatch');
  try { await mkdir(dispatchRoot, { mode: 0o700 }); } catch (error) { if (error?.code === 'EEXIST') fail('dispatch already exists', 'ERR_DISPATCH_EXISTS'); throw error; }
  fault(testSeam, 'after-dispatch-directory');
  await syncDirectory(jobRoot);
  const bytes = Buffer.from(`${canonicalJson(intent)}\n`);
  await writeExclusive(join(dispatchRoot, 'intent.json'), bytes, 'intent', testSeam);
  await syncDirectory(dispatchRoot);
  fault(testSeam, 'after-intent-directory-sync');
  return Object.freeze({ intent_sha256: hash(bytes), intent_path: join(dispatchRoot, 'intent.json') });
}

function baseResult({ bundle, intentSha256, now }) {
  time(now);
  if (!ID.test(bundle?.job_id ?? '') || !ID.test(bundle?.turn_id ?? '') || !HASH.test(intentSha256 ?? '')) fail('dispatch result identity is invalid', 'ERR_DISPATCH_SCHEMA');
  return { schema: 'm003.dispatch-result.v1', job_id: bundle.job_id, turn_id: bundle.turn_id, attempt: 1, ...rigorIdentity(bundle), intent_sha256: intentSha256, finished_at: now };
}

async function persistResultFile(jobRoot, result, seam) {
  const dispatchRoot = join(jobRoot, 'dispatch'); await requireDirectory(dispatchRoot); await verifyIntent(dispatchRoot, result.intent_sha256);
  await writeExclusive(join(dispatchRoot, 'result.json'), Buffer.from(`${canonicalJson(result)}\n`), 'result', seam); await syncDirectory(dispatchRoot); fault(seam, 'after-result-directory-sync'); return Object.freeze(result);
}

export async function persistCompletedResult({ jobRoot, bundle, intentSha256, answer, conversationId, conversationUrl, now, testSeam } = {}) {
  const base = baseResult({ bundle, intentSha256, now });
  if (typeof answer !== 'string' || answer.trim().length === 0 || Buffer.byteLength(answer) > 256 * 1024 || typeof conversationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(conversationId) || conversationUrl !== `${CHATGPT_CONVERSATION_ROOT}/${conversationId}`) fail('completed dispatch result is invalid', 'ERR_DISPATCH_SCHEMA');
  const dispatchRoot = join(jobRoot, 'dispatch'); await requireDirectory(dispatchRoot); await verifyIntent(dispatchRoot, intentSha256);
  const answerBytes = Buffer.from(answer);
  await writeExclusive(join(dispatchRoot, 'answer.md'), answerBytes, 'answer', testSeam); await syncDirectory(dispatchRoot); fault(testSeam, 'after-answer-directory-sync');
  const result = { ...base, status: 'completed', process_disposition: 'exit_0_validated', remote_effect: 'completed', conversation_id: conversationId, conversation_url: conversationUrl, answer_sha256: hash(answerBytes), answer_bytes: answerBytes.length, retry_decision: 'not_applicable' };
  return persistResultFile(jobRoot, result, testSeam);
}

export async function persistAmbiguousResult({ jobRoot, bundle, intentSha256, disposition, now, testSeam } = {}) {
  const base = baseResult({ bundle, intentSha256, now });
  if (typeof disposition !== 'string' || !/^ERR_[A-Z0-9_]+$/.test(disposition)) fail('ambiguous disposition is invalid', 'ERR_DISPATCH_SCHEMA');
  const result = { ...base, status: 'ambiguous_effect', process_disposition: disposition, remote_effect: 'unknown', conversation_id: null, conversation_url: null, answer_sha256: null, answer_bytes: null, retry_decision: 'prohibited' };
  return persistResultFile(jobRoot, result, testSeam);
}
