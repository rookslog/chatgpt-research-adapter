import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { preflightOpenCli, runOpenCliDetail } from '../src/opencli-transport.js';

const converterSource = `import { htmlToMarkdown } from '@jackwener/opencli/utils';\n\nexport function messageHtmlToMarkdown(html) {\n    try {\n        return htmlToMarkdown(html).trim();\n    } catch {\n        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();\n    }\n}\n`;

async function fakeOpenCli({ readOnlyConverter = false, packageLocalModules = false, writesUserMarker = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'review-final7-'));
  const installRoot = join(root, 'install');
  const packageRoot = join(installRoot, 'node_modules', '@jackwener', 'opencli');
  const pluginRoot = join(installRoot, 'node_modules', 'turndown-plugin-gfm');
  const converterPath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  const executablePath = join(packageRoot, 'dist', 'src', 'main.js');
  const callerHome = join(root, 'caller-home');
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await mkdir(pluginRoot, { recursive: true });
  await mkdir(callerHome, { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module', exports: { './utils': './dist/src/utils.js' } })}\n`);
  await writeFile(join(packageRoot, 'dist', 'src', 'utils.js'), `export function htmlToMarkdown(value, configure) { const service = { use() {}, escape(text) { return text.replace(/\\[/g, '\\\\[').replace(/\\]/g, '\\\\]'); } }; configure?.(service); return service.escape('[C1]'); }\n`);
  await writeFile(converterPath, converterSource);
  await writeFile(join(pluginRoot, 'package.json'), `${JSON.stringify({ name: 'turndown-plugin-gfm', version: '1.0.2', type: 'module', exports: './index.js' })}\n`);
  await writeFile(join(pluginRoot, 'index.js'), `export const tables = Object.freeze({ fixture: 'gfm-tables' });\n`);
  if (packageLocalModules) {
    const localRoot = join(packageRoot, 'node_modules', 'local-only');
    await mkdir(localRoot, { recursive: true });
    await writeFile(join(localRoot, 'package.json'), `${JSON.stringify({ name: 'local-only', version: '1.0.0' })}\n`);
  }
  const markerImports = writesUserMarker
    ? `import { homedir } from 'node:os'; import { mkdirSync, writeFileSync } from 'node:fs'; import { join } from 'node:path';`
    : '';
  const markerCode = writesUserMarker
    ? `const dir = join(homedir(), '.opencli'); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'compat-marker'), 'mutated');`
    : '';
  await writeFile(executablePath, `#!/usr/bin/env node\n${markerImports}\nimport { messageHtmlToMarkdown } from '../../clis/chatgpt/utils.js';\nif (process.argv[2] === '--version') console.log('1.8.7');\nelse { ${markerCode} console.log(JSON.stringify([{ Index: 1, Role: 'Assistant', Text: messageHtmlToMarkdown('<p>[C1]</p>'), Generating: false, StableSeconds: 3 }])); }\n`, { mode: 0o700 });
  if (readOnlyConverter && process.platform !== 'win32') await chmod(converterPath, 0o444);
  return { root, executablePath, converterPath, callerHome };
}

async function detailFor(fixture, conversationId, environment) {
  const identity = await preflightOpenCli({ executablePath: fixture.executablePath, environment });
  return runOpenCliDetail({ executablePath: fixture.executablePath, identity, conversationId, timeoutSeconds: 60, environment });
}

test('REQ-OPENCLI-MARKDOWN-001 patches a read-only converter only inside the private workspace', async (t) => {
  if (process.platform === 'win32') { t.skip('POSIX mode regression'); return; }
  const fixture = await fakeOpenCli({ readOnlyConverter: true });
  try {
    const before = await readFile(fixture.converterPath);
    const beforeMode = (await stat(fixture.converterPath)).mode & 0o777;
    const { response } = await detailFor(fixture, 'final7-readonly-1');
    assert.match(response, /\[C1\]/);
    assert.deepEqual(await readFile(fixture.converterPath), before);
    assert.equal((await stat(fixture.converterPath)).mode & 0o777, beforeMode);
  } finally {
    await chmod(fixture.converterPath, 0o644).catch(() => {});
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('REQ-OPENCLI-MARKDOWN-001 isolates the copied OpenCLI user runtime from caller HOME', async (t) => {
  if (process.platform === 'win32') { t.skip('HOME isolation regression is POSIX-scoped'); return; }
  const fixture = await fakeOpenCli({ writesUserMarker: true });
  const environment = { ...process.env, HOME: fixture.callerHome };
  try {
    await detailFor(fixture, 'final7-home-1', environment);
    await assert.rejects(stat(join(fixture.callerHome, '.opencli', 'compat-marker')), { code: 'ENOENT' });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('REQ-OPENCLI-MARKDOWN-002 preserves package-local and ancestor-hoisted dependency resolution', async () => {
  const fixture = await fakeOpenCli({ packageLocalModules: true });
  try {
    const { response } = await detailFor(fixture, 'final7-hoisted-1');
    assert.match(response, /\[C1\]/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
