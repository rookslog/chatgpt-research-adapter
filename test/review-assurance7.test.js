import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { preflightOpenCli, runOpenCliDetail } from '../src/opencli-transport.js';

const converterSource = `import { htmlToMarkdown } from '@jackwener/opencli/utils';\n\nexport function messageHtmlToMarkdown(html) {\n    try {\n        return htmlToMarkdown(html).trim();\n    } catch {\n        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();\n    }\n}\n`;

async function fixture({ requireCallerConfig = false, requireUserProfileIsolation = false, readOnlyDirectories = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'review-assurance7-'));
  const installRoot = join(root, 'install');
  const packageRoot = join(installRoot, 'node_modules', '@jackwener', 'opencli');
  const pluginRoot = join(installRoot, 'node_modules', 'turndown-plugin-gfm');
  const callerHome = join(root, 'caller-home');
  const callerUserProfile = join(root, 'caller-user-profile');
  const callerConfig = join(root, 'caller-opencli-config');
  const callerXdg = join(root, 'caller-xdg');
  const dirs = [
    packageRoot,
    join(packageRoot, 'dist'),
    join(packageRoot, 'dist', 'src'),
    join(packageRoot, 'clis'),
    join(packageRoot, 'clis', 'chatgpt')
  ];
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await mkdir(pluginRoot, { recursive: true });
  await Promise.all([mkdir(callerHome), mkdir(callerUserProfile), mkdir(callerConfig), mkdir(callerXdg)]);
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module', exports: { './utils': './dist/src/utils.js' } })}\n`);
  await writeFile(join(packageRoot, 'dist', 'src', 'utils.js'), `export function htmlToMarkdown(value, configure) { const service = { use() {}, escape(text) { return text; } }; configure?.(service); return '[C1]'; }\n`);
  await writeFile(join(packageRoot, 'clis', 'chatgpt', 'utils.js'), converterSource);
  await writeFile(join(pluginRoot, 'package.json'), `${JSON.stringify({ name: 'turndown-plugin-gfm', version: '1.0.2', type: 'module', exports: './index.js' })}\n`);
  await writeFile(join(pluginRoot, 'index.js'), `export const tables = Object.freeze({ fixture: 'gfm-tables' });\n`);

  const configCheck = requireCallerConfig
    ? `if (process.env.OPENCLI_CONFIG_DIR !== ${JSON.stringify(callerConfig)} || process.env.XDG_CONFIG_HOME !== ${JSON.stringify(callerXdg)} || process.env.HOME === ${JSON.stringify(callerHome)}) process.exit(7);`
    : '';
  const userProfileCheck = requireUserProfileIsolation
    ? `if (process.env.USERPROFILE !== process.env.HOME || process.env.USERPROFILE === ${JSON.stringify(callerUserProfile)}) process.exit(8);`
    : '';
  const executablePath = join(packageRoot, 'dist', 'src', 'main.js');
  await writeFile(executablePath, `#!/usr/bin/env node\nimport { messageHtmlToMarkdown } from '../../clis/chatgpt/utils.js';\nif (process.argv[2] === '--version') console.log('1.8.7');\nelse { ${configCheck} ${userProfileCheck} console.log(JSON.stringify([{ Index: 1, Role: 'Assistant', Text: messageHtmlToMarkdown('<p>[C1]</p>'), Generating: false, StableSeconds: 3 }])); }\n`, { mode: 0o700 });

  if (readOnlyDirectories && process.platform !== 'win32') {
    for (const directory of dirs.slice().reverse()) await chmod(directory, 0o555);
  }
  const environment = { ...process.env, HOME: callerHome, USERPROFILE: callerUserProfile, OPENCLI_CONFIG_DIR: callerConfig, XDG_CONFIG_HOME: callerXdg };
  return { root, executablePath, environment, dirs };
}

async function cleanup(value) {
  if (process.platform !== 'win32') {
    for (const directory of value.dirs) await chmod(directory, 0o755).catch(() => {});
  }
  await rm(value.root, { recursive: true, force: true });
}

async function detail(value, id) {
  const identity = await preflightOpenCli({ executablePath: value.executablePath, environment: value.environment });
  return runOpenCliDetail({ executablePath: value.executablePath, identity, conversationId: id, timeoutSeconds: 60, environment: value.environment });
}

test('REQ-OPENCLI-MARKDOWN-001 preserves caller OpenCLI and XDG config while isolating HOME', async () => {
  const value = await fixture({ requireCallerConfig: true });
  try {
    const result = await detail(value, 'assurance7-config-1');
    assert.match(result.response, /\[C1\]/);
  } finally {
    await cleanup(value);
  }
});

test('REQ-OPENCLI-MARKDOWN-001 isolates Windows USERPROFILE with the disposable HOME', async () => {
  const value = await fixture({ requireUserProfileIsolation: true });
  try {
    const result = await detail(value, 'assurance7-userprofile-1');
    assert.match(result.response, /\[C1\]/);
  } finally {
    await cleanup(value);
  }
});

test('REQ-OPENCLI-MARKDOWN-001 cleans up a compatibility copy whose source directories are read-only', async (t) => {
  if (process.platform === 'win32') { t.skip('POSIX permission regression'); return; }
  const value = await fixture({ readOnlyDirectories: true });
  try {
    const result = await detail(value, 'assurance7-cleanup-1');
    assert.match(result.response, /\[C1\]/);
  } finally {
    await cleanup(value);
  }
});
