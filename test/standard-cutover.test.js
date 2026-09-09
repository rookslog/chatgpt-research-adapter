import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { directAsk, submitDirectPreparedJob } from '../src/direct-ask.js';
import { prepareResearchJob } from '../src/prepare.js';
import { loadPreparedBundle } from '../src/prepared-bundle.js';
import { createDispatchIntent, persistDispatchIntent, persistDispatchHandoff, persistCompletedResult } from '../src/dispatch-receipts.js';

const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const cli = new URL('../bin/chatgpt-research.js', import.meta.url).pathname;

test('real prepare CLI refuses omitted Standard intent before output mutation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'standard-cutover-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  const requestPath = join(root, 'request.json');
  await writeFile(requestPath, JSON.stringify({ question: 'Explain tidal locking.', template_id: 'research-question', template_version: '1.0.0' }));
  const result = spawnSync(process.execPath, [cli, 'prepare', '--request', requestPath, '--output-root', outputRoot], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, `omitted intent must fail; stdout=${result.stdout}; stderr=${result.stderr}`);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^ERR_STANDARD_INTENT_REQUIRED: [^\n]+\n$/);
  assert.deepEqual(await readdir(outputRoot), []);
});

for (const [label, intent, code] of [
  ['both absent', {}, 'ERR_STANDARD_INTENT_REQUIRED'],
  ['effort absent', { modelFamily: 'gpt-5.6-pro' }, 'ERR_STANDARD_INTENT_REQUIRED'],
  ['family absent', { effort: 'standard' }, 'ERR_STANDARD_INTENT_REQUIRED'],
  ['generic family', { modelFamily: 'pro', effort: 'standard' }, 'ERR_STANDARD_INTENT_UNSUPPORTED'],
  ['valid explicit pair', { modelFamily: 'gpt-5.6-pro', effort: 'standard' }, 'ERR_STANDARD_DRIVER_UNQUALIFIED'],
  ['Web with Standard field', { mode: 'web', effort: 'standard' }, 'ERR_STANDARD_INTENT_UNSUPPORTED'],
  ['Deep with Standard field', { mode: 'deep', modelFamily: 'gpt-5.6-pro' }, 'ERR_STANDARD_INTENT_UNSUPPORTED']
]) test(`direct API refuses ${label} before creating output or invoking submit`, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'standard-direct-refusal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'must-not-exist'); let submitCalls = 0;
  await assert.rejects(directAsk({ ...intent, question: 'Explain tidal locking.', outputRoot, openCliPath: '/tmp/opencli', templatesRoot, submit: async () => { submitCalls += 1; return { status: 'completed' }; } }), { code });
  assert.equal(submitCalls, 0);
  await assert.rejects(stat(outputRoot), { code: 'ENOENT' });
});

// Snapshot does not follow links, and includes directory entries, so refusals cannot
// silently add classifications, rewrite receipts, or alter symlink targets.
async function snapshot(root) {
  const result = {};
  async function visit(path, relative) {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) result[relative] = { link: await readlink(path) };
    else if (entry.isDirectory()) {
      result[relative] = { directory: true };
      for (const name of (await readdir(path)).sort()) await visit(join(path, name), `${relative}/${name}`);
    } else result[relative] = { bytes: (await readFile(path)).toString('base64') };
  }
  await visit(root, '.'); return result;
}
async function executableLogger(root) {
  const executable = join(root, 'opencli.cjs'); const log = join(root, 'calls.jsonl');
  await writeFile(log, '');
  await writeFile(executable, `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2))+'\\n');\nprocess.exitCode = 73;\n`, { mode: 0o700 });
  const control = spawnSync(executable, ['fixture-control'], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(control.error); assert.equal(control.status, 73);
  assert.equal(await readFile(log, 'utf8'), '["fixture-control"]\n');
  await writeFile(log, ''); return { executable, log };
}
async function prepared(t, schema) {
  const root = await mkdtemp(join(tmpdir(), 'standard-prior-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'output'); await mkdir(outputRoot);
  let jobId;
  if (schema === 'v1') {
    jobId = 'job_legacy_standard'; const jobRoot = join(outputRoot, 'jobs', jobId); await mkdir(jobRoot, { recursive: true });
    for (const name of ['current.json', 'events.jsonl', 'prompt.txt']) await writeFile(join(jobRoot, name), await readFile(new URL(`./fixtures/standard-prepared-v1/${name}`, import.meta.url)));
  } else {
    const summary = await prepareResearchJob({ request: { question: 'Explain tidal locking.', model_family: 'gpt-5.6-pro', effort: 'standard', template_id: 'research-question', template_version: '1.0.0' }, outputRoot, templatesRoot });
    jobId = summary.job_id;
  }
  return { root, outputRoot, jobId, jobRoot: join(outputRoot, 'jobs', jobId) };
}
async function historicalCompleted(outputRoot, jobId, jobRoot) {
  // Valid historical schema built with real low-level receipt APIs, not an old send.
  const bundle = await loadPreparedBundle({ outputRoot, jobId });
  const now = '2026-08-26T23:10:00.000Z';
  const executable = { supplied_path: '/tmp/historical-opencli', real_path: '/tmp/historical-opencli', sha256: 'e'.repeat(64), size: 123, device: '1', inode: '2', version: '1.8.7' };
  const intent = createDispatchIntent({ bundle, executable, now });
  const saved = await persistDispatchIntent({ jobRoot, intent });
  const common = { jobRoot, bundle, now, intentSha256: saved.intent_sha256, conversationId: 'historical-complete', conversationUrl: 'https://chatgpt.com/c/historical-complete' };
  const handoff = await persistDispatchHandoff({ ...common, tool: '' });
  await persistCompletedResult({ ...common, handoffSha256: handoff.handoff_sha256, answer: 'Synthetic historical completed answer.' });
}

for (const schema of ['v1', 'v2']) for (const evidence of ['none', 'dispatch-intent', 'response-intent', 'standard-file', 'standard-symlink', ...(schema === 'v1' ? ['completed'] : [])]) {
  for (const boundary of ['submit-once CLI', 'submitDirectPreparedJob API']) test(`${schema} with ${evidence}: ${boundary} refuses without changing evidence or preflight`, async (t) => {
    const { root, outputRoot, jobId, jobRoot } = await prepared(t, schema);
    if (evidence.endsWith('-intent')) {
      const sibling = evidence.split('-')[0]; await mkdir(join(jobRoot, sibling));
      await writeFile(join(jobRoot, sibling, 'intent.json'), '{"synthetic_historical_intent":true,"outcome":"unknown"}\n');
    } else if (evidence === 'standard-file') await writeFile(join(jobRoot, 'standard'), '{malformed historical evidence\n');
    else if (evidence === 'standard-symlink') await symlink(join(root, 'missing-target'), join(jobRoot, 'standard'));
    else if (evidence === 'completed') await historicalCompleted(outputRoot, jobId, jobRoot);
    const before = await snapshot(jobRoot); const { executable, log } = await executableLogger(root);
    const code = evidence !== 'none' ? 'ERR_STANDARD_PRIOR_DISPATCH' : schema === 'v1' ? 'ERR_STANDARD_LEGACY_INTENT_REQUIRED' : 'ERR_STANDARD_DRIVER_UNQUALIFIED';
    if (boundary === 'submit-once CLI') {
    const result = spawnSync(process.execPath, [cli, 'submit-once', '--output-root', outputRoot, '--job-id', jobId, '--opencli', executable], { encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error); assert.equal(result.signal, null); assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.match(result.stderr, new RegExp(`^${code}: [^\\n]+\\n$`));
    if (evidence !== 'none') assert.match(result.stderr, /prior dispatch evidence.*inspect|inspect.*prior dispatch evidence/i);
    else if (schema === 'v1') assert.match(result.stderr, /new.*explicit|explicit.*new/i);
    assert.equal(await readFile(log, 'utf8'), '');
    assert.deepEqual(await snapshot(jobRoot), before);
    } else {
    let preflightCalls = 0;
    await assert.rejects(submitDirectPreparedJob({ mode: 'standard', outputRoot, jobId, jobPath: jobRoot, openCliPath: executable, preflight: async () => { preflightCalls += 1; throw Object.assign(new Error('external boundary reached'), { code: 'ERR_TEST_PREFLIGHT' }); } }), (error) => {
      assert.equal(error.code, code);
      if (evidence !== 'none') assert.match(error.message, /prior dispatch evidence.*inspect|inspect.*prior dispatch evidence/i);
      else if (schema === 'v1') assert.match(error.message, /new.*explicit|explicit.*new/i);
      return true;
    });
    assert.equal(preflightCalls, 0); assert.equal(await readFile(log, 'utf8'), '');
    assert.deepEqual(await snapshot(jobRoot), before);
    }
  });
}
