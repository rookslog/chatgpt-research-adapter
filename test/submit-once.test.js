import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createDispatchIntent, persistDispatchIntent, persistDispatchHandoff, persistCompletedResult } from '../src/dispatch-receipts.js';
import { loadPreparedBundle } from '../src/prepared-bundle.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';

const now = '2026-08-26T23:10:00.000Z';
async function withCase(run) {
  const root = await mkdtemp(join(tmpdir(), 'legacy-submit-refusal-'));
  const outputRoot = join(root, 'output'); const jobId = 'job_legacy_standard'; const jobRoot = join(outputRoot, 'jobs', jobId);
  await mkdir(jobRoot, { recursive: true });
  for (const name of ['current.json', 'events.jsonl', 'prompt.txt']) await writeFile(join(jobRoot, name), await readFile(new URL(`./fixtures/standard-prepared-v1/${name}`, import.meta.url)));
  const opencli = join(root, 'opencli.cjs'); const log = join(root, 'calls.jsonl');
  await writeFile(log, '');
  await writeFile(opencli, `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2))+'\\n');\nconsole.log('1.8.6');\n`, { mode: 0o700 });
  // Independently exercised logger: a missing call log cannot masquerade as zero invocations.
  const control = spawnSync(opencli, ['fixture-control'], { encoding: 'utf8' });
  assert.ifError(control.error); assert.equal(control.status, 0); assert.equal(control.stdout, '1.8.6\n');
  assert.equal(await readFile(log, 'utf8'), '["fixture-control"]\n'); await writeFile(log, '');
  const bundle = await loadPreparedBundle({ outputRoot, jobId });
  const executable = { supplied_path: '/tmp/historical-opencli', real_path: '/tmp/historical-opencli', sha256: 'e'.repeat(64), size: 123, device: '1', inode: '2', version: '1.8.7' };
  const intent = createDispatchIntent({ bundle, executable, now });
  try { await run({ outputRoot, jobId, jobRoot, opencli, log, bundle, intent }); }
  finally { await rm(root, { recursive: true, force: true }); }
}
async function preparedBytes(jobRoot) { return Promise.all(['current.json', 'events.jsonl', 'prompt.txt'].map(name => readFile(join(jobRoot, name)))); }

test('legacy submit-once without evidence refuses missing intent before executable preflight', async () => withCase(async ({ outputRoot, jobId, jobRoot, opencli, log }) => {
  const before = await preparedBytes(jobRoot);
  await assert.rejects(submitPreparedJobOnce({ outputRoot, jobId, openCliPath: opencli }), { code: 'ERR_STANDARD_LEGACY_INTENT_REQUIRED' });
  assert.equal(await readFile(log, 'utf8'), '');
  assert.deepEqual(await preparedBytes(jobRoot), before);
  assert.deepEqual((await readdir(jobRoot)).sort(), ['current.json', 'events.jsonl', 'prompt.txt']);
}));

test('legacy submit-once preserves prior intent-only uncertainty without preflight', async () => withCase(async ({ outputRoot, jobId, jobRoot, opencli, log, intent }) => {
  // Synthetic historical intent written by actual receipt storage, never by a send.
  const saved = await persistDispatchIntent({ jobRoot, intent });
  const before = await readFile(saved.intent_path);
  await assert.rejects(submitPreparedJobOnce({ outputRoot, jobId, openCliPath: opencli }), { code: 'ERR_STANDARD_PRIOR_DISPATCH' });
  assert.equal(await readFile(log, 'utf8'), '');
  assert.deepEqual(await readFile(saved.intent_path), before);
  assert.deepEqual(await readdir(join(jobRoot, 'dispatch')), ['intent.json']);
}));

test('legacy submit-once refuses prior completed evidence and preserves every receipt byte', async () => withCase(async ({ outputRoot, jobId, jobRoot, opencli, log, bundle, intent }) => {
  const saved = await persistDispatchIntent({ jobRoot, intent });
  const common = { jobRoot, bundle, now, intentSha256: saved.intent_sha256, conversationId: 'historical-complete', conversationUrl: 'https://chatgpt.com/c/historical-complete' };
  const handoff = await persistDispatchHandoff({ ...common, tool: '' });
  await persistCompletedResult({ ...common, handoffSha256: handoff.handoff_sha256, answer: 'Historical synthetic completed answer' });
  const names = ['intent.json', 'handoff.json', 'answer.md', 'result.json'];
  const before = await Promise.all(names.map(name => readFile(join(jobRoot, 'dispatch', name))));
  await assert.rejects(submitPreparedJobOnce({ outputRoot, jobId, openCliPath: opencli }), { code: 'ERR_STANDARD_PRIOR_DISPATCH' });
  assert.equal(await readFile(log, 'utf8'), '');
  assert.deepEqual(await Promise.all(names.map(name => readFile(join(jobRoot, 'dispatch', name)))), before);
}));

test('legacy policy refusal precedes even a wrong-version executable preflight', async () => withCase(async ({ outputRoot, jobId, jobRoot, opencli, log }) => {
  await assert.rejects(submitPreparedJobOnce({ outputRoot, jobId, openCliPath: opencli }), { code: 'ERR_STANDARD_LEGACY_INTENT_REQUIRED' });
  assert.equal(await readFile(log, 'utf8'), '');
  assert.deepEqual((await readdir(jobRoot)).sort(), ['current.json', 'events.jsonl', 'prompt.txt']);
}));
