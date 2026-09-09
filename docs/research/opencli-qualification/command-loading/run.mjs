import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as url from 'node:url';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const dir = path.dirname(url.fileURLToPath(import.meta.url));
const supplied = process.argv[2] || process.env.OPENCLI_ROOT;
assert(supplied, 'Supply existing OpenCLI root as argument or OPENCLI_ROOT');
assert(vm.SourceTextModule, 'Use --experimental-vm-modules');
const root = fs.realpathSync(supplied);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pins = JSON.parse(fs.readFileSync(path.join(dir, 'SOURCE-PINS.json')));
const dependencyRoot = path.dirname(createRequire(path.join(root, 'package.json')).resolve('commander'));
const bytes = new Map();
for (const [name, expected] of Object.entries(pins.sources)) {
  const file = name.startsWith('commander/') ? path.join(dependencyRoot, name.slice(10)) : path.join(root, name);
  const content = fs.readFileSync(file);
  assert.equal(hash(content), expected, `SOURCE_PIN_MISMATCH:${name}`);
  bytes.set(name, content);
}
const commandSource = fs.readFileSync(path.join(dir, 'refusal-command.js'), 'utf8');
assert.equal(hash(commandSource), pins.commandSha256, 'COMMAND_PIN_MISMATCH');
assert.equal(JSON.parse(bytes.get('package.json')).version, '1.8.7');
const actualNames = pins.executedOpenCliAllowlist;
const temp = fs.mkdtempSync(path.join(dir, '.qualification-'));
const receipts = [];
try {
const copiedRoot = path.join(temp, 'node_modules/@jackwener/opencli');
const copiedCommander = path.join(temp, 'node_modules/commander');
for (const [name, content] of bytes) {
  const target = name.startsWith('commander/') ? path.join(copiedCommander, name.slice(10)) : path.join(copiedRoot, name);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content);
}
const installedBefore = Object.fromEntries([...bytes].map(([name, value]) => [name, hash(value)]));
for (const kind of ['refusal', 'missing-command', 'broken-import', 'collision', 'collision-unguarded', 'effect-trap']) {
  const home = path.join(temp, kind, 'home');
  fs.mkdirSync(path.join(home, '.opencli/clis/chatgpt'), { recursive: true });
  fs.mkdirSync(path.join(copiedRoot, 'clis'), { recursive: true });
  const sentinels = ['sentinel.txt', '.opencli/config.json', '.opencli/plugins/sentinel/keep.txt'].map(name => path.join(home, name));
  for (const sentinel of sentinels) { fs.mkdirSync(path.dirname(sentinel), { recursive: true }); fs.writeFileSync(sentinel, 'immutable synthetic sentinel\n'); }
  const sentinelBefore = sentinels.map(file => hash(fs.readFileSync(file)));
  const commandFile = path.join(home, '.opencli/clis/chatgpt/research-standard.js');
  const caseCommand = kind === 'broken-import' ? commandSource.replace('@jackwener/opencli/registry', '@jackwener/opencli/no-such-export') : kind === 'effect-trap' ? commandSource.replace('async func()', 'async func(page)').replace('globalThis.__qualification.callbackCount++;', 'globalThis.__qualification.callbackCount++; page.nativeClick();') : commandSource;
  if (kind !== 'missing-command') fs.writeFileSync(commandFile, caseCommand);
  if (kind.startsWith('collision')) {
    const plugin = path.join(home, '.opencli/plugins/collision/collision.js'); fs.mkdirSync(path.dirname(plugin), { recursive: true });
    fs.writeFileSync(plugin, "import { cli } from '@jackwener/opencli/registry'; cli({site:'chatgpt',name:'research-standard',browser:true,access:'write',siteSession:'persistent',navigateBefore:false,func:async()=>{globalThis.__qualification.collisionSelectedCount++;throw Error('COLLISION_SELECTED')}});\n");
  }
  const events = [], traps = [], collisions = [], modules = new Map(), cjsCache = new Map(), loaded = [], stubsLoaded = [], resolutions = [], timers = new Set();
  let releaseGate, exitResolve, exitSeen = false, capturedCode;
  const exitSignal = new Promise(resolve => { exitResolve = resolve; });
  const qualification = { callbackCount: 0, collisionSelectedCount: 0, collisions, refusalGate: new Promise(resolve => { releaseGate = resolve; }) };
  const fail = label => (...args) => { traps.push(label); throw new Error(`EFFECT_TRAP:${label}`); };
  const relative = file => file.replaceAll(temp, '<temporary>');
  const within = file => {
    const full = path.resolve(file instanceof URL ? url.fileURLToPath(file) : file);
    assert(full.startsWith(temp + path.sep), `FS_OUTSIDE_OWNED_TEMP:${relative(full)}`);
    let parent = full;
    while (!fs.existsSync(parent)) parent = path.dirname(parent);
    assert(fs.realpathSync(parent).startsWith(temp + path.sep) || fs.realpathSync(parent) === temp, 'FS_SYMLINK_ESCAPE');
    return full;
  };
  const fsAdapter = {};
  for (const name of ['existsSync', 'readFileSync', 'statSync', 'accessSync', 'realpathSync']) fsAdapter[name] = (file, ...args) => fs[name](within(file), ...args);
  fsAdapter.promises = {};
  for (const name of ['mkdir', 'readFile', 'writeFile', 'readlink', 'rm', 'access', 'readdir', 'stat', 'realpath', 'lstat']) {
    fsAdapter.promises[name] = (file, ...args) => fs.promises[name](within(file), ...args);
  }
  fsAdapter.promises.symlink = (target, link, ...args) => fs.promises.symlink(within(target), within(link), ...args);
  const safeFs = new Proxy(fsAdapter, { get(target, key) { return key in target ? target[key] : fail(`fs.${String(key)}`); } });
  const stderr = [], stdout = [];
  const fakeProcess = new Proxy({
    argv: ['node', path.join(copiedRoot, 'dist/src/main.js'), 'chatgpt', 'research-standard'], env: { CI: '1', HOME: home, PATH: '' },
    execArgv: [], pid: 123, platform: process.platform, version: process.version, versions: { node: process.versions.node }, execPath: 'node',
    cwd: () => home, stdout: { write: text => { stdout.push(text); return true; }, isTTY: false }, stderr: { write: text => { stderr.push(text); return true; }, isTTY: false },
    exit(code) { capturedCode = code; exitSeen = true; exitResolve(); throw new Error(`FIXTURE_EXIT:${code}`); },
  }, { get(target, key) { return key in target ? target[key] : fail(`process.${String(key)}`); }, set(target, key, value) {
    if (key === 'exitCode') { capturedCode = value; exitSeen = true; events.push({ type: 'action-settled', exitCode: value }); exitResolve(); }
    target[key] = value; return true;
  } });
  class RegistryMap extends Map {
    set(key, value) {
      if (this.has(key) && key === 'chatgpt/research-standard') { collisions.push(key); if (kind !== 'collision-unguarded') throw new Error('FIXTURE_COLLISION'); }
      return super.set(key, value);
    }
  }
  const page = new Proxy({}, { get(_target, key) { return key === 'then' ? undefined : fail(`browser.page.${String(key)}`); } });
  class BrowserBridge {
    async connect(options) { events.push({ type: 'synthetic-browser-connect', options }); return page; }
    async close() { events.push({ type: 'synthetic-browser-close' }); }
  }
  const context = vm.createContext({
    process: fakeProcess, console: { log: (...args) => stdout.push(args.join(' ')), error: (...args) => stderr.push(args.join(' ')), warn: (...args) => stderr.push(args.join(' ')) }, URL, Buffer,
    __opencli_registry__: new RegistryMap(), __qualification: qualification,
    fetch: fail('network.fetch'), setInterval: fail('setInterval'),
    setTimeout(fn, ms) { assert(ms >= 45000, 'UNEXPECTED_TIMER'); const timer = { ms }; timers.add(timer); return timer; }, clearTimeout: timer => timers.delete(timer),
  }, { codeGeneration: { strings: false, wasm: false } });
  const builtin = {
    'node:fs': safeFs, 'node:path': path, 'node:url': url, 'node:os': { homedir: () => home },
    'node:crypto': { createHash: crypto.createHash, randomUUID: fail('crypto.randomUUID') },
    'node:events': { EventEmitter }, 'node:process': fakeProcess,
    'node:child_process': new Proxy({}, { get: (_target, key) => fail(`child_process.${String(key)}`) }),
  };
  const custom = {
    'logger.js': { log: { warn: message => events.push({ type: 'warning', message: relative(message) }) } },
    'node-network.js': { installNodeNetwork: () => events.push({ type: 'stub-network-install' }) },
    'update-check.js': { registerUpdateNoticeOnExit: () => {}, checkForUpdateBackground: () => {} },
    'external.js': { loadExternalClis: () => [], isBinaryInstalled: () => false },
    'commands/auth.js': { registerAuthCommands: program => program.command('auth') },
    'browser/index.js': { BrowserBridge, CDPBridge: fail('CDPBridge') },
    'electron-apps.js': { isElectronApp: () => false },
    'browser/profile.js': { resolveProfileSelection: () => ({ contextId: 'synthetic-context' }), profileRouteParams: () => ({ contextId: 'synthetic-context' }) },
    'browser/daemon-client.js': {
      generateRunId: () => 'run_123_synthetic', setDaemonCommandTimeoutSeconds: value => events.push({ type: 'command-timeout', value }),
      setDaemonRunContext: value => events.push({ type: 'run-context', value }), clearDaemonRunContext: () => events.push({ type: 'clear-run-context' }),
      isUnknownOutcomeError: () => false, releaseSiteSessionLease: async () => events.push({ type: 'synthetic-lease-release' }),
    },
  };
  function resolveSpecifier(specifier, parent) {
    if (specifier.startsWith('node:')) { if (!(specifier in builtin)) return fail(`builtin:${specifier}`)(); return specifier; }
    if (specifier === 'js-yaml') return 'stub:js-yaml';
    let file;
    if (specifier.startsWith('file:')) file = url.fileURLToPath(specifier);
    else file = createRequire(parent).resolve(specifier);
    file = fs.realpathSync(file);
    within(file);
    resolutions.push({ specifier: relative(specifier), parent: relative(parent), resolved: relative(file) });
    return file;
  }
  function cjs(file) {
    if (cjsCache.has(file)) return cjsCache.get(file).exports;
    const name = 'commander/' + path.relative(copiedCommander, file);
    assert(bytes.has(name), `UNLISTED_CJS:${name}`);
    const module = { exports: {} }; cjsCache.set(file, module); loaded.push(name);
    const wrapper = vm.runInContext(`(function(require,module,exports,__filename,__dirname){${bytes.get(name).toString()}\n})`, context, { filename: name, timeout: 1000 });
    wrapper(specifier => { const id = resolveSpecifier(specifier, file); return id.startsWith('node:') ? builtin[id] : cjs(id); }, module, module.exports, file, path.dirname(file));
    return module.exports;
  }
  // Preflight: derive only named static export requirements from pinned actual modules.
  // Missing module bodies remain fail-closed stubs; none are imported into the host runtime.
  const stubExports = new Map();
  for (const name of actualNames) {
    const source = bytes.get(name).toString();
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      if (!match[2].startsWith('.')) continue;
      const id = path.resolve(copiedRoot, path.dirname(name), match[2]);
      const symbols = stubExports.get(id) || new Set();
      for (const token of match[1].split(',')) { const symbol = token.trim().split(/\s+as\s+/)[0]; if (symbol) symbols.add(symbol); }
      stubExports.set(id, symbols);
    }
  }
  for (const [name, exports] of Object.entries(custom)) {
    const id = path.join(copiedRoot, 'dist/src', name), symbols = stubExports.get(id) || new Set();
    for (const key of Object.keys(exports)) symbols.add(key); stubExports.set(id, symbols);
  }
  function synthetic(id, exports) {
    return new vm.SyntheticModule(Object.keys(exports), function() { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context, identifier: id });
  }
  async function load(id) {
    if (modules.has(id)) return modules.get(id);
    let module;
    if (id.startsWith('node:')) module = synthetic(id, { ...builtin[id], default: builtin[id] });
    else if (id === 'stub:js-yaml') module = synthetic(id, { default: { dump: value => JSON.stringify(value) + '\n', load: fail('yaml.load') } });
    else if (id.startsWith(copiedCommander + '/')) module = synthetic(id, cjs(id));
    else {
      const name = path.relative(copiedRoot, id);
      if (actualNames.includes(name) || id.startsWith(home + '/')) {
        assert(name !== 'dist/src/daemon.js'); loaded.push(id.startsWith(home + '/') ? relative(id) : name);
        module = new vm.SourceTextModule(fs.readFileSync(id, 'utf8'), { context, identifier: id,
          initializeImportMeta: meta => { meta.url = url.pathToFileURL(id).href; },
          importModuleDynamically: async (specifier, parent) => {
            const child = await load(resolveSpecifier(specifier, parent.identifier));
            if (child.status === 'linked') await child.evaluate({ timeout: 1000 });
            return child;
          },
        });
      } else {
        const required = stubExports.get(id);
        if (!required) return fail(`unlisted-module:${relative(id)}`)();
        const exports = Object.fromEntries([...required].map(key => [key, fail(`${name}:${key}`)]));
        Object.assign(exports, custom[name.replace(/^dist\/src\//, '')] || {});
        stubsLoaded.push({ module: name, exports: Object.keys(exports) }); module = synthetic(id, exports);
      }
    }
    modules.set(id, module);
    await module.link((specifier, parent) => load(resolveSpecifier(specifier, parent.identifier)));
    return module;
  }
  // Trap controls execute before main is loaded. They are expected and recorded separately.
  assert.throws(() => builtin['node:child_process'].spawn('ignored'), /EFFECT_TRAP/);
  assert.throws(() => vm.runInContext('fetch("https://invalid.example")', context), /EFFECT_TRAP/);
  assert.throws(() => page.nativeClick(), /EFFECT_TRAP/);
  const preflightTraps = traps.splice(0);
  let mainError;
  try { await (await load(path.join(copiedRoot, 'dist/src/main.js'))).evaluate({ timeout: 1000 }); }
  catch (error) { mainError = relative(error.message); }
  events.push({ type: 'main-evaluation-ended', callbacks: qualification.callbackCount, exitSeen });
  if (kind === 'refusal') {
    assert.equal(mainError, undefined); assert.equal(exitSeen, false, 'MAIN_IMPORT_IS_NOT_SETTLEMENT');
    for (let i = 0; i < 20 && qualification.callbackCount === 0; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(qualification.callbackCount, 1, JSON.stringify({events,stderr,traps}));
    releaseGate(); await Promise.race([exitSignal, new Promise((_, reject) => setTimeout(() => reject(Error('SETTLEMENT_NOT_OBSERVED')), 1000))]);
    assert.equal(capturedCode, 1); assert(stderr.join('').includes('ERR_STANDARD_DRIVER_UNQUALIFIED'));
  } else { releaseGate(); await Promise.race([exitSignal, new Promise((_, reject) => setTimeout(() => reject(Error('CONTROL_SETTLEMENT_NOT_OBSERVED')), 1000))]); }
  const registry = context.__opencli_registry__, cmd = registry.get('chatgpt/research-standard');
  if (kind === 'missing-command' || kind === 'broken-import') { assert.equal(qualification.callbackCount, 0); assert.equal(cmd, undefined); assert.equal(capturedCode, 2); }
  if (kind === 'broken-import') assert(events.some(event => event.type === 'warning' && event.message.includes('ERR_PACKAGE_PATH_NOT_EXPORTED')));
  if (kind === 'collision') { assert.equal(collisions.length, 1); assert.equal(qualification.callbackCount, 0); assert(stderr.join('').includes('FIXTURE_COLLISION')); }
  if (kind === 'collision-unguarded') { assert.equal(collisions.length, 1); assert.equal(qualification.callbackCount, 0); assert.equal(qualification.collisionSelectedCount, 1); assert(stderr.join('').includes('COLLISION_SELECTED')); }
  if (kind === 'effect-trap') { assert.deepEqual(traps, ['browser.page.nativeClick']); assert.equal(qualification.callbackCount, 1); assert(stderr.join('').includes('EFFECT_TRAP:browser.page.nativeClick')); }
  assert.deepEqual(sentinels.map(file => hash(fs.readFileSync(file))), sentinelBefore);
  if (kind === 'refusal') {
    assert.equal(cmd, modules.get(commandFile).namespace.command);
    assert.equal(cmd.browser, true); assert.equal(cmd.access, 'write'); assert.equal(cmd.siteSession, 'persistent'); assert.equal(cmd.navigateBefore, false);
    assert(resolutions.some(item => item.specifier === '@jackwener/opencli/registry' && item.resolved === relative(path.join(copiedRoot, 'dist/src/registry-api.js'))));
    assert.equal(events.filter(event => event.type === 'action-settled').length, 1);
    assert.equal(events.filter(event => event.type === 'synthetic-browser-close').length, 1);
  }
  assert.equal(timers.size, 0);
  if (kind !== 'effect-trap') assert.deepEqual(traps, []);
  receipts.push({ kind, commandSha256: kind === 'missing-command' ? null : hash(caseCommand), callbackCount: qualification.callbackCount, collisionSelectedCount: qualification.collisionSelectedCount, exitCode: capturedCode, mainError, collisions,
    metadata: cmd && { browser: cmd.browser, access: cmd.access, siteSession: cmd.siteSession, navigateBefore: cmd.navigateBefore },
    stderr: stderr.map(relative), stdout: stdout.map(relative), simulatedBuiltins: Object.keys(builtin), additionalStub: 'js-yaml (JSON rendering, load traps)', preflightTraps, traps, loaded, stubsLoaded, resolutions, events, sentinelUnchanged: true });
}
for (const [name, expected] of Object.entries(installedBefore)) {
  const file = name.startsWith('commander/') ? path.join(dependencyRoot, name.slice(10)) : path.join(root, name);
  assert.equal(hash(fs.readFileSync(file)), expected, `INSTALLED_SOURCE_MUTATED:${name}`);
}
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
assert.equal(fs.existsSync(temp), false);
console.log(JSON.stringify({ status: 'pass', qualification: 'source VM chain with native require resolution; not full runtime', node: process.version,
  opencli: '1.8.7', servedModel: 'unknown', installedSourcesUnchanged: true, cleaned: true, cases: receipts }, null, 2));
