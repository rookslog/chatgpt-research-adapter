// Independent failure-contract probe for the actual runner. Never edits runner bytes.
// Usage: node --experimental-vm-modules this-file.mjs <runner.mjs> <OpenCLI-root>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';

const [runnerArg, rootArg] = process.argv.slice(2);
assert(runnerArg && rootArg, 'Supply actual runner path and existing OpenCLI package root');
const runner = fs.realpathSync(runnerArg), directory = path.dirname(runner);
const root = fs.realpathSync(rootArg);
const pins = JSON.parse(fs.readFileSync(path.join(directory, 'SOURCE-PINS.json')));
const commander = path.dirname(createRequire(path.join(root, 'package.json')).resolve('commander'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = Object.keys(pins.sources).map(name => name.startsWith('commander/') ? path.join(commander, name.slice(10)) : path.join(root, name));
const sourceHashes = () => sourcePaths.map(file => hash(fs.readFileSync(file)));
const originalSources = sourceHashes();
const originals = { mkdtempSync: fs.mkdtempSync, mkdirSync: fs.mkdirSync, writeFileSync: fs.writeFileSync, rmSync: fs.rmSync };
function snapshot(directory, omit) {
  const results = {};
  function visit(file, relative) {
    if (file === omit) return;
    const info = fs.lstatSync(file);
    if (info.isSymbolicLink()) results[relative] = { link: fs.readlinkSync(file) };
    else if (info.isDirectory()) {
      results[relative] = 'directory';
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name), path.join(relative, name));
    } else results[relative] = hash(fs.readFileSync(file));
  }
  visit(directory, '.'); return results;
}
const before = snapshot(directory);
const cases = [];
for (const phase of ['mkdirSync', 'writeFileSync']) {
  let created, error, injected = false;
  fs.mkdtempSync = function(prefix, ...args) {
    const value = originals.mkdtempSync.call(fs, prefix, ...args);
    if (prefix === path.join(directory, '.qualification-')) created = value;
    return value;
  };
  fs[phase] = function(file, ...args) {
    if (!injected && created && String(file).startsWith(created + path.sep)) {
      injected = true;
      throw new Error(`REVIEW_SYNTHETIC_${phase}_ERROR`);
    }
    return originals[phase].call(fs, file, ...args);
  };
  syncBuiltinESMExports();
  // run.mjs reads its package argument from argv[2].
  process.argv[2] = root;
  try {
    try { await import(pathToFileURL(runner).href + `?review_fault=${phase}`); }
    catch (caught) { error = caught.message; }
    assert.equal(error, `REVIEW_SYNTHETIC_${phase}_ERROR`, 'The actual runner must reach the injected source-copy/setup operation');
    assert(created && injected);
    const leaked = fs.existsSync(created);
    assert.deepEqual(sourceHashes(), originalSources, 'Installed pinned sources changed');
    assert.deepEqual(snapshot(directory, created), before, 'Unrelated candidate paths changed');
    cases.push({ phase, actualRunnerReached: true, injectedError: error, leakedTemporaryDirectory: leaked, installedSourcesUnchanged: true, unrelatedCandidatePathsUnchanged: true });
  } finally {
    Object.assign(fs, originals); syncBuiltinESMExports();
    // Only remove the exact newly created directory observed from this invocation.
    if (created) {
      assert(path.dirname(created) === directory && path.basename(created).startsWith('.qualification-'));
      originals.rmSync.call(fs, created, { recursive: true, force: true });
      assert(!fs.existsSync(created));
    }
  }
}
assert.deepEqual(snapshot(directory), before);
console.log(JSON.stringify({ contract: 'setup/copy failure removes newly owned temporary directory and preserves unrelated paths and pinned installed sources', cases, reviewerCleanupComplete: true }, null, 2));
assert.deepEqual(cases.map(entry => entry.leakedTemporaryDirectory), [false, false], 'Runner cleanup must cover setup and copy failures');
