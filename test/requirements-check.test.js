import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const checker = new URL('../scripts/check-requirements.js', import.meta.url).pathname;

async function withRegistry(requirements, files, run) {
  const root = await mkdtemp(join(tmpdir(), 'requirements-check-'));
  try {
    for (const [path, content] of Object.entries(files ?? {})) {
      const target = join(root, path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, content);
    }
    const registry = join(root, 'requirements.json');
    await writeFile(registry, `${JSON.stringify({ schema: 'verification.requirements.v1', requirements })}\n`);
    return await run({ root, registry });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function invalidResult(registry, root) {
  try {
    await execute(process.execPath, [checker, registry, root]);
    assert.fail('checker unexpectedly succeeded');
  } catch (error) {
    return JSON.parse(error.stdout);
  }
}

const binding = { type: 'test', path: 'test/example.test.js', test: 'example requirement' };
const requirement = { id: 'REQ-EXAMPLE-001', level: 'hard', external: false, statement: 'Example requirement.', bindings: [binding] };

test('accepts a hard requirement with an existing deterministic verification binding', async () => withRegistry([requirement], { 'test/example.test.js': "test('example requirement', () => {});\n" }, async ({ root, registry }) => {
  const { stdout, stderr } = await execute(process.execPath, [checker, registry, root]);
  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), { ok: true, code: 'REQUIREMENTS_OK', violations: [] });
}));

test('rejects a hard requirement without bindings', async () => withRegistry([{ ...requirement, bindings: [] }], {}, async ({ root, registry }) => {
  const result = await invalidResult(registry, root);
  assert.ok(result.violations.some(({ code }) => code === 'REQ_BINDINGS'));
}));

test('rejects a deterministic binding whose artifact does not exist', async () => withRegistry([requirement], {}, async ({ root, registry }) => {
  const result = await invalidResult(registry, root);
  assert.ok(result.violations.some(({ code }) => code === 'REQ_BINDING_PATH'));
}));

test('rejects duplicate requirement IDs', async () => withRegistry([requirement, requirement], { 'test/example.test.js': "test('example requirement', () => {});\n" }, async ({ root, registry }) => {
  const result = await invalidResult(registry, root);
  assert.ok(result.violations.some(({ code }) => code === 'REQ_DUPLICATE_ID'));
}));

test('rejects unknown verification types', async () => withRegistry([{ ...requirement, bindings: [{ ...binding, type: 'guess' }] }], { 'test/example.test.js': "test('example requirement', () => {});\n" }, async ({ root, registry }) => {
  const result = await invalidResult(registry, root);
  assert.ok(result.violations.some(({ code }) => code === 'REQ_BINDING_TYPE'));
}));

test('requires external requirements to include live or manual verification', async () => withRegistry([{ ...requirement, external: true }], { 'test/example.test.js': "test('example requirement', () => {});\n" }, async ({ root, registry }) => {
  const result = await invalidResult(registry, root);
  assert.ok(result.violations.some(({ code }) => code === 'REQ_EXTERNAL_BINDING'));
}));
