import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { preflightOpenCli, runOpenCliAsk } from '../src/opencli-transport.js';

const fixtureUrl = new URL('./fixtures/chatgpt-web-tools-current.json', import.meta.url);

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function pinnedWebCandidate(fixture) {
  const labels = ['网页搜索', '搜索', 'Web Search', 'Search'];
  return fixture.options.find((option) => labels.some((label) => normalize(option.text).toLowerCase().includes(normalize(label).toLowerCase())));
}

async function withFakeWebSelectorOpenCli(run) {
  const root = await mkdtemp(join(tmpdir(), 'm006-web-selector-'));
  const installRoot = join(root, 'install');
  const packageRoot = join(installRoot, 'node_modules', '@jackwener', 'opencli');
  const sourcePath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  const executablePath = join(packageRoot, 'dist', 'src', 'main.js');
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module' })}\n`);
  await writeFile(sourcePath, `const CHATGPT_TOOL_OPTIONS = {\n    'deep-research': { label: 'Deep Research', labels: ['深度研究', 'Deep Research'] },\n    'web-search': { label: 'Web Search', labels: ['网页搜索', '搜索', 'Web Search', 'Search'] },\n};\n\nexport async function selectChatGPTTool(page, tool) {\n    const target = requireKnownChatGPTTool(tool);\n    if (typeof page.nativeClick !== 'function') {\n        throw new CommandExecutionError('ChatGPT tool selection requires native browser click support.');\n    }\n    await ensureOnChatGPT(page);\n    await ensureChatGPTComposer(page, 'ChatGPT tool selection requires a logged-in ChatGPT session with a visible composer.');\n\n    const before = await getCurrentChatGPTTool(page);\n    return before;\n}\n`);
  await writeFile(executablePath, `#!/usr/bin/env node\nimport { readFileSync } from 'node:fs';\nconst source = readFileSync(${JSON.stringify(sourcePath)}, 'utf8');\nconst fixture = ${JSON.stringify(fixture)};\nif (process.argv[2] === '--version') {\n  console.log('1.8.7');\n} else {\n  const broadLabels = ['网页搜索', '搜索', 'Web Search', 'Search'];\n  const normalized = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();\n  const hasExactHelper = source.includes('async function selectChatGPTWebSearch(page, target)');\n  const hasEarlyWebBranch = source.includes("if (target.key === 'web-search') return selectChatGPTWebSearch(page, target);");\n  const selected = hasExactHelper && hasEarlyWebBranch\n    ? fixture.options.find((option) => ['网页搜索', 'Web Search'].some((label) => normalized(option.primary) === normalized(label)))\n    : fixture.options.find((option) => broadLabels.some((label) => normalized(option.text).includes(normalized(label))));\n  const selectedChipOk = hasExactHelper && normalized(fixture.selected_chip.primary) === normalized('Web Search');\n  if (selected?.id !== 'web-search' || !selectedChipOk) {\n    console.error('ChatGPT tool did not switch to Web Search.');\n    process.exit(4);\n  }\n  console.log(JSON.stringify([{ conversationId: 'web-selector-1', conversationUrl: 'https://chatgpt.com/c/web-selector-1', tool: 'Web Search', response: '' }]));\n}\n`, { mode: 0o700 });
  try { return await run({ executablePath, sourcePath, fixture }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('current pinned Web Search matching selects the preceding library row', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(pinnedWebCandidate(fixture)?.id, 'library');
});

test('web ask patches only the temporary pinned selector so the exact Web Search row is selected', async () => withFakeWebSelectorOpenCli(async ({ executablePath, sourcePath }) => {
  const installedBefore = await readFile(sourcePath, 'utf8');
  const identity = await preflightOpenCli({ executablePath });
  const result = await runOpenCliAsk({ executablePath, identity, prompt: 'research this', mode: 'web', timeoutSeconds: 600 });
  assert.equal(result.tool, 'Web Search');
  assert.deepEqual(await readFile(sourcePath, 'utf8'), installedBefore);
}));
