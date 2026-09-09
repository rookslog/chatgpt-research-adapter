import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/canonical-json.js';
import { submitDirectPreparedJob } from '../src/direct-ask.js';
import { prepareResearchJob } from '../src/prepare.js';
import { loadPreparedBundle } from '../src/prepared-bundle.js';

const cli = fileURLToPath(new URL('../bin/chatgpt-research.js', import.meta.url));
const templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url));
const fixtureRoot = fileURLToPath(new URL('./fixtures/standard-prepared-v1/', import.meta.url));
const names = ['current.json', 'events.jsonl', 'prompt.txt'];
const legacyRequest = { question: 'Explain tidal locking.', mode: 'standard', template_id: 'research-question', template_version: '1.0.0' };
const request = { ...legacyRequest, model_family: 'gpt-5.6-pro', effort: 'standard' };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'standard-prepared-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  return { root, outputRoot };
}

async function bytesAt(root) {
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(join(root, name))])));
}

function invoke(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

async function prepareCli(root, outputRoot) {
  const requestPath = join(root, 'request.json');
  await writeFile(requestPath, `${canonicalJson(request)}\n`);
  const result = invoke(['prepare', '--request', requestPath, '--output-root', outputRoot]);
  assert.equal(result.status, 0, `v2 prepare CLI must succeed; stderr=${JSON.stringify(result.stderr)}`);
  assert.equal(result.stderr, '');
  const summary = JSON.parse(result.stdout);
  assert.equal(result.stdout, `${canonicalJson(summary)}\n`, 'exactly one canonical summary line');
  return summary;
}

function assertFrozen(value) {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) assertFrozen(child);
  }
}

async function assertOnlyPrepared(jobRoot) {
  assert.deepEqual((await readdir(jobRoot)).sort(), names);
}

test('standard prepare publishes an intent-bound v2 artifact through the real CLI', async (t) => {
  const { root, outputRoot } = await workspace(t);
  const summary = await prepareCli(root, outputRoot);
  const provenance = JSON.parse(await readFile(join(fixtureRoot, 'PROVENANCE.json'), 'utf8'));
  assert.deepEqual(summary, {
    ...provenance.summary, job_id: summary.job_id, turn_id: summary.turn_id,
    schema: 'standard.prepared.v2', model_family: request.model_family, effort: request.effort
  });
  const jobRoot = join(outputRoot, 'jobs', summary.job_id);
  const bytes = await bytesAt(jobRoot);
  const legacyBytes = await bytesAt(fixtureRoot);
  const events = bytes['events.jsonl'].toString('utf8').trimEnd().split('\n').map(JSON.parse);
  const current = JSON.parse(bytes['current.json']);
  assert.equal(events.length, 2);
  assert.equal(bytes['events.jsonl'].toString(), `${events.map(canonicalJson).join('\n')}\n`);
  assert.equal(bytes['current.json'].toString(), `${canonicalJson(current)}\n`);
  const expectedEvents = legacyBytes['events.jsonl'].toString().trimEnd().split('\n').map(JSON.parse);
  for (const event of expectedEvents) {
    Object.assign(event, { schema: 'standard.prepared.v2', model_family: request.model_family, effort: request.effort, job_id: summary.job_id, time: events[0].time });
    if (event.type === 'turn_prepared') event.turn_id = summary.turn_id;
  }
  assert.deepEqual(events, expectedEvents, 'closed v2 events preserve all v1 fields and add only intent');
  const expectedCurrent = JSON.parse(legacyBytes['current.json']);
  expectedCurrent.schema = 'standard.prepared.v2';
  Object.assign(expectedCurrent.job, { model_family: request.model_family, effort: request.effort, job_id: summary.job_id, created_at: events[0].time });
  Object.assign(expectedCurrent.turn, { turn_id: summary.turn_id, prepared_at: events[0].time });
  assert.deepEqual(current, expectedCurrent, 'closed current shape preserves null remote fields and prepared state');
  assert.deepEqual(bytes['prompt.txt'], legacyBytes['prompt.txt']);
  assert.equal(digest(bytes['prompt.txt']), current.turn.prompt_sha256);
  await assertOnlyPrepared(jobRoot);
  const loaded = await loadPreparedBundle({ outputRoot, jobId: summary.job_id });
  assert.equal(loaded.current.schema, 'standard.prepared.v2');
  assert.equal(loaded.model_family, request.model_family);
  assert.equal(loaded.effort, request.effort);
  assertFrozen(loaded);
  assert.deepEqual(await bytesAt(jobRoot), bytes, 'reader never rewrites receipts');

  // The alternative accepted effort changes provenance only, not the prompt.
  const extended = await prepareResearchJob({ request: { ...request, effort: 'extended' }, outputRoot, templatesRoot });
  const extendedBundle = await loadPreparedBundle({ outputRoot, jobId: extended.job_id });
  assert.equal(extendedBundle.effort, 'extended');
  assert.equal(extendedBundle.model_family, request.model_family);
  assert.equal(extendedBundle.prompt_sha256, loaded.prompt_sha256);
  assert.equal(extendedBundle.prompt, loaded.prompt);

  current.job.effort = 'extended';
  await writeFile(join(jobRoot, 'current.json'), `${canonicalJson(current)}\n`);
  const mismatched = await bytesAt(jobRoot);
  await assert.rejects(loadPreparedBundle({ outputRoot, jobId: summary.job_id }), { code: 'ERR_PREPARED_BUNDLE' });
  assert.deepEqual(await bytesAt(jobRoot), mismatched, 'rejected disagreement is not repaired');
});

test('fixture-only executable control records its own invocation', async (t) => {
  const { root } = await workspace(t);
  const { executable, log } = await fakeExecutable(root);
  const result = spawnSync(executable, ['fixture-control'], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 73);
  assert.deepEqual(JSON.parse((await readFile(log, 'utf8')).trim()), ['fixture-control']);
});

async function fakeExecutable(root) {
  const executable = join(root, 'fake-opencli.cjs');
  const log = join(root, 'invocations.jsonl');
  await writeFile(log, '');
  await writeFile(executable, `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nprocess.exitCode = 73;\n`);
  await chmod(executable, 0o700);
  return { executable, log };
}

test('v2 prepared artifacts cannot enter either legacy submission orchestrator', async (t) => {
  const { root, outputRoot } = await workspace(t);
  // On the legacy baseline this is a preparation dependency failure, not dispatcher evidence.
  const summary = await prepareCli(root, outputRoot);
  const jobRoot = join(outputRoot, 'jobs', summary.job_id);
  const before = await bytesAt(jobRoot);
  const { executable, log } = await fakeExecutable(root);
  const result = invoke(['submit-once', '--output-root', outputRoot, '--job-id', summary.job_id, '--opencli', executable]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^ERR_STANDARD_DRIVER_UNQUALIFIED: [^\n]+\n$/);
  assert.equal(await readFile(log, 'utf8'), '', 'submit-once must refuse before executable preflight');
  await assertOnlyPrepared(jobRoot);
  assert.deepEqual(await bytesAt(jobRoot), before);

  let preflightCalls = 0;
  await assert.rejects(submitDirectPreparedJob({
    mode: 'standard', outputRoot, jobId: summary.job_id, jobPath: jobRoot, openCliPath: executable,
    preflight: async () => { preflightCalls += 1; throw Object.assign(new Error('external boundary reached'), { code: 'ERR_TEST_PREFLIGHT_REACHED' }); }
  }), { code: 'ERR_STANDARD_DRIVER_UNQUALIFIED' });
  assert.equal(preflightCalls, 0);
  assert.equal(await readFile(log, 'utf8'), '');
  await assertOnlyPrepared(jobRoot);
  assert.deepEqual(await bytesAt(jobRoot), before);
});

test('historical v1 preparation remains readable without invented intent', async (t) => {
  const { outputRoot } = await workspace(t);
  const provenance = JSON.parse(await readFile(join(fixtureRoot, 'PROVENANCE.json'), 'utf8'));
  const jobRoot = join(outputRoot, 'jobs', provenance.job_id);
  await mkdir(jobRoot, { recursive: true });
  for (const name of names) await copyFile(join(fixtureRoot, name), join(jobRoot, name));
  const before = await bytesAt(jobRoot);
  for (const name of names) assert.equal(digest(before[name]), provenance.artifact_sha256[name]);
  const loaded = await loadPreparedBundle({ outputRoot, jobId: provenance.job_id });
  assert.equal(loaded.current.schema, 'm002.prepared.v1');
  for (const value of [loaded, loaded.current.job, ...loaded.events]) {
    assert.equal(Object.hasOwn(value, 'model_family'), false);
    assert.equal(Object.hasOwn(value, 'effort'), false);
  }
  assertFrozen(loaded);
  assert.deepEqual(await bytesAt(jobRoot), before);
  const current = JSON.parse(before['current.json']);
  current.job.model_family = 'gpt-5.6-pro';
  await writeFile(join(jobRoot, 'current.json'), `${canonicalJson(current)}\n`);
  await assert.rejects(loadPreparedBundle({ outputRoot, jobId: provenance.job_id }), { code: 'ERR_PREPARED_BUNDLE' });
  assert.deepEqual(await bytesAt(fixtureRoot), before, 'immutable fixture remains unchanged');
});

test('both-absent Standard preparation rejects without output mutation', async (t) => {
  const { outputRoot } = await workspace(t);
  await assert.rejects(prepareResearchJob({ request: legacyRequest, outputRoot, templatesRoot }), { code: 'ERR_STANDARD_INTENT_REQUIRED' });
  assert.deepEqual(await readdir(outputRoot), []);
});

for (const [label, input, code] of [
  ['one missing intent field', { ...legacyRequest, model_family: 'gpt-5.6-pro' }, 'ERR_STANDARD_INTENT_REQUIRED'],
  ['generic pro family', { ...request, model_family: 'pro' }, 'ERR_STANDARD_INTENT_UNSUPPORTED'],
  ['Web mode with Standard intent', { ...request, mode: 'web', mode_reason: 'current sources' }, 'ERR_STANDARD_INTENT_UNSUPPORTED']
]) {
  test(`preparer rejects ${label} before filesystem mutation`, async (t) => {
    const { outputRoot } = await workspace(t);
    await assert.rejects(prepareResearchJob({ request: input, outputRoot, templatesRoot }), { code });
    assert.deepEqual(await readdir(outputRoot), []);
  });
}
