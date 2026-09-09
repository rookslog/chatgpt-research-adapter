import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
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
    const jobId = request.mode === 'web' ? 'job_dispatch' : 'job_legacy_standard';
    const jobRoot = join(outputRoot, 'jobs', jobId);
    if (request.mode === 'web') await prepareResearchJob({ request, outputRoot, templatesRoot, now, newJobId: () => jobId, newTurnId: () => 'turn_dispatch' });
    else {
      await mkdir(jobRoot, { recursive: true });
      for (const name of ['current.json', 'events.jsonl', 'prompt.txt']) await copyFile(new URL(`./fixtures/standard-prepared-v1/${name}`, import.meta.url), join(jobRoot, name));
    }
    return await run({ outputRoot, jobRoot, jobId });
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
}

test('loads and freezes one exact standard M002 prepared bundle without mutation', async () => withBundle(async ({ outputRoot, jobRoot, jobId }) => {
  const names = ['events.jsonl', 'current.json', 'prompt.txt'];
  const before = await Promise.all(names.map((name) => readFile(join(jobRoot, name))));
  const bundle = await loadPreparedBundle({ outputRoot, jobId });
  assert.equal(bundle.job_id, 'job_legacy_standard');
  assert.equal(bundle.turn_id, 'turn_legacy_standard');
  assert.equal(bundle.mode, 'standard');
  assert.equal(bundle.prompt_sha256, bundle.current.turn.prompt_sha256);
  assert.ok(bundle.prompt.includes('Explain tidal locking.'));
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
  for (const mutate of mutations) await withBundle(async ({ outputRoot, jobRoot, jobId }) => {
    await mutate(jobRoot);
    await assert.rejects(loadPreparedBundle({ outputRoot, jobId }), { code: 'ERR_PREPARED_BUNDLE' });
    await assert.rejects(readFile(join(jobRoot, 'dispatch', 'intent.json')), { code: 'ENOENT' });
  });
});

test('rejects non-standard prepared mode, invalid identity, and symlinked bundle paths', async () => {
  await withBundle(async ({ outputRoot, jobId }) => {
    await assert.rejects(loadPreparedBundle({ outputRoot, jobId }), { code: 'ERR_PREPARED_MODE' });
  }, { question: 'web', mode: 'web', mode_reason: 'current sources', template_id: 'research-question', template_version: '1.0.0' });
  await withBundle(async ({ outputRoot, jobId }) => {
    for (const jobId of ['', '../job_dispatch', 'job/dispatch']) await assert.rejects(loadPreparedBundle({ outputRoot, jobId }), { code: /ERR_PREPARED_ID/ });
  });
  await withBundle(async ({ outputRoot, jobRoot, jobId }) => {
    const prompt = join(jobRoot, 'prompt.txt'); const target = join(outputRoot, 'prompt-copy');
    await writeFile(target, await readFile(prompt)); await rm(prompt); await symlink(target, prompt);
    await assert.rejects(loadPreparedBundle({ outputRoot, jobId }), { code: 'ERR_PREPARED_BUNDLE' });
  });
});
