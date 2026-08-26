import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareResearchJob } from '../src/prepare.js';
import { loadPreparedBundle } from '../src/prepared-bundle.js';

const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const now = '2026-08-24T01:02:03.456Z';

async function withBundle(run, request = { question: 'dispatch me', template_id: 'research-question', template_version: '1.0.0' }) {
  const outputRoot = await mkdtemp(join(tmpdir(), 'm003-bundle-'));
  try {
    await prepareResearchJob({ request, outputRoot, templatesRoot, now, newJobId: () => 'job_dispatch', newTurnId: () => 'turn_dispatch' });
    return await run({ outputRoot, jobRoot: join(outputRoot, 'jobs', 'job_dispatch') });
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
}

test('loads and freezes one exact standard M002 prepared bundle without mutation', async () => withBundle(async ({ outputRoot, jobRoot }) => {
  const names = ['events.jsonl', 'current.json', 'prompt.txt'];
  const before = await Promise.all(names.map((name) => readFile(join(jobRoot, name))));
  const bundle = await loadPreparedBundle({ outputRoot, jobId: 'job_dispatch' });
  assert.equal(bundle.job_id, 'job_dispatch');
  assert.equal(bundle.turn_id, 'turn_dispatch');
  assert.equal(bundle.mode, 'standard');
  assert.equal(bundle.prompt_sha256, bundle.current.turn.prompt_sha256);
  assert.ok(bundle.prompt.includes('dispatch me'));
  assert.ok(Object.isFrozen(bundle));
  assert.deepEqual(await Promise.all(names.map((name) => readFile(join(jobRoot, name)))), before);
  assert.deepEqual(await readdir(jobRoot), names.sort());
}));

test('rejects every load-bearing prepared-bundle corruption before dispatch creation', async () => {
  const mutations = [
    async (jobRoot) => writeFile(join(jobRoot, 'prompt.txt'), 'changed'),
    async (jobRoot) => { const path = join(jobRoot, 'current.json'); const value = JSON.parse(await readFile(path, 'utf8')); value.turn.transport_status = 'submitted'; await writeFile(path, JSON.stringify(value)); },
    async (jobRoot) => { const path = join(jobRoot, 'events.jsonl'); const lines = (await readFile(path, 'utf8')).trimEnd().split('\n').map(JSON.parse); lines[1].turn_id = 'turn_other'; await writeFile(path, `${lines.map(JSON.stringify).join('\n')}\n`); },
    async (jobRoot) => { const path = join(jobRoot, 'events.jsonl'); await writeFile(path, `${await readFile(path, 'utf8')}{}\n`); }
  ];
  for (const mutate of mutations) await withBundle(async ({ outputRoot, jobRoot }) => {
    await mutate(jobRoot);
    await assert.rejects(loadPreparedBundle({ outputRoot, jobId: 'job_dispatch' }), { code: 'ERR_PREPARED_BUNDLE' });
    await assert.rejects(readFile(join(jobRoot, 'dispatch', 'intent.json')), { code: 'ENOENT' });
  });
});

test('rejects non-standard prepared mode, invalid identity, and symlinked bundle paths', async () => {
  await withBundle(async ({ outputRoot }) => {
    await assert.rejects(loadPreparedBundle({ outputRoot, jobId: 'job_dispatch' }), { code: 'ERR_PREPARED_MODE' });
  }, { question: 'web', mode: 'web', mode_reason: 'current sources', template_id: 'research-question', template_version: '1.0.0' });
  await withBundle(async ({ outputRoot }) => {
    for (const jobId of ['', '../job_dispatch', 'job/dispatch']) await assert.rejects(loadPreparedBundle({ outputRoot, jobId }), { code: /ERR_PREPARED_ID/ });
  });
  await withBundle(async ({ outputRoot, jobRoot }) => {
    const prompt = join(jobRoot, 'prompt.txt'); const target = join(outputRoot, 'prompt-copy');
    await writeFile(target, await readFile(prompt)); await rm(prompt); await symlink(target, prompt);
    await assert.rejects(loadPreparedBundle({ outputRoot, jobId: 'job_dispatch' }), { code: 'ERR_PREPARED_BUNDLE' });
  });
});
