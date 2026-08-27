import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkAuthority } from '../scripts/m002-authority-check.js';

const root = new URL('../', import.meta.url).pathname;

async function withCopy(run) {
  const copy = await mkdtemp(join(tmpdir(), 'm002-authority-'));
  try { for (const name of ['package.json', 'bin', 'src', 'templates', 'rigor', 'scripts']) await cp(join(root, name), join(copy, name), { recursive: true }); return await run(copy); }
  finally { await rm(copy, { recursive: true, force: true }); }
}

test('authority check accepts the closed M002 plus bounded M003 process boundary', async () => {
  const result = await checkAuthority(root);
  assert.deepEqual(result, { ok: true, code: 'M002_AUTHORITY_OK', violations: [] });
});

test('authority check catches forbidden imports, loaders, computed fetch, package drift, and unlisted source', async () => withCopy(async (copy) => {
  const cases = [
    ['src/modes.js', "import { request as alias } from 'node:http';\n", 'IMPORT_NOT_ALLOWED'],
    ['src/modes.js', "import http from 'http';\n", 'IMPORT_NOT_ALLOWED'],
    ['src/modes.js', "import/*allowed-comment*/ http from 'http';\n", 'COMMENTS_FORBIDDEN'],
    ['src/modes.js', "import http from/*allowed-comment*/ 'http';\n", 'COMMENTS_FORBIDDEN'],
    ['src/modes.js', "import/*allowed-comment*/ 'http';\n", 'COMMENTS_FORBIDDEN'],
    ['src/modes.js', "const marker = '/*'; import http from 'http'; const close = '*/';\n", 'COMMENTS_FORBIDDEN'],
    ['src/modes.js', "const marker = `/*`; import http from 'http'; const close = `*/`;\n", 'COMMENTS_FORBIDDEN'],
    ['src/modes.js', "const marker = /\\//; import http from 'http';\n", 'COMMENTS_FORBIDDEN'],
    ['src/modes.js', "export { x } from './other.js';\n", 'REEXPORT_FORBIDDEN'],
    ['src/modes.js', "const x = import('./other.js');\n", 'DYNAMIC_IMPORT_FORBIDDEN'],
    ['src/modes.js', "import { createRequire } from 'node:module';\n", 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', 'globalThis["fetch"]("x");\n', 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', 'fetch("x");\n', 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', 'new WebSocket("x");\n', 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', 'new EventSource("x");\n', 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', "process.getBuiltinModule('node:http');\n", 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', "process.binding('x');\n", 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', "process['getBuiltin' + 'Module']('node:' + 'http');\n", 'PROCESS_ACCESS_FORBIDDEN'],
    ['src/modes.js', "process['bind' + 'ing']('x');\n", 'PROCESS_ACCESS_FORBIDDEN'],
    ['src/modes.js', "globalThis['fe' + 'tch']('x');\n", 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', "global['Fun' + 'ction']('x');\n", 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', 'const send = globalThis.fetch;\n', 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', "const runtime = process; runtime.getBuiltinModule('http');\n", 'CAPABILITY_TOKEN_FORBIDDEN'],
    ['src/modes.js', 'const transport = pro\\u0063ess.get\\u0042uiltinModule("http");\n', 'IDENTIFIER_ESCAPE_FORBIDDEN'],
    ['src/modes.js', 'const send = global\\u0054his.fe\\u0074ch;\n', 'IDENTIFIER_ESCAPE_FORBIDDEN'],
    ['src/modes.js', 'const runtime = pro\\u{63}ess;\n', 'IDENTIFIER_ESCAPE_FORBIDDEN']
  ];
  for (const [file, mutation, code] of cases) {
    const original = await readFile(join(copy, file), 'utf8'); await writeFile(join(copy, file), `${original}\n${mutation}`);
    assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === code));
    await writeFile(join(copy, file), original);
  }
  const cliPath = join(copy, 'src', 'cli.js'); const originalCli = await readFile(cliPath, 'utf8');
  await writeFile(cliPath, `${originalCli}\nimport { canonicalJson as canonicalAlias } from './canonical-json.js';\n`);
  assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'SOURCE_DIGEST_MISMATCH'));
  await writeFile(cliPath, originalCli);
  const transportPath = join(copy, 'src', 'opencli-transport.js'); const originalTransport = await readFile(transportPath, 'utf8');
  await writeFile(transportPath, originalTransport.replace('shell: false', 'shell: true'));
  assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'PROCESS_BOUNDARY_FORBIDDEN'));
  await writeFile(transportPath, `${originalTransport}\nexec('unexpected');\n`);
  assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'PROCESS_BOUNDARY_FORBIDDEN'));
  await writeFile(transportPath, originalTransport);
  const packageJson = join(copy, 'package.json'); const originalPackage = JSON.parse(await readFile(packageJson, 'utf8'));
  await writeFile(packageJson, JSON.stringify({ ...originalPackage, scripts: { ...originalPackage.scripts, postinstall: 'x' } }));
  assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'PACKAGE_SCRIPTS'));
  await writeFile(packageJson, JSON.stringify({ ...originalPackage, dependencies: { leftpad: '1.0.0' } }));
  assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'PACKAGE_DEPENDENCIES'));
  await writeFile(packageJson, JSON.stringify(originalPackage));
  await writeFile(join(copy, 'src', 'unlisted.js'), 'export const x = 1;\n');
  assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'UNLISTED_FILE'));
  await symlink(join(copy, 'src', 'modes.js'), join(copy, 'src', 'linked.js'));
  assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'SYMLINK_FILE'));
}));

test('authority source pins reject every source drift and malformed pin maps', async () => withCopy(async (copy) => {
  const cases = [
    ['bin/chatgpt-research.js', '\nconst probe = process.stderr.write.constructor;\n'],
    ['src/modes.js', '\nconst harmless = 1;\n']
  ];
  for (const [file, mutation] of cases) {
    const path = join(copy, file); const original = await readFile(path, 'utf8'); await writeFile(path, `${original}${mutation}`);
    assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'SOURCE_DIGEST_MISMATCH'));
    await writeFile(path, original);
  }
  const packagePath = join(copy, 'package.json'); const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  for (const m002Authority of [{}, { sourceSha256: { ...packageJson.m002Authority?.sourceSha256, extra: '0'.repeat(64) } }, { sourceSha256: { ...packageJson.m002Authority?.sourceSha256, 'src/modes.js': '0'.repeat(63) } }]) {
    await writeFile(packagePath, JSON.stringify({ ...packageJson, m002Authority }));
    assert.ok((await checkAuthority(copy)).violations.some((violation) => violation.code === 'SOURCE_DIGEST_PIN_SCHEMA'));
  }
}));
