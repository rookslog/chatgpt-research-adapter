import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCliError, runCli } from '../src/cli.js';

test('prints OpenCLI stderr with a transport failure', () => {
  const error = Object.assign(new Error('OpenCLI failed'), { code: 'ERR_OPENCLI_EXIT', details: { stderr: 'tool selection failed\n' } });
  assert.equal(formatCliError(error), 'ERR_OPENCLI_EXIT: OpenCLI failed\ntool selection failed\n');
});

test('routes one-command standard and explicit research modes', async () => {
  const cases = [
    [['ask', 'Summarize this', '--output-root', '/tmp/out', '--opencli', '/tmp/opencli'], 'standard'],
    [['ask', 'Research this', '--mode', 'web', '--output-root', '/tmp/out', '--opencli', '/tmp/opencli'], 'web'],
    [['ask', 'Research deeply', '--mode', 'deep', '--output-root', '/tmp/out', '--opencli', '/tmp/opencli'], 'deep']
  ];
  for (const [argv, expectedMode] of cases) {
    const calls = []; let output = '';
    const summary = { jobPath: '/tmp/out/jobs/job_1', result: { status: 'completed', mode: expectedMode } };
    const returned = await runCli(argv, { stdout: { write: (value) => { output += value; } }, ask: async (options) => { calls.push(options); return summary; } });
    assert.equal(returned, summary);
    assert.deepEqual(calls, [{ question: argv[1], mode: expectedMode, outputRoot: '/tmp/out', openCliPath: '/tmp/opencli' }]);
    assert.deepEqual(JSON.parse(output), summary);
  }
});

test('rejects malformed ask usage before dispatch', async () => {
  for (const argv of [
    ['ask'],
    ['ask', 'x', '--mode', 'image', '--output-root', '/tmp/out', '--opencli', '/tmp/opencli'],
    ['ask', 'x', '--output-root', '/tmp/out', '--opencli', 'opencli'],
    ['ask', 'x', '--opencli', '/tmp/opencli', '--output-root', '/tmp/out']
  ]) await assert.rejects(runCli(argv, { stdout: { write() {} }, ask: async () => assert.fail('must not dispatch') }), { code: 'ERR_CLI_USAGE' });
});

test('routes rigor, expanded citation, and audit appendix options to direct ask', async () => {
  const calls = []; let output = '';
  const summary = { jobPath: '/tmp/out/jobs/job_audit', result: { status: 'completed', mode: 'standard' } };
  const argv = ['ask', 'Audit this', '--rigor', 'strict', '--citations', 'expanded', '--audit-appendix', '--output-root', '/tmp/out', '--opencli', '/tmp/opencli'];
  await runCli(argv, { stdout: { write: (value) => { output += value; } }, ask: async (options) => { calls.push(options); return summary; } });
  assert.deepEqual(calls, [{ question: 'Audit this', mode: 'standard', rigorProfile: 'strict', citationLevel: 'expanded', auditAppendix: true, outputRoot: '/tmp/out', openCliPath: '/tmp/opencli' }]);
  assert.deepEqual(JSON.parse(output), summary);
});
