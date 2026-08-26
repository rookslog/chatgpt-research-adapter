import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalJson } from './canonical-json.js';

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const HASH = /^[0-9a-f]{64}$/;
const fail = (message, code) => { const error = new Error(message); error.code = code; throw error; };
const fault = (seam, point) => { if (seam?.failAt === point) fail(`injected fault at ${point}`, 'ERR_INJECTED_FAULT'); };

function canonicalTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail('time must be canonical UTC', 'ERR_RECEIPT_TIME');
}

function validate({ outputRoot, job, turn, compiled, now }) {
  if (typeof outputRoot !== 'string' || outputRoot.length === 0) fail('output root is required', 'ERR_RECEIPT_ROOT');
  if (!job || !ID.test(job.job_id ?? '')) fail('invalid job id', 'ERR_RECEIPT_ID');
  if (!turn || !ID.test(turn.turn_id ?? '')) fail('invalid turn id', 'ERR_RECEIPT_ID');
  canonicalTime(now);
  if (!compiled || typeof compiled.prompt !== 'string' || !['template_id', 'template_version', 'template_sha256', 'template_body_sha256', 'prompt_sha256', 'mode', 'mode_reason', 'rigor_protocol_id', 'rigor_protocol_version', 'rigor_profile_id', 'rigor_profile_version', 'rigor_profile_sha256', 'citation_level', 'audit_appendix'].every((key) => key in compiled) || ![compiled.template_sha256, compiled.template_body_sha256, compiled.prompt_sha256, compiled.rigor_profile_sha256].every((hash) => HASH.test(hash)) || compiled.rigor_protocol_id !== 'chatgpt-research-epistemic' || compiled.rigor_protocol_version !== '1.0.0' || !['principal', 'expanded'].includes(compiled.citation_level) || typeof compiled.audit_appendix !== 'boolean' || createHash('sha256').update(Buffer.from(compiled.prompt, 'utf8')).digest('hex') !== compiled.prompt_sha256) fail('invalid compiled prompt', 'ERR_RECEIPT_COMPILED');
}

async function validateOutputRoot(outputRoot, jobsRoot) {
  const root = await lstat(outputRoot).catch(() => fail('output root must exist', 'ERR_RECEIPT_ROOT'));
  if (!root.isDirectory() || root.isSymbolicLink()) fail('output root must be a regular directory', 'ERR_RECEIPT_ROOT');
  let jobs;
  try { jobs = await lstat(jobsRoot); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (jobs && (!jobs.isDirectory() || jobs.isSymbolicLink())) fail('jobs root must be a regular directory', 'ERR_RECEIPT_ROOT');
  if (!jobs) {
    try { await mkdir(jobsRoot); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    jobs = await lstat(jobsRoot).catch(() => fail('jobs root unavailable', 'ERR_RECEIPT_ROOT'));
    if (!jobs.isDirectory() || jobs.isSymbolicLink()) fail('jobs root must be a regular directory', 'ERR_RECEIPT_ROOT');
  }
}

async function writeExclusive(path, bytes, name, seam) {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    fault(seam, `after-${name}-open`);
    await handle.writeFile(bytes);
    fault(seam, `after-${name}-write`);
    await handle.sync();
    fault(seam, `after-${name}-sync`);
  } finally {
    await handle.close();
    fault(seam, `after-${name}-close`);
  }
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } catch (error) { if (!['EINVAL', 'ENOTSUP', 'ENOSYS'].includes(error?.code)) throw error; } finally { await handle.close(); }
}

export async function persistPreparedJob({ outputRoot, job, turn, compiled, now, testSeam } = {}) {
  validate({ outputRoot, job, turn, compiled, now });
  const jobsRoot = join(outputRoot, 'jobs');
  const published = join(jobsRoot, job.job_id);
  await validateOutputRoot(outputRoot, jobsRoot);
  try { await lstat(published); fail('job already exists', 'ERR_DUPLICATE_JOB'); } catch (error) { if (error?.code !== 'ENOENT') { if (error?.code === 'ERR_DUPLICATE_JOB') throw error; throw error; } }
  const staging = join(outputRoot, `.m002-staging-${job.job_id}-${randomUUID()}`);
  await mkdir(staging, { mode: 0o700 });
  fault(testSeam, 'after-staging');

  const rigor = { rigor_protocol_id: compiled.rigor_protocol_id, rigor_protocol_version: compiled.rigor_protocol_version, rigor_profile_id: compiled.rigor_profile_id, rigor_profile_version: compiled.rigor_profile_version, rigor_profile_sha256: compiled.rigor_profile_sha256, citation_level: compiled.citation_level, audit_appendix: compiled.audit_appendix };
  const common = { schema: 'm002.prepared.v1', time: now, job_id: job.job_id, caller: 'codex', template_id: compiled.template_id, template_version: compiled.template_version, template_sha256: compiled.template_sha256, template_body_sha256: compiled.template_body_sha256, mode: compiled.mode, mode_reason: compiled.mode_reason, ...rigor };
  const created = { ...common, type: 'job_created', sequence: 1, pacing_decision: 'not_applicable_pre_dispatch', state: 'preparing' };
  const prepared = { ...common, type: 'turn_prepared', sequence: 2, turn_id: turn.turn_id, attempt: 1, prior_turn_id: null, prompt_sha256: compiled.prompt_sha256, state: 'prepared', transport_status: 'not_dispatched', conversation_reference: null, submitted_at: null, accepted_at: null, unknown_at: null, completed_at: null, answer_sha256: null, remote_effect: null };
  const current = { schema: 'm002.prepared.v1', job: { job_id: job.job_id, caller: 'codex', template_id: compiled.template_id, template_version: compiled.template_version, template_sha256: compiled.template_sha256, template_body_sha256: compiled.template_body_sha256, mode: compiled.mode, mode_reason: compiled.mode_reason, ...rigor, state: 'prepared', pacing_decision: 'not_applicable_pre_dispatch', created_at: now }, turn: { turn_id: turn.turn_id, attempt: 1, prior_turn_id: null, prompt_sha256: compiled.prompt_sha256, state: 'prepared', transport_status: 'not_dispatched', conversation_reference: null, submitted_at: null, accepted_at: null, unknown_at: null, completed_at: null, answer_sha256: null, remote_effect: null, prepared_at: now } };
  await writeExclusive(join(staging, 'events.jsonl'), `${canonicalJson(created)}\n${canonicalJson(prepared)}\n`, 'events', testSeam);
  await writeExclusive(join(staging, 'current.json'), `${canonicalJson(current)}\n`, 'current', testSeam);
  await writeExclusive(join(staging, 'prompt.txt'), compiled.prompt, 'prompt', testSeam);
  await syncDirectory(staging);
  fault(testSeam, 'after-directory-sync');
  try { await rename(staging, published); } catch (error) { if (['EEXIST', 'ENOTEMPTY'].includes(error?.code)) fail('job already exists', 'ERR_DUPLICATE_JOB'); throw error; }
  fault(testSeam, 'after-publish');
  return Object.freeze({ job_id: job.job_id, turn_id: turn.turn_id, state: 'prepared', transport_status: 'not_dispatched' });
}
