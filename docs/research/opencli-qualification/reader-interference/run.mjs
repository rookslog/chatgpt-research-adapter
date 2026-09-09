// Source-only characterization. Never imports the daemon entrypoint.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || process.env.OPENCLI_ROOT;
assert(root, 'Pass OpenCLI package directory as argv[2] or OPENCLI_ROOT (no installation performed)');
assert(vm.SourceTextModule, 'Run with --experimental-vm-modules');
const pins = JSON.parse(readFileSync(resolve(directory, 'SOURCE-PINS.json'), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const sources = new Map();
for (const [file, hash] of Object.entries(pins.sources)) {
  const bytes = readFileSync(resolve(root, file));
  assert.equal(digest(bytes), hash, `SOURCE_PIN_MISMATCH: ${file}`);
  sources.set(file, bytes.toString('utf8'));
}
assert.equal(JSON.parse(sources.get('package.json')).version, '1.8.7');
const violations = [];
const fail = label => (...args) => { violations.push(label); throw new Error(`BOUNDARY: ${label}`); };
const extracted = {};
function extract(name, file, start, end) {
  const source = sources.get(file), a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a && source.indexOf(start, a + 1) === -1, `EXTRACTION_MARKER: ${name}`);
  const text = source.slice(a, b);
  extracted[name] = { file, start, end, sha256: digest(text) };
  assert.equal(digest(text), pins.extractions[name].sha256, `EXTRACTION_PIN_MISMATCH: ${name}`);
  return text;
}
const sessionHelpers = extract('sessionHelpers', 'dist/src/execution.js', 'function normalizeSiteSession(raw)', 'function normalizeBooleanOption(');
const leaseRun = extract('leaseRun', 'dist/src/execution.js', '            const leaseRun =', '            if (leaseRun)');
const arbitration = extract('arbitration', 'dist/src/daemon.js', '            let leaseKey;', '            // Absolute deadline');
const context = vm.createContext({
  Date: class extends Date { static now() { return 1000; } },
  fetch: fail('network'), setTimeout: fail('timer'), setInterval: fail('interval'),
  process: new Proxy({}, { get: fail('process access') }),
}, { codeGeneration: { strings: false, wasm: false } });
const actual = ['dist/src/registry-api.js', 'dist/src/registry.js', 'dist/src/hooks.js', 'dist/src/errors.js', 'dist/src/session-lease.js', 'clis/chatgpt/deep-research-result.js'];
const stubs = {
  'dist/src/logger.js': { log: { warn: fail('logger') } },
  'clis/chatgpt/utils.js': {
    CHATGPT_DOMAIN: 'chatgpt.com', CHATGPT_URL: 'https://chatgpt.com',
    currentChatGPTUrl: async page => page.currentUrl(),
    ensureChatGPTLogin: async page => page.observe('synthetic-login'),
    parseChatGPTConversationId: id => { assert.equal(id, 'synthetic-reader'); return id; },
    normalizeBooleanFlag: value => { assert.equal(value, false); return value; },
    requirePositiveInt: value => { assert(value > 0); return value; },
    requireNonNegativeInt: value => { assert(value >= 0); return value; },
    getChatGPTDeepResearchResult: async page => { await page.observe('synthetic-result'); return { status: 'completed', report: 'Synthetic report' }; },
    waitForChatGPTDeepResearchResult: fail('wait-for-result'),
  },
};
const modules = new Map(), executedModules = [];
async function load(id) {
  if (modules.has(id)) return modules.get(id);
  let module;
  if (Object.hasOwn(stubs, id)) {
    const exports = stubs[id];
    module = new vm.SyntheticModule(Object.keys(exports), function() {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context, identifier: id });
  } else {
    if (!actual.includes(id)) return fail(`unlisted-import:${id}`)();
    executedModules.push(id);
    module = new vm.SourceTextModule(sources.get(id), { context, identifier: id, importModuleDynamically: fail('dynamic-import') });
  }
  modules.set(id, module);
  await module.link((specifier, parent) => {
    const aliases = { '@jackwener/opencli/registry': 'dist/src/registry-api.js', '@jackwener/opencli/errors': 'dist/src/errors.js' };
    if (aliases[specifier]) return load(aliases[specifier]);
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return fail(`import:${specifier}`)();
    return load(resolve('/', dirname(parent.identifier), specifier).slice(1));
  });
  return module;
}
const collectorModule = await load('clis/chatgpt/deep-research-result.js');
await collectorModule.evaluate({ timeout: 1000 });
const leaseModule = await load('dist/src/session-lease.js');
await leaseModule.evaluate({ timeout: 1000 });
const lease = leaseModule.namespace;
const collector = collectorModule.namespace.deepResearchResultCommand;
assert.equal(collector, modules.get('dist/src/registry.js').namespace.getRegistry().get('chatgpt/deep-research-result'));
assert.equal(collector.access, 'read');
assert.equal(collector.siteSession, 'persistent');
const fragment = new vm.SourceTextModule(`
  const ArgumentError = Error;
  const crypto = { randomUUID() { throw Error('EPHEMERAL_NOT_ALLOWED'); } };
  const generateRunId = () => 'run_101_writer';
  ${sessionHelpers}
  export function metadata(cmd) {
    const siteSession = resolveSiteSession(cmd);
    const session = resolveAdapterBrowserSession(cmd, siteSession);
    ${leaseRun}
    return { siteSession, session, leaseRun };
  }
  export function arbitrate(body, route, sessionLeases, runHasPendingWork, jsonResponse, res, log,
    isSessionLeaseCommand, getSessionLeaseKey, buildSessionBusyFailure) {
    ${arbitration}
    return { dispatched: true, leaseKey, leaseRunId };
  }
`, { context, identifier: 'extracted-source-wrappers', importModuleDynamically: fail('fragment-dynamic-import') });
await fragment.link(fail('fragment-import'));
await fragment.evaluate({ timeout: 1000 });

async function scenario(kind, sameInitialUrl = false) {
  const events = [], registry = new lease.SessionLeaseRegistry();
  const writerTarget = { id: 'target-writer', url: sameInitialUrl ? 'https://chatgpt.com/c/synthetic-reader' : 'https://chatgpt.com/c/synthetic-writer', navigations: 0, inputs: 0 };
  const readerTarget = kind === 'shared-target' ? writerTarget : { id: 'target-reader', url: 'https://chatgpt.com/c/synthetic-other', navigations: 0, inputs: 0 };
  const cmd = { site: 'chatgpt', name: 'synthetic-writer', access: 'write', siteSession: 'persistent' };
  function body(command, runId) {
    const metadata = fragment.namespace.metadata(command);
    return { action: 'exec', command: `${command.site}/${command.name}`, surface: 'adapter', access: command.access,
      session: metadata.session, siteSession: metadata.siteSession, ...(metadata.leaseRun ? { runId: runId || metadata.leaseRun.runId } : {}) };
  }
  const writerBody = body(cmd), readerBody = body(collector);
  assert.equal(lease.isSessionLeaseCommand({ ...readerBody, runId: 'run_303_reader' }), false); // Read label alone excludes arbitration too.
  function dispatch(request) {
    let rejection;
    const result = fragment.namespace.arbitrate(request, { connection: { contextId: 'synthetic-context' } }, registry,
      () => false, (_res, status, value) => { rejection = { status, ...value }; }, {},
      { warn: message => events.push({ type: 'busy-log', message }) },
      lease.isSessionLeaseCommand, lease.getSessionLeaseKey, lease.buildSessionBusyFailure);
    if (rejection) { assert.equal(rejection.status, 409); assert.equal(rejection.errorCode, 'session_busy'); }
    events.push({ type: 'arbitration', request, eligible: lease.isSessionLeaseCommand(request), dispatched: !!result?.dispatched, rejection });
    return result;
  }
  assert(dispatch(writerBody)?.dispatched);
  const key = lease.getSessionLeaseKey('synthetic-context', writerBody.surface, writerBody.session);
  let release;
  const gate = new Promise(resolveGate => { release = resolveGate; });
  let held = false;
  const writer = (async () => {
    const expectedUrl = writerTarget.url;
    events.push({ type: 'writer-verification', target: writerTarget.id, expectedUrl });
    held = true;
    events.push({ type: 'writer-held-before-input' });
    await gate;
    writerTarget.inputs++;
    events.push({ type: 'synthetic-writer-input', expectedUrl, actualUrl: writerTarget.url, target: writerTarget.id });
  })();
  assert(held);
  // Positive arbitration control: a different eligible writer must be rejected.
  assert.equal(dispatch(body(cmd, 'run_202_second_writer')), undefined);
  assert.equal(registry.get(key, 1000).runId, writerBody.runId);
  let navigationEffects = 0;
  const page = new Proxy({
    currentUrl: async () => { events.push({ type: 'read-url', target: readerTarget.id, url: readerTarget.url }); return readerTarget.url; },
    observe: async phase => { events.push({ type: phase, target: readerTarget.id }); },
    readNetworkCapture: async () => { events.push({ type: 'read-network-capture', target: readerTarget.id }); return []; },
    startNetworkCapture: async filter => { events.push({ type: 'start-network-capture', target: readerTarget.id, filter }); return true; },
    goto: async url => {
      assert(held); assert.equal(writerTarget.inputs, 0); assert.equal(registry.get(key, 1000).runId, writerBody.runId);
      assert(dispatch(readerBody)?.dispatched);
      navigationEffects++; readerTarget.navigations++; readerTarget.url = url;
      events.push({ type: 'navigation-effect', target: readerTarget.id, url, navigationEffects, writerHeld: held, writerInputs: writerTarget.inputs });
    },
    sleep: async seconds => { assert.equal(seconds, 3); events.push({ type: 'synthetic-sleep', seconds }); },
    wait: async seconds => { assert.equal(seconds, 1); events.push({ type: 'synthetic-wait', seconds }); },
  }, { get(target, name) { return name in target ? target[name] : fail(`page:${String(name)}`); } });
  const result = await collector.func(page, { id: 'synthetic-reader', wait: false });
  assert.equal(result[0].report, 'Synthetic report');
  assert.equal(navigationEffects, sameInitialUrl ? 2 : 1);
  assert.equal(writerTarget.navigations, kind === 'shared-target' ? navigationEffects : 0);
  assert.equal(writerTarget.inputs, 0);
  assert.equal(registry.get(key, 1000).runId, writerBody.runId);
  held = false; release(); await writer;
  assert.equal(writerTarget.inputs, 1);
  return { kind, sameInitialUrl, collectorMetadata: { access: collector.access, ...fragment.namespace.metadata(collector) },
    navigationEffects, writerTarget, readerTarget, leaseHolderAfterCollector: registry.get(key, 1000).runId, events };
}
const cases = [await scenario('shared-target'), await scenario('disjoint-target'), await scenario('shared-target', true)];
assert.deepEqual(violations, []);
console.log(JSON.stringify({ status: 'pass', kind: 'offline-source-characterization', node: process.version, opencli: '1.8.7',
  executedModules, extractions: extracted, simulatedBoundaries: ['page/target identity and effects', 'utils.js helpers and results',
    'writer verification/input and barrier', 'context routing and clock', 'daemon request wrapper, logging and response'],
  daemonTopLevelExecuted: false, servedModel: 'unknown', violations, cases }, null, 2));
