import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const INVENTORY = Object.freeze([
  'src/standard-results.js',
  'src/human-control.js',
  'src/standard-browser.js',
  'src/setup.js',
  'src/setup-cli.js',
  'src/runtime-service.js',
  'src/runtime-events.js',
  'src/runtime-config.js',
  'src/runtime-cli.js',
  'src/opencli-browser-command.js',
  'src/caller-binding.js',
  'src/browser-host.js',
  'bin/research-runtime.js',
  'bin/chatgpt-research.js', 'package.json', 'scripts/check-requirements.js', 'scripts/m002-authority-check.js',
  'src/canonical-json.js', 'src/cli.js', 'src/compiler.js', 'src/direct-ask.js', 'src/dispatch-receipts.js', 'src/modes.js', 'src/opencli-transport.js', 'src/prepare.js', 'src/prepared-bundle.js', 'src/receipts.js', 'src/rigor-profile.js', 'src/strict-json.js', 'src/standard-runtime.js', 'src/submit-once.js', 'src/template-registry.js',
  'rigor/registry.json', 'rigor/profiles/light/1.0.0.json', 'rigor/profiles/standard/1.0.0.json', 'rigor/profiles/strict/1.0.0.json',
  'templates/registry.json', 'templates/research-question/1.0.0.json'
]);
const ALLOWED_IMPORTS = Object.freeze({
  'src/standard-results.js': new Set(['./standard-runtime.js']),
  'src/human-control.js': new Set(["node:crypto", "node:fs", "node:fs/promises", "node:path", "./canonical-json.js"]),
  'src/standard-browser.js': new Set(["node:crypto", "./standard-runtime.js", "./canonical-json.js"]),
  'src/setup.js': new Set(["node:crypto", "node:fs", "node:fs/promises", "node:path", "./canonical-json.js"]),
  'src/setup-cli.js': new Set(["node:fs/promises", "node:path", "./canonical-json.js", "./setup.js"]),
  'src/runtime-service.js': new Set(["node:crypto", "node:fs", "node:fs/promises", "node:path", "./canonical-json.js", "./caller-binding.js", "./human-control.js", "./runtime-events.js", "./standard-runtime.js"]),
  'src/runtime-events.js': new Set(["node:crypto", "./standard-runtime.js"]),
  'src/runtime-config.js': new Set(["node:crypto", "node:fs", "node:fs/promises", "node:path", "./canonical-json.js", "./standard-runtime.js"]),
  'src/runtime-cli.js': new Set(["node:child_process", "node:fs", "node:fs/promises", "node:path", "node:url", "./canonical-json.js", "./caller-binding.js", "./prepare.js", "./runtime-config.js", "./runtime-events.js", "./runtime-service.js", "./setup-cli.js", "./browser-host.js", "./opencli-browser-command.js", "./standard-browser.js", "./human-control.js", "./standard-runtime.js", "./submit-once.js"]),
  'src/opencli-browser-command.js': new Set(["node:crypto", "node:fs/promises", "node:path", "node:url"]),
  'src/caller-binding.js': new Set(["node:crypto", "node:fs", "node:fs/promises", "node:path", "./canonical-json.js", "./standard-runtime.js"]),
  'src/browser-host.js': new Set(["node:crypto", "node:fs", "node:fs/promises", "node:path", "node:child_process", "./human-control.js", "./runtime-service.js", "./canonical-json.js"]),
  'bin/research-runtime.js': new Set(["node:url", "../src/runtime-cli.js", "../src/cli.js"]),
  'bin/chatgpt-research.js': new Set(['../src/cli.js']),
  'scripts/check-requirements.js': new Set(['node:fs/promises', 'node:path', 'node:url', '../src/strict-json.js']),
  'scripts/m002-authority-check.js': new Set(['node:crypto', 'node:fs/promises', 'node:path', 'node:url']),
  'src/canonical-json.js': new Set(),
  'src/cli.js': new Set(['node:fs', 'node:fs/promises', 'node:path', 'node:url', './canonical-json.js', './direct-ask.js', './prepare.js', './strict-json.js', './submit-once.js', './runtime-cli.js']),
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
  'src/standard-runtime.js': new Set(['node:crypto', 'node:fs', 'node:fs/promises', 'node:path', './canonical-json.js', './human-control.js']),
  'src/submit-once.js': new Set(['node:fs/promises', 'node:path', './dispatch-receipts.js', './opencli-transport.js', './prepared-bundle.js', './standard-runtime.js']),
  'src/template-registry.js': new Set(['node:crypto', 'node:fs', 'node:fs/promises', 'node:path', './canonical-json.js', './strict-json.js'])
});
const REQUIRED_FILES = Object.freeze(['bin', 'src', 'scripts', 'templates', 'rigor']);
const CAPABILITY_TOKENS = Object.freeze(['fe' + 'tch', 'getBuiltin' + 'Module', 'bind' + 'ing', 'glo' + 'bal' + 'This', 'glo' + 'bal', 'Web' + 'Socket', 'Event' + 'Source', 'e' + 'val', 'Fun' + 'ction', 're' + 'quire', 'create' + 'Require']);
const CAPABILITY_WORD_ALLOW = Object.freeze({'scripts/m002-authority-check.js': new Set(['bind' + 'ing']),'src/standard-runtime.js': new Set(['bind' + 'ing']),'src/runtime-cli.js': new Set(['bind' + 'ing']),'src/runtime-service.js': new Set(['bind' + 'ing']),'src/standard-browser.js': new Set(['bind' + 'ing'])});
const PROCESS_ALLOW = Object.freeze({
  'src/human-control.js': ["pro" + "cess.getuid"],
  'src/setup.js': ["pro" + "cess.getuid"],
  'src/setup-cli.js': ["pro" + "cess.stdout"],
  'src/runtime-service.js': ["pro" + "cess.kill(pid, 0)", "pro" + "cess.getuid", "pro" + "cess.pid", "pro" + "cess.on('SIGINT', handleSignal)", "pro" + "cess.on('SIGTERM', handleSignal)", "pro" + "cess.removeListener('SIGINT', handleSignal)", "pro" + "cess.removeListener('SIGTERM', handleSignal)", "service already running by pro" + "cess", "spawned pro" + "cess", "service pro" + "cess exited before acquiring ownership", "service pro" + "cess did not acquire ownership before the startup deadline"],
  'src/runtime-config.js': ["pro" + "cess.getuid"],
  'src/runtime-cli.js': ["pro" + "cess.stdout", "pro" + "cess.stderr", "pro" + "cess.execPath", "Started service background pro" + "cess", "service pro" + "cess could not be spawned"],
  'src/opencli-browser-command.js': ["pro" + "cess.getuid"],
  'src/caller-binding.js': ["pro" + "cess.getuid"],
  'src/browser-host.js': ["pro" + "cess.platform", "pro" + "cess.kill(pid, 0)", "browser host did not report a pro" + "cess identity", "managed browser pro" + "cess liveness is uncertain"],
  'bin/research-runtime.js': ["pro" + "cess.argv.slice(2)", "pro" + "cess.stdout", "pro" + "cess.stderr.write", "pro" + "cess.stderr", "pro" + "cess.exit(1)"],
  'bin/chatgpt-research.js': [['pro', 'cess.argv.slice(2)'].join(''), ['pro', 'cess.stderr.write'].join(''), ['pro', 'cess.exitCode = 1'].join('')],
  'src/cli.js': [['pro', 'cess.stdout'].join('')],
  'src/standard-runtime.js': [['pro', 'cess.getuid'].join(''), ['pro', 'cess.pid'].join(''), ['pro', 'cess.kill(pid, 0)'].join(''), ['current pro', 'cess'].join(''), ['owner pro', 'cess'].join('')],
  'src/direct-ask.js': [['pro', 'cess.pid'].join(''), ['pro', 'cess.kill(pid, 0)'].join('')],
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
  if (packageJson.private !== true || packageJson.type !== 'module' || packageJson.engines?.node !== '>=22' || !exact(packageJson.bin, { 'chatgpt-research': 'bin/chatgpt-research.js' }) || !exact(packageJson.files, ['bin/', 'src/', 'templates/', 'rigor/', 'scripts/', 'package.json', 'README.md', 'skills/'])) violations.push({ code: 'PACKAGE_CONTRACT', path: 'package.json' });
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
  if (!["bin/research-runtime.js", "src/browser-host.js", "src/caller-binding.js", "src/opencli-browser-command.js", "src/runtime-cli.js", "src/runtime-config.js", "src/runtime-events.js", "src/runtime-service.js", "src/setup-cli.js", "src/setup.js", "src/standard-browser.js", "src/human-control.js", "src/standard-runtime.js"].includes(path) && (source.includes('/' + '/') || source.includes('/' + '*'))) violations.push({ code: 'COMMENTS_FORBIDDEN', path });
  let sourceWithoutAllowedEscapes = source;
  for (const escape of UNICODE_ESCAPE_ALLOW[path] ?? []) sourceWithoutAllowedEscapes = sourceWithoutAllowedEscapes.replaceAll(escape, '');
  if (sourceWithoutAllowedEscapes.includes('\\' + 'u')) violations.push({ code: 'IDENTIFIER_ESCAPE_FORBIDDEN', path });
  if (path !== 'src/standard-results.js' && /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"]/.test(source)) violations.push({ code: 'REEXPORT_FORBIDDEN', path });
  const sourceWithoutPinnedImport = path === 'src/opencli-browser-command.js' ? source.replace("im" + "port(pathToFileURL(join(packageRoot, 'dist/src/browser/daemon-transport.js')).href)", '') : source;
  if (/\bimport\s*\(/.test(sourceWithoutPinnedImport)) violations.push({ code: 'DYNAMIC_IMPORT_FORBIDDEN', path });
  if (new RegExp(`\\b(?:${CAPABILITY_TOKENS.filter((token) => !CAPABILITY_WORD_ALLOW[path]?.has(token)).join('|')})\\b`).test(source)) violations.push({ code: 'CAPABILITY_TOKEN_FORBIDDEN', path });
  let sourceWithoutAllowedProcess = source;
  for (const expression of PROCESS_ALLOW[path] ?? []) sourceWithoutAllowedProcess = sourceWithoutAllowedProcess.replaceAll(expression, '');
  if (new RegExp(`\\b${['pro', 'cess'].join('')}\\b`).test(sourceWithoutAllowedProcess)) violations.push({ code: 'PROCESS_ACCESS_FORBIDDEN', path });
  const forbidden = ['node:' + 'http', 'node:' + 'https', 'puppe' + 'teer', 'play' + 'wright', 'coo' + 'kie', 'c' + 'dp', 'exten' + 'sion', 'user-data-' + 'dir', 'profile-' + 'directory', 'browser ' + 'profile', 'chrome ' + 'profile'];
  const allowedWords = {'src/browser-host.js':["e" + "xtension","u" + "ser-data-dir","b" + "rowser profile"],'src/setup.js':["e" + "xtension","b" + "rowser profile"],'src/opencli-browser-command.js':["c" + "dp", "exten" + "sion"],'src/standard-runtime.js':["c" + "dp"]};
  if (forbidden.some((word) => !allowedWords[path]?.includes(word) && source.toLowerCase().includes(word))) violations.push({ code: 'FORBIDDEN_CAPABILITY', path });
  if (source.toLowerCase().includes('open' + 'cli') && !['scripts/m002-authority-check.js', 'src/cli.js', 'src/direct-ask.js', 'src/dispatch-receipts.js', 'src/opencli-transport.js', 'src/submit-once.js', 'src/opencli-browser-command.js', 'src/runtime-cli.js', 'src/runtime-config.js', 'src/setup.js', 'src/browser-host.js'].includes(path)) violations.push({ code: 'OPENCLI_BOUNDARY_FORBIDDEN', path });
  if (source.includes(['child_', 'pro', 'cess'].join('')) && !['scripts/m002-authority-check.js', 'src/opencli-transport.js', 'src/browser-host.js', 'src/runtime-cli.js', 'src/runtime-service.js'].includes(path)) violations.push({ code: 'PROCESS_BOUNDARY_FORBIDDEN', path });
  if (['src/opencli-transport.js', 'src/browser-host.js', 'src/runtime-cli.js'].includes(path) && (!source.includes('shell: false') || /\b(?:exec|execFile|fork|spawnSync|execFileSync|execSync)\s*\(/.test(source))) violations.push({ code: 'PROCESS_BOUNDARY_FORBIDDEN', path });
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
