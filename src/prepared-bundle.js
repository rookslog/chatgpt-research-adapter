import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { canonicalJson } from './canonical-json.js';
import { parseStrictJsonBuffer } from './strict-json.js';

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const HASH = /^[0-9a-f]{64}$/;
const RIGOR_KEYS = ['audit_appendix', 'citation_level', 'rigor_profile_id', 'rigor_profile_sha256', 'rigor_profile_version', 'rigor_protocol_id', 'rigor_protocol_version'];
const CREATED_KEYS = ['caller', 'job_id', 'mode', 'mode_reason', 'pacing_decision', ...RIGOR_KEYS, 'schema', 'sequence', 'state', 'template_body_sha256', 'template_id', 'template_sha256', 'template_version', 'time', 'type'];
const PREPARED_KEYS = ['accepted_at', 'answer_sha256', 'attempt', 'caller', 'completed_at', 'conversation_reference', 'job_id', 'mode', 'mode_reason', 'prior_turn_id', 'prompt_sha256', 'remote_effect', ...RIGOR_KEYS, 'schema', 'sequence', 'state', 'submitted_at', 'template_body_sha256', 'template_id', 'template_sha256', 'template_version', 'time', 'transport_status', 'turn_id', 'type', 'unknown_at'];
const CURRENT_KEYS = ['job', 'schema', 'turn'];
const JOB_KEYS = ['caller', 'created_at', 'job_id', 'mode', 'mode_reason', 'pacing_decision', ...RIGOR_KEYS, 'state', 'template_body_sha256', 'template_id', 'template_sha256', 'template_version'];
const TURN_KEYS = ['accepted_at', 'answer_sha256', 'attempt', 'completed_at', 'conversation_reference', 'prepared_at', 'prior_turn_id', 'prompt_sha256', 'remote_effect', 'state', 'submitted_at', 'transport_status', 'turn_id', 'unknown_at'];
const fail = (message, code = 'ERR_PREPARED_BUNDLE') => { const error = new Error(message); error.code = code; throw error; };

function exactKeys(value, keys) { return value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).sort().join('\n') === [...keys].sort().join('\n'); }
function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }

async function requireDirectory(path) {
  const entry = await lstat(path).catch(() => fail('prepared bundle directory is unavailable'));
  if (!entry.isDirectory() || entry.isSymbolicLink()) fail('prepared bundle path must be a regular directory');
}

async function readBounded(path, limit) {
  const entry = await lstat(path).catch(() => fail('prepared bundle file is unavailable'));
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > limit) fail('prepared bundle file is invalid');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => fail('prepared bundle file is unavailable'));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit || info.dev !== entry.dev || info.ino !== entry.ino) fail('prepared bundle file identity changed');
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (bytesRead === 0) fail('prepared bundle file was truncated'); offset += bytesRead; }
    return bytes;
  } finally { await handle.close(); }
}

function parseEvents(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail('events must be UTF-8'); }
  if (!text.endsWith('\n')) fail('events must end with newline');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== 2 || lines.some((line) => line.length === 0)) fail('events must contain exactly two lines');
  const events = lines.map((line) => { try { return parseStrictJsonBuffer(Buffer.from(line), { requireObjectRoot: true }); } catch { fail('events JSON is invalid'); } });
  if (`${events.map(canonicalJson).join('\n')}\n` !== text) fail('events must use canonical JSONL');
  return events;
}

function validateBundle(jobId, events, current, promptBytes, allowedModes) {
  const [created, prepared] = events;
  if (!exactKeys(created, CREATED_KEYS) || !exactKeys(prepared, PREPARED_KEYS) || !exactKeys(current, CURRENT_KEYS) || !exactKeys(current.job, JOB_KEYS) || !exactKeys(current.turn, TURN_KEYS)) fail('prepared bundle schema is invalid');
  const common = ['caller', 'job_id', 'mode', 'mode_reason', ...RIGOR_KEYS, 'template_body_sha256', 'template_id', 'template_sha256', 'template_version'];
  if (!common.every((key) => equal(created[key], prepared[key])) || created.job_id !== jobId) fail('prepared event identity is inconsistent');
  if (created.schema !== 'm002.prepared.v1' || created.type !== 'job_created' || created.sequence !== 1 || created.caller !== 'codex' || created.pacing_decision !== 'not_applicable_pre_dispatch' || created.state !== 'preparing') fail('job-created event is invalid');
  if (prepared.schema !== 'm002.prepared.v1' || prepared.type !== 'turn_prepared' || prepared.sequence !== 2 || !ID.test(prepared.turn_id ?? '') || prepared.attempt !== 1 || prepared.prior_turn_id !== null || prepared.state !== 'prepared' || prepared.transport_status !== 'not_dispatched') fail('turn-prepared event is invalid');
  for (const key of ['conversation_reference', 'submitted_at', 'accepted_at', 'unknown_at', 'completed_at', 'answer_sha256', 'remote_effect']) if (prepared[key] !== null) fail('prepared event contains remote state');
  if (!allowedModes.includes(created.mode)) fail('prepared mode is not allowed for this dispatch', 'ERR_PREPARED_MODE');
  if (![created.template_sha256, created.template_body_sha256, created.rigor_profile_sha256, prepared.prompt_sha256].every((value) => HASH.test(value ?? '')) || hash(promptBytes) !== prepared.prompt_sha256) fail('prepared hashes are invalid');
  if (created.rigor_protocol_id !== 'chatgpt-research-epistemic' || created.rigor_protocol_version !== '1.0.0' || !['principal', 'expanded'].includes(created.citation_level) || typeof created.audit_appendix !== 'boolean') fail('prepared rigor identity is invalid');
  if (!exactKeys(current, CURRENT_KEYS) || current.schema !== 'm002.prepared.v1') fail('current state is invalid');
  const rigor = Object.fromEntries(RIGOR_KEYS.map((key) => [key, created[key]]));
  const expectedJob = { job_id: created.job_id, caller: created.caller, template_id: created.template_id, template_version: created.template_version, template_sha256: created.template_sha256, template_body_sha256: created.template_body_sha256, mode: created.mode, mode_reason: created.mode_reason, ...rigor, state: 'prepared', pacing_decision: created.pacing_decision, created_at: created.time };
  const expectedTurn = { turn_id: prepared.turn_id, attempt: 1, prior_turn_id: null, prompt_sha256: prepared.prompt_sha256, state: 'prepared', transport_status: 'not_dispatched', conversation_reference: null, submitted_at: null, accepted_at: null, unknown_at: null, completed_at: null, answer_sha256: null, remote_effect: null, prepared_at: prepared.time };
  if (!equal(current.job, expectedJob) || !equal(current.turn, expectedTurn)) fail('current state disagrees with events');
  if (created.time !== prepared.time) fail('prepared event times disagree');
}

export async function loadPreparedBundle({ outputRoot, jobId, allowedModes = ['standard'] } = {}) {
  if (typeof outputRoot !== 'string' || !isAbsolute(outputRoot)) fail('output root must be absolute', 'ERR_PREPARED_ROOT');
  if (typeof jobId !== 'string' || !ID.test(jobId)) fail('invalid prepared job id', 'ERR_PREPARED_ID');
  if (!Array.isArray(allowedModes) || allowedModes.length === 0 || allowedModes.some((mode) => !['standard', 'web', 'deep'].includes(mode))) fail('allowed prepared modes are invalid', 'ERR_PREPARED_MODE');
  const jobsRoot = join(outputRoot, 'jobs'); const jobRoot = join(jobsRoot, jobId);
  await requireDirectory(outputRoot); await requireDirectory(jobsRoot); await requireDirectory(jobRoot);
  const [eventsBytes, currentBytes, promptBytes] = await Promise.all([readBounded(join(jobRoot, 'events.jsonl'), 128 * 1024), readBounded(join(jobRoot, 'current.json'), 64 * 1024), readBounded(join(jobRoot, 'prompt.txt'), 64 * 1024)]);
  const events = parseEvents(eventsBytes);
  let current;
  try { current = parseStrictJsonBuffer(currentBytes, { requireObjectRoot: true }); } catch { fail('current JSON is invalid'); }
  if (`${canonicalJson(current)}\n` !== currentBytes.toString('utf8')) fail('current state must use canonical JSON');
  validateBundle(jobId, events, current, promptBytes, allowedModes);
  let prompt;
  try { prompt = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(promptBytes); } catch { fail('prompt must be UTF-8'); }
  const rigor = Object.fromEntries(RIGOR_KEYS.map((key) => [key, current.job[key]]));
  return deepFreeze({ job_id: jobId, turn_id: current.turn.turn_id, template_id: current.job.template_id, template_version: current.job.template_version, template_sha256: current.job.template_sha256, template_body_sha256: current.job.template_body_sha256, mode: current.job.mode, mode_reason: current.job.mode_reason, ...rigor, prompt_sha256: current.turn.prompt_sha256, prompt, events, current, job_root: jobRoot });
}
