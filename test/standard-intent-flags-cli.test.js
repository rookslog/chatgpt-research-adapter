import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../bin/chatgpt-research.js', import.meta.url));
const family = ['--model-family', 'gpt-5.6-pro'];
const effort = ['--effort', 'standard'];

async function assertRefusal(t, flags, expectedCode) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'standard-intent-flags-cli-'));
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
  t.diagnostic('fixture control: --version succeeded and logged exactly one invocation');
  await writeFile(logPath, '');
  await assert.rejects(lstat(outputRoot), { code: 'ENOENT' });

  const result = spawnSync(process.execPath, [cliPath, 'ask', 'Explain tidal locking.', ...flags, '--output-root', outputRoot, '--opencli', executablePath], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(typeof result.status, 'number');
  const outputExists = await lstat(outputRoot).then(() => true, (error) => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  const invocations = await readFile(logPath, 'utf8');
  t.diagnostic(JSON.stringify({ flags, expectedCode, status: result.status, stderr: result.stderr, outputExists, invocations }));
  assert.deepEqual({
    nonzeroExit: result.status !== 0,
    errorCode: result.stderr.split(':', 1)[0],
    outputExists,
    invocations
  }, { nonzeroExit: true, errorCode: expectedCode, outputExists: false, invocations: '' });
}

// These are accepted intent words only; neither combination qualifies a driver.
for (const value of ['standard', 'extended']) {
  for (const reverse of [false, true]) {
    for (const explicitMode of [false, true]) {
      const flags = reverse ? ['--effort', value, ...family] : [...family, '--effort', value];
      if (explicitMode) flags.unshift('--mode', 'standard');
      test(`real CLI parses ${value} intent (${reverse ? 'effort first' : 'family first'}, ${explicitMode ? 'explicit' : 'default'} Standard) then refuses the unqualified driver`, (t) => assertRefusal(t, flags, 'ERR_STANDARD_DRIVER_UNQUALIFIED'));
    }
  }
}

for (const [name, flags] of [['family only', family], ['effort only', effort], ['neither', []]]) {
  test(`real CLI requires both Standard intent fields: ${name}`, (t) => assertRefusal(t, flags, 'ERR_STANDARD_INTENT_REQUIRED'));
}

for (const value of ['pro', 'gpt-5.6', 'GPT-5.6-PRO', '', ' ']) {
  test(`real CLI rejects unsupported exact model family ${JSON.stringify(value)}`, (t) => assertRefusal(t, ['--model-family', value, ...effort], 'ERR_STANDARD_INTENT_UNSUPPORTED'));
}
for (const value of ['light', 'Standard', '', ' ']) {
  test(`real CLI rejects unsupported exact effort ${JSON.stringify(value)}`, (t) => assertRefusal(t, [...family, '--effort', value], 'ERR_STANDARD_INTENT_UNSUPPORTED'));
}

for (const [name, flags] of [
  ['duplicate family', [...family, ...family, ...effort]],
  ['duplicate effort', [...family, ...effort, '--effort', 'extended']],
  ['missing family value', ['--model-family', ...effort]],
  ['missing effort value', [...family, '--effort']],
  ['equals family syntax', ['--model-family=gpt-5.6-pro', ...effort]],
  ['equals effort syntax', [...family, '--effort=standard']],
  ['extra positional value', [...family, ...effort, 'extra']]
]) {
  test(`real CLI rejects malformed intent options: ${name}`, (t) => assertRefusal(t, flags, 'ERR_CLI_USAGE'));
}
for (const mode of ['web', 'deep']) {
  for (const [name, flags] of [['family', family], ['effort', effort], ['both', [...family, ...effort]]]) {
    test(`real CLI rejects ${name} intent flags with explicit ${mode} mode`, (t) => assertRefusal(t, ['--mode', mode, ...flags], 'ERR_CLI_USAGE'));
  }
}
