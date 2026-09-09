import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../bin/chatgpt-research.js', import.meta.url));

test('real CLI refuses Standard without model family and effort before filesystem or OpenCLI effects', async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'standard-intent-cli-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const outputRoot = join(fixtureRoot, 'absent-output');
  const executablePath = join(fixtureRoot, 'fake-opencli');
  const logPath = join(fixtureRoot, 'invocations.jsonl');
  await writeFile(executablePath, `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(args) + '\\n');
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('1.8.7\\n');
} else {
  process.stderr.write('fake OpenCLI refuses all non-version calls\\n');
  process.exitCode = 91;
}
`);
  await chmod(executablePath, 0o700);

  const control = spawnSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(control.error, undefined);
  assert.equal(control.signal, null);
  assert.equal(control.status, 0);
  assert.equal(control.stdout, '1.8.7\n');
  assert.equal(control.stderr, '');
  assert.equal(await readFile(logPath, 'utf8'), '["--version"]\n');
  t.diagnostic('fixture control: --version returned 1.8.7 and recorded exactly one invocation');
  await writeFile(logPath, '');
  await assert.rejects(lstat(outputRoot), { code: 'ENOENT' });

  const result = spawnSync(process.execPath, [cliPath, 'ask', 'Explain tidal locking.', '--output-root', outputRoot, '--opencli', executablePath], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(typeof result.status, 'number');
  const outputExists = await lstat(outputRoot).then(() => true, (error) => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  const invocations = await readFile(logPath, 'utf8');
  t.diagnostic(JSON.stringify({ status: result.status, stderr: result.stderr, outputExists, invocations }));
  assert.deepEqual({
    nonzeroExit: result.status !== 0,
    intentErrorPrefix: result.stderr.startsWith('ERR_STANDARD_INTENT_REQUIRED:'),
    outputExists,
    invocations
  }, {
    nonzeroExit: true,
    intentErrorPrefix: true,
    outputExists: false,
    invocations: ''
  });
});
