import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { preflightOpenCli, runOpenCliAsk, runOpenCliStandard } from '../src/opencli-transport.js';
import { withRawTransportWebFixture } from './fixtures/raw-transport-web-helper.js';

const unqualified = 'ERR_STANDARD_DRIVER_UNQUALIFIED';
const exportsUnderTest = [['runOpenCliStandard', runOpenCliStandard], ['runOpenCliAsk', runOpenCliAsk]];

// Assert both observations even when the outcome is wrong on the RED baseline.
async function refusesWithoutSpawn(invoke, options, code) {
  let spawns = 0;
  let outcome;
  try {
    await invoke({ ...options, spawnImpl: (...args) => { spawns += 1; return spawn(...args); } });
  } catch (error) { outcome = error; }
  assert.deepEqual({ code: outcome?.code, spawns }, { code, spawns: 0 });
}

test('local executable control accepts an opaque ask and records exactly one invocation', async () => withRawTransportWebFixture(async ({ root, path, capture }) => {
  const prompt = 'local only\n$HOME `echo must-stay-opaque`';
  const control = spawnSync(path, ['chatgpt', 'ask', prompt], { shell: false, env: { HOME: root, PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(control.status, 0, control.stderr);
  assert.equal(JSON.parse(control.stdout)[0].response, 'local fixture answer');
  const calls = (await readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['chatgpt', 'ask', prompt]);
}));

for (const [name, invoke] of exportsUnderTest) {
  test(`${name} refuses missing options as unqualified`, async () => {
    await assert.rejects(invoke(), { code: unqualified });
    await assert.rejects(invoke(undefined), { code: unqualified });
  });
  for (const [modeName, modeOptions] of [['omitted', {}], ['undefined', { mode: undefined }], ['standard', { mode: 'standard' }]]) {
    test(`${name} refuses ${modeName} mode with a valid local executable and zero spawn`, async () => withRawTransportWebFixture(async ({ path, capture }) => {
      const identity = await preflightOpenCli({ executablePath: path });
      await refusesWithoutSpawn(invoke, { executablePath: path, identity, prompt: 'local send control', ...modeOptions }, unqualified);
      await assert.rejects(readFile(capture), { code: 'ENOENT' });
    }));
  }
  const malformed = [
    ['missing identity', { identity: undefined }],
    ['wrong identity version', { identity: { version: '0.0.0' } }],
    ['missing prompt', { prompt: undefined }],
    ['empty prompt', { prompt: '' }],
    ['oversize prompt', { prompt: 'x'.repeat(65537) }],
    ['nonstring prompt', { prompt: { text: 'x' } }],
    ['relative executable', { executablePath: 'opencli' }],
    ['missing executable', { executablePath: undefined }],
    ['nonexistent executable', { executablePath: '/nonexistent/raw-standard-transport-test' }],
    ['invalid timing', { timeoutSeconds: 0, timeoutMs: -1, killGraceMs: -1 }],
    ['environment processing trap', { environment: new Proxy({}, { get() { throw new Error('environment must not be read'); } }) }],
    ['qualification-looking extras', { model: 'arbitrary', effort: 'high', qualification: true, qualified: true, allowStandard: true, intent: { mode: 'standard' } }]
  ];
  for (const [label, overrides] of malformed) {
    test(`${name} unqualified refusal precedes ${label}`, async () => withRawTransportWebFixture(async ({ path }) => {
      const identity = await preflightOpenCli({ executablePath: path });
      await refusesWithoutSpawn(invoke, { executablePath: path, identity, prompt: 'x', ...overrides }, unqualified);
    }));
  }
}

const invalidModes = [
  ['null', () => null], ['unknown string', () => 'research'], ['empty string', () => ''],
  ['prototype toString', () => 'toString'], ['prototype constructor', () => 'constructor'], ['prototype __proto__', () => '__proto__'],
  ['number', () => 1], ['boolean', () => true], ['empty array', () => []], ['web array', () => ['web']],
  ['boxed standard', () => new String('standard')],
  ['coercible web object', (onCoercion) => ({ toString() { onCoercion(); return 'web'; } })],
  ['coercible standard object', (onCoercion) => ({ [Symbol.toPrimitive]() { onCoercion(); return 'standard'; } })]
];
for (const identityKind of ['missing', 'valid']) {
  for (const [label, makeMode] of invalidModes) {
    test(`raw ask rejects ${label} mode before ${identityKind} identity and effects`, async () => withRawTransportWebFixture(async ({ path, capture }) => {
      const identity = identityKind === 'valid' ? await preflightOpenCli({ executablePath: path }) : undefined;
      let coercions = 0;
      const mode = makeMode(() => { coercions += 1; });
      await refusesWithoutSpawn(runOpenCliAsk, { executablePath: path, identity, prompt: 'x', mode }, 'ERR_OPENCLI_MODE');
      assert.equal(coercions, 0, 'mode admission must not coerce objects');
      await assert.rejects(readFile(capture), { code: 'ENOENT' });
    }));
  }
}
for (const mode of ['web', 'deep']) {
  test(`${mode} retains identity-error precedence over invalid prompt path and timing`, async () => {
    await refusesWithoutSpawn(runOpenCliAsk, { mode, prompt: '', executablePath: 'relative', timeoutSeconds: 0 }, 'ERR_OPENCLI_IDENTITY');
  });
  test(`${mode} still runs the compatible local executable once`, async () => withRawTransportWebFixture(async ({ path, capture }) => {
    const identity = await preflightOpenCli({ executablePath: path });
    const result = await runOpenCliAsk({ executablePath: path, identity, prompt: 'local regression', mode });
    assert.equal(result.tool, mode === 'web' ? 'Web Search' : 'Deep Research');
    const calls = (await readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].args.includes(mode === 'web' ? '--web-search' : '--deep-research'));
  }));
}
