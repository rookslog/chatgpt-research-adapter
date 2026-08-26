import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { preflightOpenCli, runOpenCliDetail } from '../src/opencli-transport.js';

async function withMarkdownOpenCli(run, { detailExitCode = 0, readOnlyPackageParent = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'm006-markdown-hardening-'));
  const installRoot = join(root, 'install');
  const packageParent = join(installRoot, 'node_modules', '@jackwener');
  const packageRoot = join(packageParent, 'opencli');
  const pluginRoot = join(installRoot, 'node_modules', 'turndown-plugin-gfm');
  const converterPath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  const html = await readFile(new URL('./fixtures/chatgpt-markdown.html', import.meta.url), 'utf8');
  const expected = (await readFile(new URL('./fixtures/chatgpt-markdown.gfm.md', import.meta.url), 'utf8')).trim();
  const codeLiteral = 'Inline code: `literal \\[C1\\]`\n\n```text\nliteral \\[C1\\]\n```';
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module', exports: { './utils': './dist/src/utils.js' } })}\n`);
  await writeFile(join(packageRoot, 'dist', 'src', 'utils.js'), `export function htmlToMarkdown(value, configure) {\n  let tablesEnabled = false;\n  const service = {\n    use(plugin) { if (plugin?.fixture === 'gfm-tables') tablesEnabled = true; },\n    escape(text) { return text.replace(/\\[/g, '\\\\[').replace(/\\]/g, '\\\\]'); }\n  };\n  configure?.(service);\n  if (value !== ${JSON.stringify(html)}) throw new Error('unexpected fixture');\n  const converted = ${JSON.stringify(expected)}\n    .replace('**[C-001]**', '**' + service.escape('[C-001]') + '**')\n    .replace('Inline [C1]', 'Inline ' + service.escape('[C1]'));\n  return tablesEnabled ? converted + ${JSON.stringify(`\n\n${codeLiteral}`)} : 'linearized';\n}\n`);
  await writeFile(converterPath, `import { htmlToMarkdown } from '@jackwener/opencli/utils';\n\nexport function messageHtmlToMarkdown(html) {\n    try {\n        return htmlToMarkdown(html).trim();\n    } catch {\n        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();\n    }\n}\n`);
  await writeFile(join(pluginRoot, 'package.json'), `${JSON.stringify({ name: 'turndown-plugin-gfm', version: '1.0.2', type: 'module', exports: './index.js' })}\n`);
  await writeFile(join(pluginRoot, 'index.js'), "export const tables = Object.freeze({ fixture: 'gfm-tables' });\n");
  const path = join(packageRoot, 'dist', 'src', 'main.js');
  const detailBody = detailExitCode === 0
    ? `console.log(JSON.stringify([{ Index: 1, Role: 'User', Text: 'question', Generating: false, StableSeconds: 3 }, { Index: 2, Role: 'Assistant', Text: messageHtmlToMarkdown(${JSON.stringify(html)}), Generating: false, StableSeconds: 3 }]));`
    : `process.exit(${detailExitCode});`;
  await writeFile(path, `#!/usr/bin/env node\nimport { messageHtmlToMarkdown } from '../../clis/chatgpt/utils.js';\nif (process.argv[2] === '--version') console.log('1.8.7');\nelse { ${detailBody} }\n`, { mode: 0o700 });
  if (readOnlyPackageParent && process.platform !== 'win32') await chmod(packageParent, 0o555);
  try { return await run({ path, expected, converterPath, packageParent }); }
  finally {
    if (readOnlyPackageParent && process.platform !== 'win32') await chmod(packageParent, 0o755).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}

function temporaryCopies(names) {
  return names.filter((name) => name.startsWith('.chatgpt-research-opencli-'));
}

test('preserves supported claim IDs while leaving near-miss brackets escaped', async () => withMarkdownOpenCli(async ({ path }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  const { response } = await runOpenCliDetail({ executablePath: path, identity, conversationId: 'claims-1', timeoutSeconds: 60 });
  assert.match(response, /\*\*\[C-001\]\*\*/);
  assert.match(response, /Inline \[C1\]/);
  assert.match(response, /Near misses: \\\[C-x\\\] \\\[C_001\\\] \\\[note\\\]/);
}));

test('preserves escaped pipes inside GFM table cells', async () => withMarkdownOpenCli(async ({ path }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  const { response } = await runOpenCliDetail({ executablePath: path, identity, conversationId: 'table-pipe-1', timeoutSeconds: 60 });
  assert.match(response, /\| gamma \| a \\\| b \|/);
}));

test('preserves claim-shaped escaped literals inside inline and fenced code', async () => withMarkdownOpenCli(async ({ path }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  const { response } = await runOpenCliDetail({ executablePath: path, identity, conversationId: 'code-claim-1', timeoutSeconds: 60 });
  assert.match(response, /Inline code: `literal \\\[C1\\\]`/);
  assert.match(response, /```text\nliteral \\\[C1\\\]\n```/);
}));

test('creates the compatibility copy without write access beside the installed package', async (t) => {
  if (process.platform === 'win32') { t.skip('POSIX permission regression'); return; }
  await withMarkdownOpenCli(async ({ path }) => {
    const identity = await preflightOpenCli({ executablePath: path });
    const { response } = await runOpenCliDetail({ executablePath: path, identity, conversationId: 'readonly-install-1', timeoutSeconds: 60 });
    assert.match(response, /\*\*\[C-001\]\*\*/);
  }, { readOnlyPackageParent: true });
});

test('does not mutate the installed ChatGPT Markdown converter', async () => withMarkdownOpenCli(async ({ path, converterPath }) => {
  const before = await readFile(converterPath);
  const identity = await preflightOpenCli({ executablePath: path });
  await runOpenCliDetail({ executablePath: path, identity, conversationId: 'immutable-1', timeoutSeconds: 60 });
  assert.deepEqual(await readFile(converterPath), before);
}));

test('removes the temporary OpenCLI package after a successful detail read', async () => withMarkdownOpenCli(async ({ path, packageParent }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  await runOpenCliDetail({ executablePath: path, identity, conversationId: 'cleanup-success-1', timeoutSeconds: 60 });
  assert.deepEqual(temporaryCopies(await readdir(packageParent)), []);
}));

test('removes the temporary OpenCLI package after a failed detail process', async () => withMarkdownOpenCli(async ({ path, packageParent }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  await assert.rejects(runOpenCliDetail({ executablePath: path, identity, conversationId: 'cleanup-failure-1', timeoutSeconds: 60 }), { code: 'ERR_OPENCLI_EXIT' });
  assert.deepEqual(temporaryCopies(await readdir(packageParent)), []);
}, { detailExitCode: 4 }));
