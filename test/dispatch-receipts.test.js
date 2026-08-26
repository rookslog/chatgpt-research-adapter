import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createDispatchIntent, persistAmbiguousResult, persistCompletedResult, persistDispatchIntent } from '../src/dispatch-receipts.js';

const now = '2026-08-24T01:02:03.456Z';
const bundle = Object.freeze({ job_id: 'job_dispatch', turn_id: 'turn_dispatch', template_id: 'research-question', template_version: '1.0.0', template_sha256: 'a'.repeat(64), template_body_sha256: 'b'.repeat(64), mode: 'standard', mode_reason: 'default', prompt_sha256: 'c'.repeat(64), rigor_protocol_id: 'chatgpt-research-epistemic', rigor_protocol_version: '1.0.0', rigor_profile_id: 'standard', rigor_profile_version: '1.0.0', rigor_profile_sha256: 'e'.repeat(64), citation_level: 'principal', audit_appendix: false });
const executable = Object.freeze({ supplied_path: '/tmp/opencli', real_path: '/tmp/opencli-real', sha256: 'd'.repeat(64), size: 123, device: '1', inode: '2', version: '1.8.7' });

async function withJob(run) {
  const root = await mkdtemp(join(tmpdir(), 'm003-dispatch-')); const jobRoot = join(root, 'jobs', bundle.job_id); await mkdir(jobRoot, { recursive: true });
  try { return await run({ root, jobRoot }); } finally { await rm(root, { recursive: true, force: true }); }
}

test('writes and syncs one canonical immutable dispatch intent', async () => withJob(async ({ jobRoot }) => {
  const intent = createDispatchIntent({ bundle, executable, now });
  const saved = await persistDispatchIntent({ jobRoot, intent });
  const bytes = await readFile(join(jobRoot, 'dispatch', 'intent.json'));
  assert.equal(saved.intent_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(JSON.parse(bytes), intent);
  assert.equal(intent.rigor_profile_id, 'standard');
  assert.equal(intent.rigor_profile_sha256, 'e'.repeat(64));
  assert.equal(intent.citation_level, 'principal');
  assert.equal(intent.audit_appendix, false);
  assert.equal(bytes.at(-1), 10);
  await assert.rejects(persistDispatchIntent({ jobRoot, intent }), { code: 'ERR_DISPATCH_EXISTS' });
  assert.deepEqual(await readFile(join(jobRoot, 'dispatch', 'intent.json')), bytes);
}));

test('publishes exact answer before a completed result bound to its hashes', async () => withJob(async ({ jobRoot }) => {
  const intent = createDispatchIntent({ bundle, executable, now }); const saved = await persistDispatchIntent({ jobRoot, intent });
  const answer = 'CHATGPT_RESEARCH_LIVE_SMOKE_OK';
  const result = await persistCompletedResult({ jobRoot, bundle, intentSha256: saved.intent_sha256, answer, conversationId: 'abc-123', conversationUrl: 'https://chatgpt.com/c/abc-123', now: '2026-08-24T01:03:03.456Z' });
  assert.equal(await readFile(join(jobRoot, 'dispatch', 'answer.md'), 'utf8'), answer);
  assert.equal(result.status, 'completed');
  assert.equal(result.rigor_profile_id, 'standard');
  assert.equal(result.answer_sha256, createHash('sha256').update(answer).digest('hex'));
  assert.deepEqual(JSON.parse(await readFile(join(jobRoot, 'dispatch', 'result.json'), 'utf8')), result);
}));

test('records terminal ambiguous effect without answer and prohibits retry', async () => withJob(async ({ jobRoot }) => {
  const intent = createDispatchIntent({ bundle, executable, now }); const saved = await persistDispatchIntent({ jobRoot, intent });
  const result = await persistAmbiguousResult({ jobRoot, bundle, intentSha256: saved.intent_sha256, disposition: 'ERR_OPENCLI_TIMEOUT', now: '2026-08-24T01:04:03.456Z' });
  assert.equal(result.status, 'ambiguous_effect'); assert.equal(result.remote_effect, 'unknown'); assert.equal(result.retry_decision, 'prohibited');
  await assert.rejects(stat(join(jobRoot, 'dispatch', 'answer.md')), { code: 'ENOENT' });
}));

test('faults cannot declare completion before a durable answer and existing bytes never change', async () => withJob(async ({ jobRoot }) => {
  const intent = createDispatchIntent({ bundle, executable, now }); const saved = await persistDispatchIntent({ jobRoot, intent });
  await assert.rejects(persistCompletedResult({ jobRoot, bundle, intentSha256: saved.intent_sha256, answer: 'answer', conversationId: 'abc', conversationUrl: 'https://chatgpt.com/c/abc', now: '2026-08-24T01:03:03.456Z', testSeam: { failAt: 'after-answer-sync' } }), { code: 'ERR_INJECTED_FAULT' });
  assert.equal(await readFile(join(jobRoot, 'dispatch', 'answer.md'), 'utf8'), 'answer');
  await assert.rejects(stat(join(jobRoot, 'dispatch', 'result.json')), { code: 'ENOENT' });
  await assert.rejects(persistCompletedResult({ jobRoot, bundle, intentSha256: saved.intent_sha256, answer: 'different', conversationId: 'abc', conversationUrl: 'https://chatgpt.com/c/abc', now: '2026-08-24T01:03:03.456Z' }), { code: 'ERR_DISPATCH_EXISTS' });
  assert.equal(await readFile(join(jobRoot, 'dispatch', 'answer.md'), 'utf8'), 'answer');
}));

test('refuses a terminal result when the durable intent bytes no longer match', async () => withJob(async ({ jobRoot }) => {
  const intent = createDispatchIntent({ bundle, executable, now }); const saved = await persistDispatchIntent({ jobRoot, intent });
  await writeFile(join(jobRoot, 'dispatch', 'intent.json'), '{}\n');
  await assert.rejects(persistAmbiguousResult({ jobRoot, bundle, intentSha256: saved.intent_sha256, disposition: 'ERR_OPENCLI_TIMEOUT', now: '2026-08-24T01:04:03.456Z' }), { code: 'ERR_DISPATCH_INTENT' });
  await assert.rejects(stat(join(jobRoot, 'dispatch', 'result.json')), { code: 'ENOENT' });
}));
