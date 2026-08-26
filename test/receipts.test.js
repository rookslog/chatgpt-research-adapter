import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { persistPreparedJob } from '../src/receipts.js';

const instant = '2026-08-24T01:02:03.456Z';
const compiled = Object.freeze({ prompt: 'prepared prompt\n', prompt_sha256: '441d536094a6794df826af57730ed65fe27fd520f76c0e79b97b0eb8403fc254', template_id: 'research-question', template_version: '1.0.0', template_sha256: 'b'.repeat(64), template_body_sha256: 'c'.repeat(64), mode: 'web', mode_reason: 'source-supported', rigor_protocol_id: 'chatgpt-research-epistemic', rigor_protocol_version: '1.0.0', rigor_profile_id: 'standard', rigor_profile_version: '1.0.0', rigor_profile_sha256: 'd'.repeat(64), citation_level: 'principal', audit_appendix: false });
const job = Object.freeze({ job_id: 'job_01' });
const turn = Object.freeze({ turn_id: 'turn_01' });

async function withRoot(run) { const root = await mkdtemp(join(tmpdir(), 'm002-receipts-')); try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); } }

test('persists a single coherent prepared receipt bundle without dispatch state', async () => withRoot(async (outputRoot) => {
  const result = await persistPreparedJob({ outputRoot, job, turn, compiled, now: instant });
  assert.deepEqual(result, { job_id: 'job_01', turn_id: 'turn_01', state: 'prepared', transport_status: 'not_dispatched' });
  const path = join(outputRoot, 'jobs', 'job_01');
  const [eventsText, currentText, prompt] = await Promise.all(['events.jsonl', 'current.json', 'prompt.txt'].map((name) => readFile(join(path, name), 'utf8')));
  assert.equal(prompt, compiled.prompt);
  const events = eventsText.trimEnd().split('\n').map(JSON.parse);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(({ sequence, type, state, transport_status }) => ({ sequence, type, state, transport_status })), [{ sequence: 1, type: 'job_created', state: 'preparing', transport_status: undefined }, { sequence: 2, type: 'turn_prepared', state: 'prepared', transport_status: 'not_dispatched' }]);
  assert.equal(events[0].caller, 'codex');
  assert.equal(events[0].pacing_decision, 'not_applicable_pre_dispatch');
  assert.equal(events[1].conversation_reference, null);
  assert.equal(events[1].remote_effect, null);
  const current = JSON.parse(currentText);
  assert.equal(current.schema, 'm002.prepared.v1');
  assert.equal(current.job.job_id, job.job_id);
  assert.equal(current.turn.turn_id, turn.turn_id);
  assert.equal(current.turn.transport_status, 'not_dispatched');
  assert.equal(current.turn.state, 'prepared');
  assert.equal(current.turn.completed_at, null);
  assert.equal(current.job.state, 'prepared');
  assert.deepEqual(Object.keys(events[0]).sort(), ['audit_appendix', 'caller', 'citation_level', 'job_id', 'mode', 'mode_reason', 'pacing_decision', 'rigor_profile_id', 'rigor_profile_sha256', 'rigor_profile_version', 'rigor_protocol_id', 'rigor_protocol_version', 'schema', 'sequence', 'state', 'template_body_sha256', 'template_id', 'template_sha256', 'template_version', 'time', 'type']);
  assert.deepEqual(Object.keys(events[1]).sort(), ['accepted_at', 'answer_sha256', 'attempt', 'audit_appendix', 'caller', 'citation_level', 'completed_at', 'conversation_reference', 'job_id', 'mode', 'mode_reason', 'prior_turn_id', 'prompt_sha256', 'remote_effect', 'rigor_profile_id', 'rigor_profile_sha256', 'rigor_profile_version', 'rigor_protocol_id', 'rigor_protocol_version', 'schema', 'sequence', 'state', 'submitted_at', 'template_body_sha256', 'template_id', 'template_sha256', 'template_version', 'time', 'transport_status', 'turn_id', 'type', 'unknown_at']);
  assert.deepEqual(Object.keys(current.job).sort(), ['audit_appendix', 'caller', 'citation_level', 'created_at', 'job_id', 'mode', 'mode_reason', 'pacing_decision', 'rigor_profile_id', 'rigor_profile_sha256', 'rigor_profile_version', 'rigor_protocol_id', 'rigor_protocol_version', 'state', 'template_body_sha256', 'template_id', 'template_sha256', 'template_version']);
  assert.deepEqual(Object.keys(current.turn).sort(), ['accepted_at', 'answer_sha256', 'attempt', 'completed_at', 'conversation_reference', 'prepared_at', 'prior_turn_id', 'prompt_sha256', 'remote_effect', 'state', 'submitted_at', 'transport_status', 'turn_id', 'unknown_at']);
}));

test('rejects a forged prompt digest before creating jobs or staging', async () => withRoot(async (outputRoot) => {
  await assert.rejects(persistPreparedJob({ outputRoot, job, turn, compiled: { ...compiled, prompt_sha256: 'a'.repeat(64) }, now: instant }), { code: 'ERR_RECEIPT_COMPILED' });
  assert.deepEqual(await readdir(outputRoot), []);
}));

test('rejects invalid ids and noncanonical time before creating jobs or staging directories', async () => withRoot(async (outputRoot) => {
  await assert.rejects(persistPreparedJob({ outputRoot, job: { job_id: '../bad' }, turn, compiled, now: instant }), { code: 'ERR_RECEIPT_ID' });
  await assert.rejects(persistPreparedJob({ outputRoot, job, turn, compiled, now: '2026-08-24T01:02:03Z' }), { code: 'ERR_RECEIPT_TIME' });
  await assert.rejects(stat(join(outputRoot, 'jobs')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(outputRoot), []);
}));

test('rejects symlinked output roots, symlinked jobs roots, and regular-file jobs roots without outside writes', async () => withRoot(async (root) => {
  const outside = join(root, 'outside'); await mkdir(outside);
  const rootLink = join(root, 'root-link'); await symlink(outside, rootLink);
  await assert.rejects(persistPreparedJob({ outputRoot: rootLink, job, turn, compiled, now: instant }), { code: 'ERR_RECEIPT_ROOT' });
  const symlinkRoot = join(root, 'symlink-root'); await mkdir(symlinkRoot); await symlink(outside, join(symlinkRoot, 'jobs'));
  await assert.rejects(persistPreparedJob({ outputRoot: symlinkRoot, job, turn, compiled, now: instant }), { code: 'ERR_RECEIPT_ROOT' });
  const fileRoot = join(root, 'file-root'); await mkdir(fileRoot); await writeFile(join(fileRoot, 'jobs'), 'not a directory');
  await assert.rejects(persistPreparedJob({ outputRoot: fileRoot, job, turn, compiled, now: instant }), { code: 'ERR_RECEIPT_ROOT' });
  assert.deepEqual(await readdir(outside), []);
}));

test('allows exactly one same-job publication and leaves the completed bytes untouched on duplicate', async () => withRoot(async (outputRoot) => {
  await persistPreparedJob({ outputRoot, job, turn, compiled, now: instant });
  const published = join(outputRoot, 'jobs', job.job_id);
  const before = await Promise.all(['events.jsonl', 'current.json', 'prompt.txt'].map((name) => readFile(join(published, name))));
  await assert.rejects(persistPreparedJob({ outputRoot, job, turn, compiled, now: instant }), { code: 'ERR_DUPLICATE_JOB' });
  const after = await Promise.all(['events.jsonl', 'current.json', 'prompt.txt'].map((name) => readFile(join(published, name))));
  assert.deepEqual(after, before);
}));

test('concurrent same-job writers yield one complete publication and one typed duplicate', async () => withRoot(async (outputRoot) => {
  const results = await Promise.allSettled([persistPreparedJob({ outputRoot, job, turn, compiled, now: instant }), persistPreparedJob({ outputRoot, job, turn, compiled, now: instant })]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'ERR_DUPLICATE_JOB');
  const published = join(outputRoot, 'jobs', job.job_id);
  const [events, current, prompt] = await Promise.all(['events.jsonl', 'current.json', 'prompt.txt'].map((name) => readFile(join(published, name), 'utf8')));
  assert.equal(events.trimEnd().split('\n').length, 2); assert.equal(JSON.parse(current).turn.prompt_sha256, compiled.prompt_sha256); assert.equal(prompt, compiled.prompt);
}));

test('retains a recognizable staging directory and no published current after an injected write failure', async () => withRoot(async (outputRoot) => {
  await assert.rejects(persistPreparedJob({ outputRoot, job, turn, compiled, now: instant, testSeam: { failAt: 'after-events-write' } }), { code: 'ERR_INJECTED_FAULT' });
  assert.deepEqual(await readdir(join(outputRoot, 'jobs')), []);
  const entries = await readdir(outputRoot);
  assert.ok(entries.some((entry) => entry.startsWith('.m002-staging-job_01-')));
}));

test('fault seam covers staging, exclusive files, sync/close, directory sync, and publish without a partial publication', async () => withRoot(async (outputRoot) => {
  for (const failAt of ['after-staging', 'after-events-open', 'after-events-sync', 'after-events-close', 'after-current-open', 'after-current-write', 'after-current-sync', 'after-current-close', 'after-prompt-open', 'after-prompt-write', 'after-prompt-sync', 'after-prompt-close', 'after-directory-sync', 'after-publish']) {
    const namedJob = { job_id: `job_${failAt.replaceAll('after-', '').replaceAll('-', '_')}` };
    await assert.rejects(persistPreparedJob({ outputRoot, job: namedJob, turn, compiled, now: instant, testSeam: { failAt } }), { code: 'ERR_INJECTED_FAULT' });
    const currentPath = join(outputRoot, 'jobs', namedJob.job_id, 'current.json');
    if (failAt === 'after-publish') {
      const current = JSON.parse(await readFile(currentPath, 'utf8'));
      assert.equal(current.turn.transport_status, 'not_dispatched');
      assert.equal(await readFile(join(outputRoot, 'jobs', namedJob.job_id, 'prompt.txt'), 'utf8'), compiled.prompt);
    } else await assert.rejects(stat(currentPath), { code: 'ENOENT' });
  }
}));
