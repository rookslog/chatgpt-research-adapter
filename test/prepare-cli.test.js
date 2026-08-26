import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { runCli } from '../src/cli.js';
import { prepareResearchJob } from '../src/prepare.js';

const execFile = promisify(execFileCallback);
const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const cli = new URL('../bin/chatgpt-research.js', import.meta.url).pathname;
const now = '2026-08-24T01:02:03.456Z';

async function withRoot(run) { const root = await mkdtemp(join(tmpdir(), 'm002-prepare-')); try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); } }

test('prepare orchestration resolves and records every requested mode without dispatch', async () => withRoot(async (outputRoot) => {
  const cases = [
    [{ question: 'default question', template_id: 'research-question', template_version: '1.0.0' }, 'standard', 'default'],
    [{ question: 'standard question', mode: 'standard', template_id: 'research-question', template_version: '1.0.0' }, 'standard', 'explicit-standard'],
    [{ question: 'web question', mode: 'web', mode_reason: 'sources', template_id: 'research-question', template_version: '1.0.0' }, 'web', 'sources'],
    [{ question: 'deep question', mode: 'deep', mode_reason: 'analysis', template_id: 'research-question', template_version: '1.0.0' }, 'deep', 'analysis'],
    [{ question: 'image question', mode: 'image', mode_reason: 'visual', template_id: 'research-question', template_version: '1.0.0' }, 'image', 'visual']
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [request, mode, reason] = cases[index];
    const summary = await prepareResearchJob({ request, outputRoot, templatesRoot, now, newJobId: () => `job_${index}`, newTurnId: () => `turn_${index}` });
    assert.deepEqual(summary, { job_id: `job_${index}`, turn_id: `turn_${index}`, state: 'prepared', transport_status: 'not_dispatched', mode, mode_reason: reason });
    const output = join(outputRoot, 'jobs', `job_${index}`);
    const [events, current, prompt] = await Promise.all([readFile(join(output, 'events.jsonl'), 'utf8'), readFile(join(output, 'current.json'), 'utf8'), readFile(join(output, 'prompt.txt'), 'utf8')]);
    const parsedEvents = events.trimEnd().split('\n').map(JSON.parse);
    assert.ok(prompt.includes(`{"mode":"${mode}","reason":"${reason}"}`));
    assert.ok(Buffer.from(prompt).subarray(-Buffer.byteLength(`\n\n--- chatgpt-research mode ---\n{"mode":"${mode}","reason":"${reason}"}\n`)).equals(Buffer.from(`\n\n--- chatgpt-research mode ---\n{"mode":"${mode}","reason":"${reason}"}\n`)));
    assert.ok(events.includes(`"mode":"${mode}"`)); assert.ok(events.includes(`"mode_reason":"${reason}"`));
    assert.deepEqual(parsedEvents.map((event) => [event.mode, event.mode_reason]), [[mode, reason], [mode, reason]]);
    assert.equal(JSON.parse(current).job.mode, mode); assert.equal(JSON.parse(current).job.mode_reason, reason);
    assert.ok(events.includes('"transport_status":"not_dispatched"'));
  }
}));

test('prepare is byte-deterministic for identical request, ids, and time across output roots', async () => withRoot(async (root) => {
  const request = { question: 'deterministic', mode: 'web', mode_reason: 'why', template_id: 'research-question', template_version: '1.0.0' };
  const options = { request, templatesRoot, now, newJobId: () => 'job_same', newTurnId: () => 'turn_same' };
  const left = join(root, 'left'); const right = join(root, 'right'); await (await import('node:fs/promises')).mkdir(left); await (await import('node:fs/promises')).mkdir(right);
  await prepareResearchJob({ ...options, outputRoot: left }); await prepareResearchJob({ ...options, outputRoot: right });
  for (const name of ['events.jsonl', 'current.json', 'prompt.txt']) assert.deepEqual(await readFile(join(left, 'jobs', 'job_same', name)), await readFile(join(right, 'jobs', 'job_same', name)));
}));

test('prepare injects standard rigor by default and records explicit strict audit options', async () => withRoot(async (outputRoot) => {
  const base = { question: 'Assess this claim', template_id: 'research-question', template_version: '1.0.0' };
  await prepareResearchJob({ request: base, outputRoot, templatesRoot, now, newJobId: () => 'job_rigor_default', newTurnId: () => 'turn_rigor_default' });
  const defaultRoot = join(outputRoot, 'jobs', 'job_rigor_default');
  const defaultPrompt = await readFile(join(defaultRoot, 'prompt.txt'), 'utf8');
  const defaultCurrent = JSON.parse(await readFile(join(defaultRoot, 'current.json'), 'utf8'));
  assert.match(defaultPrompt, /--- epistemic rigor ---/);
  assert.match(defaultPrompt, /profile=standard\/1\.0\.0/);
  assert.equal(defaultCurrent.job.rigor_profile_id, 'standard');
  assert.equal(defaultCurrent.job.citation_level, 'principal');
  assert.equal(defaultCurrent.job.audit_appendix, false);

  const request = { ...base, rigor_profile: 'strict', rigor_profile_version: '1.0.0', citation_level: 'expanded', audit_appendix: true };
  await prepareResearchJob({ request, outputRoot, templatesRoot, now, newJobId: () => 'job_rigor_strict', newTurnId: () => 'turn_rigor_strict' });
  const strictRoot = join(outputRoot, 'jobs', 'job_rigor_strict');
  const strictPrompt = await readFile(join(strictRoot, 'prompt.txt'), 'utf8');
  const strictCurrent = JSON.parse(await readFile(join(strictRoot, 'current.json'), 'utf8'));
  assert.match(strictPrompt, /profile=strict\/1\.0\.0/);
  assert.match(strictPrompt, /Expanded citations:/);
  assert.match(strictPrompt, /Audit appendix:/);
  assert.equal(strictCurrent.job.rigor_profile_id, 'strict');
  assert.equal(strictCurrent.job.citation_level, 'expanded');
  assert.equal(strictCurrent.job.audit_appendix, true);
}));

test('prepare validates typed request and injected identity/time before any filesystem mutation', async () => withRoot(async (outputRoot) => {
  for (const request of [null, [], {}, { question: 1 }, { question: '' }, { question: 'x', extra: true }, { question: 'x', mode: 'web' }]) await assert.rejects(prepareResearchJob({ request, outputRoot, templatesRoot, now, newJobId: () => 'job_ok', newTurnId: () => 'turn_ok' }), { code: /ERR_REQUEST|ERR_MODE_REASON/ });
  await assert.rejects(prepareResearchJob({ request: { question: 'x', template_id: 'research-question', template_version: '1.0.0' }, outputRoot, templatesRoot, now, newJobId: () => '../bad', newTurnId: () => 'turn_ok' }), { code: 'ERR_RECEIPT_ID' });
  assert.deepEqual(await readdir(outputRoot), []);
}));

test('prepare requires explicit nonblank template identity before filesystem mutation', async () => withRoot(async (outputRoot) => {
  for (const request of [{ question: 'x' }, { question: 'x', template_id: 'research-question' }, { question: 'x', template_version: '1.0.0' }, { question: 'x', template_id: '', template_version: '' }]) {
    await assert.rejects(prepareResearchJob({ request, outputRoot, templatesRoot, now, newJobId: () => 'job_template', newTurnId: () => 'turn_template' }), { code: 'ERR_REQUEST' });
  }
  assert.deepEqual(await readdir(outputRoot), []);
}));

test('prepare rejects whitespace question, array mode, and invalid turn id before publication', async () => withRoot(async (outputRoot) => {
  const identity = { template_id: 'research-question', template_version: '1.0.0' };
  await assert.rejects(prepareResearchJob({ request: { question: ' \t', ...identity }, outputRoot, templatesRoot, now, newJobId: () => 'job_ok', newTurnId: () => 'turn_ok' }), { code: 'ERR_REQUEST' });
  await assert.rejects(prepareResearchJob({ request: { question: 'q', mode: [], ...identity }, outputRoot, templatesRoot, now, newJobId: () => 'job_ok', newTurnId: () => 'turn_ok' }), { code: 'ERR_REQUEST' });
  await assert.rejects(prepareResearchJob({ request: { question: 'q', ...identity }, outputRoot, templatesRoot, now, newJobId: () => 'job_ok', newTurnId: () => '../turn' }), { code: 'ERR_RECEIPT_ID' });
  assert.deepEqual(await readdir(outputRoot), []);
}));

test('duplicate prepare leaves the original prepared receipt bytes unchanged', async () => withRoot(async (outputRoot) => {
  const options = { request: { question: 'x', template_id: 'research-question', template_version: '1.0.0' }, outputRoot, templatesRoot, now, newJobId: () => 'job_one', newTurnId: () => 'turn_one' };
  await prepareResearchJob(options);
  const before = await readFile(join(outputRoot, 'jobs', 'job_one', 'current.json'));
  await assert.rejects(prepareResearchJob(options), { code: 'ERR_DUPLICATE_JOB' });
  assert.deepEqual(await readFile(join(outputRoot, 'jobs', 'job_one', 'current.json')), before);
}));

test('CLI prints one canonical summary line and records exact mode/reason for every mode', async () => withRoot(async (root) => {
  for (const [request, mode, reason] of [[{ question: 'a', template_id: 'research-question', template_version: '1.0.0' }, 'standard', 'default'], [{ question: 'b', mode: 'standard', template_id: 'research-question', template_version: '1.0.0' }, 'standard', 'explicit-standard'], [{ question: 'c', mode: 'web', mode_reason: 'why', template_id: 'research-question', template_version: '1.0.0' }, 'web', 'why'], [{ question: 'd', mode: 'deep', mode_reason: 'why', template_id: 'research-question', template_version: '1.0.0' }, 'deep', 'why'], [{ question: 'e', mode: 'image', mode_reason: 'why', template_id: 'research-question', template_version: '1.0.0' }, 'image', 'why']]) {
    const input = join(root, `${mode}-${reason}.json`); const outputRoot = join(root, `out-${mode}-${reason}`);
    await writeFile(input, JSON.stringify(request)); await (await import('node:fs/promises')).mkdir(outputRoot);
    const { stdout, stderr } = await execFile(process.execPath, [cli, 'prepare', '--request', input, '--output-root', outputRoot]);
    assert.equal(stderr, ''); assert.equal(stdout.split('\n').filter(Boolean).length, 1);
    const summary = JSON.parse(stdout); assert.equal(summary.mode, mode); assert.equal(summary.mode_reason, reason); assert.equal(summary.transport_status, 'not_dispatched');
    const jobRoot = join(outputRoot, 'jobs', summary.job_id);
    const [currentText, prompt, eventsText] = await Promise.all([readFile(join(jobRoot, 'current.json'), 'utf8'), readFile(join(jobRoot, 'prompt.txt'), 'utf8'), readFile(join(jobRoot, 'events.jsonl'), 'utf8')]);
    const current = JSON.parse(currentText); const events = eventsText.trimEnd().split('\n').map(JSON.parse);
    assert.equal(current.job.mode, mode); assert.equal(current.job.mode_reason, reason);
    assert.deepEqual(events.map((event) => [event.mode, event.mode_reason]), [[mode, reason], [mode, reason]]);
    const suffix = `\n\n--- chatgpt-research mode ---\n{"mode":"${mode}","reason":"${reason}"}\n`;
    assert.ok(Buffer.from(prompt).subarray(-Buffer.byteLength(suffix)).equals(Buffer.from(suffix)));
  }
}));

test('CLI accepts a valid request file at exactly 64 KiB', async () => withRoot(async (root) => {
  const outputRoot = join(root, 'out'); await (await import('node:fs/promises')).mkdir(outputRoot);
  const request = JSON.stringify({ question: 'bounded', template_id: 'research-question', template_version: '1.0.0' });
  const source = `${request}${' '.repeat(64 * 1024 - Buffer.byteLength(request))}`;
  assert.equal(Buffer.byteLength(source), 64 * 1024);
  const input = join(root, 'exact-limit.json'); await writeFile(input, source);
  const { stdout, stderr } = await execFile(process.execPath, [cli, 'prepare', '--request', input, '--output-root', outputRoot]);
  assert.equal(stderr, ''); const summary = JSON.parse(stdout);
  assert.equal((await readdir(join(outputRoot, 'jobs'))).length, 1);
  assert.equal(JSON.parse(await readFile(join(outputRoot, 'jobs', summary.job_id, 'current.json'), 'utf8')).turn.state, 'prepared');
}));

test('POSIX direct executable bin invocation prepares a job', { skip: process.platform === 'win32' }, async () => withRoot(async (root) => {
  const outputRoot = join(root, 'out'); await (await import('node:fs/promises')).mkdir(outputRoot);
  const input = join(root, 'request.json'); await writeFile(input, JSON.stringify({ question: 'direct', template_id: 'research-question', template_version: '1.0.0' }));
  const { stdout, stderr } = await execFile(cli, ['prepare', '--request', input, '--output-root', outputRoot]);
  assert.equal(stderr, ''); assert.equal(JSON.parse(stdout).state, 'prepared');
}));

test('CLI invalid request produces stable typed stderr and no jobs or staging', async () => withRoot(async (root) => {
  const input = join(root, 'invalid.json'); const outputRoot = join(root, 'out'); await writeFile(input, '{"question":1}'); await (await import('node:fs/promises')).mkdir(outputRoot);
  await assert.rejects(execFile(process.execPath, [cli, 'prepare', '--request', input, '--output-root', outputRoot]), (error) => { assert.equal(error.code, 1); assert.match(error.stderr, /^ERR_REQUEST:/); assert.equal(error.stdout, ''); return true; });
  assert.deepEqual(await readdir(outputRoot), []);
}));

test('CLI rejects malformed JSON number and string escape before output mutation', async () => withRoot(async (root) => {
  const outputRoot = join(root, 'out'); await (await import('node:fs/promises')).mkdir(outputRoot);
  for (const [name, source] of [['number', '{"question":01}'], ['escape', '{"question":"\\x"}']]) {
    const input = join(root, `${name}.json`); await writeFile(input, source);
    await assert.rejects(execFile(process.execPath, [cli, 'prepare', '--request', input, '--output-root', outputRoot]), (error) => error.code === 1 && /^ERR_STRICT_JSON:/.test(error.stderr));
  }
  assert.deepEqual(await readdir(outputRoot), []);
}));

test('CLI rejects symlink and oversize request files before output mutation', async () => withRoot(async (root) => {
  const outputRoot = join(root, 'out'); await (await import('node:fs/promises')).mkdir(outputRoot);
  const valid = join(root, 'valid.json'); await writeFile(valid, JSON.stringify({ question: 'x', template_id: 'research-question', template_version: '1.0.0' }));
  const linked = join(root, 'linked.json'); await symlink(valid, linked);
  await assert.rejects(execFile(process.execPath, [cli, 'prepare', '--request', linked, '--output-root', outputRoot]), (error) => error.code === 1 && /^ERR_CLI_REQUEST:/.test(error.stderr));
  const oversized = join(root, 'oversized.json'); await writeFile(oversized, Buffer.alloc(64 * 1024 + 1, 0x20));
  await assert.rejects(execFile(process.execPath, [cli, 'prepare', '--request', oversized, '--output-root', outputRoot]), (error) => error.code === 1 && /^ERR_REQUEST_LIMIT:/.test(error.stderr));
  assert.deepEqual(await readdir(outputRoot), []);
}));

test('CLI routes only the exact submit-once grammar and prints one canonical summary', async () => withRoot(async (outputRoot) => {
  const calls = []; let output = '';
  const summary = { status: 'completed', job_id: 'job_one', turn_id: 'turn_one' };
  const result = await runCli(['submit-once', '--output-root', outputRoot, '--job-id', 'job_one', '--opencli', '/tmp/opencli'], { stdout: { write: (value) => { output += value; } }, submit: async (options) => { calls.push(options); return summary; } });
  assert.deepEqual(result, summary);
  assert.deepEqual(calls, [{ outputRoot, jobId: 'job_one', openCliPath: '/tmp/opencli' }]);
  assert.equal(output, '{"job_id":"job_one","status":"completed","turn_id":"turn_one"}\n');
  for (const argv of [['submit-once'], ['submit-once', '--job-id', 'job_one', '--output-root', outputRoot, '--opencli', '/tmp/opencli'], ['submit-once', '--output-root', outputRoot, '--job-id', 'job_one', '--opencli', 'opencli'], ['submit', '--output-root', outputRoot, '--job-id', 'job_one', '--opencli', '/tmp/opencli']]) await assert.rejects(runCli(argv, { stdout: { write() {} }, submit: async () => summary }), { code: 'ERR_CLI_USAGE' });
}));
