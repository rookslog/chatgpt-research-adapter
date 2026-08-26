import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const INVENTORY = Object.freeze([
  'bin/chatgpt-research.js', 'package.json', 'scripts/check-requirements.js', 'scripts/m002-authority-check.js',
  'src/canonical-json.js', 'src/cli.js', 'src/compiler.js', 'src/direct-ask.js', 'src/dispatch-receipts.js', 'src/modes.js', 'src/opencli-transport.js', 'src/prepare.js', 'src/prepared-bundle.js', 'src/receipts.js', 'src/rigor-profile.js', 'src/strict-json.js', 'src/submit-once.js', 'src/template-registry.js',
  'rigor/registry.json', 'rigor/profiles/light/1.0.0.json', 'rigor/profiles/standard/1.0.0.json', 'rigor/profiles/strict/1.0.0.json',
  'templates/registry.json', 'templates/research-question/1.0.0.json'
]);
const ALLOWED_IMPORTS = Object.freeze({
  'bin/chatgpt-research.js': new Set(['../src/cli.js']),
  'scripts/check-requirements.js': new Set(['node:fs/promises', 'node:path', 'node:url', '../src/strict-json.js']),
  'scripts/m002-authority-check.js': new Set(['node:crypto', 'node:fs/promises', 'node:path', 'node:url']),
  'src/canonical-json.js': new Set(),
  'src/cli.js': new Set(['node:fs', 'node:fs/promises', 'node:path', 'node:url', './canonical-json.js', './direct-ask.js', './prepare.js', './strict-json.js', './submit-once.js']),
  'src/compiler.js': new Set(['node:crypto', './canonical-json.js']),
  'src/direct-ask.js': new Set(['node:crypto', 'node:fs', 'node:fs/promises', 'node:path', 'node:url', './canonical-json.js', './opencli-transport.js', './prepare.js', './prepared-bundle.js']),
  'src/dispatch-receipts.js': new Set(['node:crypto', 'node:fs', 'node:fs/promises', 'node:path', './canonical-json.js', './opencli-transport.js']),
  'src/modes.js': new Set(),
  'src/opencli-transport.js': new Set(['node:child_process', 'node:crypto', 'node:fs/promises', 'node:path', 'node:url', './canonical-json.js', './strict-json.js']),
  'src/prepare.js': new Set(['node:crypto', 'node:url', './compiler.js', './modes.js', './receipts.js', './rigor-profile.js', './template-registry.js']),
  'src/prepared-bundle.js': new Set(['node:crypto', 'node:fs', 'node:fs/promises', 'node:path', './canonical-json.js', './strict-json.js']),
  'src/receipts.js': new Set(['node:crypto', 'node:fs', 'node:fs/promises', 'node:path', './canonical-json.js']),
  'src/rigor-profile.js': new Set(['node:crypto', 'node:fs', 'node:fs/promises', 'node:path', './canonical-json.js', './strict-json.js']),
  'src/strict-json.js': new Set(),
  'src/submit-once.js': new Set(['node:fs/promises', 'node:path', './dispatch-receipts.js', './opencli-transport.js', './prepared-bundle.js']),
  'src/template-registry.js': new Set(['node:crypto', 'node:fs', 'node:fs/promises', 'node:path', './canonical-json.js', './strict-json.js'])
});
const REQUIRED_FILES = Object.freeze(['bin', 'src', 'scripts', 'templates', 'rigor']);
const CAPABILITY_TOKENS = Object.freeze(['fe' + 'tch', 'getBuiltin' + 'Module', 'bind' + 'ing', 'glo' + 'bal' + 'This', 'glo' + 'bal', 'Web' + 'Socket', 'Event' + 'Source', 'e' + 'val', 'Fun' + 'ction', 're' + 'quire', 'create' + 'Require']);
const PROCESS_ALLOW = Object.freeze({
  'bin/chatgpt-research.js': [['pro', 'cess.argv.slice(2)'].join(''), ['pro', 'cess.stderr.write'].join(''), ['pro', 'cess.exitCode = 1'].join('')],
  'src/cli.js': [['pro', 'cess.stdout'].join('')],
  'src/opencli-transport.js': [['pro', 'cess.env'].join(''), ['pro', 'cess.platform'].join('')],
  'scripts/check-requirements.js': [['pro', 'cess.argv[1]'].join(''), ['pro', 'cess.argv[2]'].join(''), ['pro', 'cess.argv[3]'].join(''), ['pro', 'cess.stdout.write'].join(''), ['pro', 'cess.exitCode = 1'].join('')],
  'scripts/m002-authority-check.js': [['pro', 'cess.argv[1]'].join(''), ['pro', 'cess.stdout.write'].join(''), ['pro', 'cess.exitCode = 1'].join('')]
});
const UNICODE_ESCAPE_ALLOW = Object.freeze({
  'src/compiler.js': [['\\', 'u061c'].join(''), ['\\', 'u200e'].join(''), ['\\', 'u200f'].join(''), ['\\', 'u202a'].join(''), ['\\', 'u202e'].join(''), ['\\', 'u2066'].join(''), ['\\', 'u2069'].join('')],
  'src/rigor-profile.js': [['\\', 'u061c'].join(''), ['\\', 'u200e'].join(''), ['\\', 'u200f'].join(''), ['\\', 'u202a'].join(''), ['\\', 'u202e'].join(''), ['\\', 'u2066'].join(''), ['\\', 'u2069'].join('')],
  'src/strict-json.js': [['\\', 'uFEFF'].join('')]
});

async function filesBelow(root, directory) {
  const base = join(root, directory); const output = []; const symlinks = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child); else if (entry.isFile()) output.push(relative(root, child)); else if (entry.isSymbolicLink()) symlinks.push(relative(root, child));
    }
  }
  await visit(base); return { files: output, symlinks };
}

function packageViolations(packageJson) {
  const violations = [];
  const exact = (value, expected) => JSON.stringify(value) === JSON.stringify(expected);
  if (packageJson.private !== true || packageJson.type !== 'module' || packageJson.engines?.node !== '>=22' || !exact(packageJson.bin, { 'chatgpt-research': 'bin/chatgpt-research.js' }) || !exact(packageJson.files, ['bin/', 'src/', 'templates/', 'rigor/', 'scripts/', 'package.json', 'README.md'])) violations.push({ code: 'PACKAGE_CONTRACT', path: 'package.json' });
  if (!exact(packageJson.scripts, { test: 'node --test', 'check:authority': 'node scripts/m002-authority-check.js', 'check:requirements': 'node scripts/check-requirements.js', 'check:syntax': "find bin scripts src test -type f -name '*.js' -print0 | sort -z | xargs -0 -n1 node --check" })) violations.push({ code: 'PACKAGE_SCRIPTS', path: 'package.json' });
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) if (!exact(packageJson[key], {})) { violations.push({ code: 'PACKAGE_DEPENDENCIES', path: 'package.json' }); break; }
  if ('imports' in packageJson || 'exports' in packageJson) violations.push({ code: 'PACKAGE_IMPORT_EXPORT_DRIFT', path: 'package.json' });
  if (!validSourcePins(packageJson.m002Authority?.sourceSha256) || !packageJson.m002Authority || Object.keys(packageJson.m002Authority).length !== 1 || !('sourceSha256' in packageJson.m002Authority)) violations.push({ code: 'SOURCE_DIGEST_PIN_SCHEMA', path: 'package.json' });
  return violations;
}

function validSourcePins(pins) {
  const expected = Object.keys(ALLOWED_IMPORTS).sort();
  return !!pins && typeof pins === 'object' && !Array.isArray(pins) && Object.keys(pins).sort().join('\n') === expected.join('\n') && Object.values(pins).every((digest) => typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest));
}

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function sourceViolations(path, source) {
  const violations = [];
  const imports = [...source.matchAll(/\bimport\s+(?!\()(?:(?:[^'";]+?)\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
  for (const imported of imports) if (!ALLOWED_IMPORTS[path]?.has(imported)) violations.push({ code: 'IMPORT_NOT_ALLOWED', path, detail: imported });
  if (source.includes('/' + '/') || source.includes('/' + '*')) violations.push({ code: 'COMMENTS_FORBIDDEN', path });
  let sourceWithoutAllowedEscapes = source;
  for (const escape of UNICODE_ESCAPE_ALLOW[path] ?? []) sourceWithoutAllowedEscapes = sourceWithoutAllowedEscapes.replaceAll(escape, '');
  if (sourceWithoutAllowedEscapes.includes('\\' + 'u')) violations.push({ code: 'IDENTIFIER_ESCAPE_FORBIDDEN', path });
  if (/\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"]/.test(source)) violations.push({ code: 'REEXPORT_FORBIDDEN', path });
  if (/\bimport\s*\(/.test(source)) violations.push({ code: 'DYNAMIC_IMPORT_FORBIDDEN', path });
  if (new RegExp(`\\b(?:${CAPABILITY_TOKENS.join('|')})\\b`).test(source)) violations.push({ code: 'CAPABILITY_TOKEN_FORBIDDEN', path });
  let sourceWithoutAllowedProcess = source;
  for (const expression of PROCESS_ALLOW[path] ?? []) sourceWithoutAllowedProcess = sourceWithoutAllowedProcess.replaceAll(expression, '');
  if (new RegExp(`\\b${['pro', 'cess'].join('')}\\b`).test(sourceWithoutAllowedProcess)) violations.push({ code: 'PROCESS_ACCESS_FORBIDDEN', path });
  const forbidden = ['node:' + 'http', 'node:' + 'https', 'puppe' + 'teer', 'play' + 'wright', 'coo' + 'kie', 'c' + 'dp', 'exten' + 'sion', 'user-data-' + 'dir', 'profile-' + 'directory', 'browser ' + 'profile', 'chrome ' + 'profile'];
  if (forbidden.some((word) => source.toLowerCase().includes(word))) violations.push({ code: 'FORBIDDEN_CAPABILITY', path });
  if (source.toLowerCase().includes('open' + 'cli') && !['scripts/m002-authority-check.js', 'src/cli.js', 'src/direct-ask.js', 'src/dispatch-receipts.js', 'src/opencli-transport.js', 'src/submit-once.js'].includes(path)) violations.push({ code: 'OPENCLI_BOUNDARY_FORBIDDEN', path });
  if (source.includes(['child_', 'pro', 'cess'].join('')) && !['scripts/m002-authority-check.js', 'src/opencli-transport.js'].includes(path)) violations.push({ code: 'PROCESS_BOUNDARY_FORBIDDEN', path });
  if (path === 'src/opencli-transport.js' && (!source.includes('shell: false') || /\b(?:exec|execFile|fork|spawnSync|execFileSync|execSync)\s*\(/.test(source))) violations.push({ code: 'PROCESS_BOUNDARY_FORBIDDEN', path });
  return violations;
}

export async function checkAuthority(root = fileURLToPath(new URL('..', import.meta.url))) {
  const violations = [];
  let actual = [];
  let symlinks = [];
  try { const scans = await Promise.all(REQUIRED_FILES.map((directory) => filesBelow(root, directory))); actual = ['package.json', ...scans.flatMap((scan) => scan.files)]; symlinks = scans.flatMap((scan) => scan.symlinks); }
  catch { return { ok: false, code: 'M002_AUTHORITY_FAILED', violations: [{ code: 'INVENTORY_UNREADABLE', path: '.' }] }; }
  for (const path of actual.filter((path) => !INVENTORY.includes(path)).sort()) violations.push({ code: 'UNLISTED_FILE', path });
  for (const path of symlinks.sort()) violations.push({ code: 'SYMLINK_FILE', path });
  for (const path of INVENTORY.filter((path) => !actual.includes(path)).sort()) violations.push({ code: 'MISSING_FILE', path });
  let packageJson;
  try { packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); violations.push(...packageViolations(packageJson)); }
  catch { violations.push({ code: 'PACKAGE_INVALID', path: 'package.json' }); }
  for (const path of Object.keys(ALLOWED_IMPORTS)) {
    try {
      const bytes = await readFile(join(root, path));
      violations.push(...sourceViolations(path, bytes.toString('utf8')));
      if (validSourcePins(packageJson?.m002Authority?.sourceSha256) && digest(bytes) !== packageJson.m002Authority.sourceSha256[path]) violations.push({ code: 'SOURCE_DIGEST_MISMATCH', path });
    }
    catch { violations.push({ code: 'SOURCE_UNREADABLE', path }); }
  }
  violations.sort((left, right) => `${left.code}:${left.path}:${left.detail ?? ''}`.localeCompare(`${right.code}:${right.path}:${right.detail ?? ''}`));
  return { ok: violations.length === 0, code: violations.length === 0 ? 'M002_AUTHORITY_OK' : 'M002_AUTHORITY_FAILED', violations };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await checkAuthority();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
