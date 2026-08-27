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

function pinnedSelectorSource({ sourceDrift = false } = {}) {
  const rootSelector = sourceDrift
    ? '            const rootSelector = \'[role="menu"], [role="listbox"], [role="tree"]\';'
    : '            const rootSelector = \'[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-radix-menu-content], [data-testid*="menu"], [data-testid*="popover"]\';';
  return `const CHATGPT_TOOL_OPTIONS = {
    'deep-research': { label: 'Deep Research', labels: ['深度研究', 'Deep Research'] },
    'web-search': { label: 'Web Search', labels: ['网页搜索', '搜索', 'Web Search', 'Search'] },
};

export async function selectChatGPTTool(page, tool) {
    const target = requireKnownChatGPTTool(tool);
    if (typeof page.nativeClick !== 'function') {
        throw new CommandExecutionError('ChatGPT tool selection requires native browser click support.');
    }
    await ensureOnChatGPT(page);
    await ensureChatGPTComposer(page, 'ChatGPT tool selection requires a logged-in ChatGPT session with a visible composer.');

    const before = await getCurrentChatGPTTool(page);
    if (before.tool === target.key) {
        return { Status: 'Already selected', Tool: target.label };
    }

    const menuButton = { found: true, x: 1, y: 1 };
    await page.nativeClick(Number(menuButton.x), Number(menuButton.y));
    await page.wait(0.5);

    let optionCenter = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        optionCenter = requireObjectEvaluateResult(unwrapEvaluateResult(await page.evaluate(\`(() => {
            const isVisible = (el) => {
                if (!(el instanceof HTMLElement)) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            };
            const normalize = (value) => String(value || '').replace(/\\\\s+/g, ' ').trim();
            const compact = (value) => normalize(value).toLowerCase().replace(/[^\\\\p{L}\\\\p{N}]+/gu, '');
            const labels = \${JSON.stringify(target.labels)};
            const optionSelector = '[role="menuitemradio"], [role="menuitem"], [role="option"], button, div[tabindex="0"]';
${rootSelector}
            const visibleRoots = Array.from(document.querySelectorAll(rootSelector))
                .filter((node) => node instanceof HTMLElement && isVisible(node) && !node.closest('nav, aside'));
            const searchRoots = visibleRoots.length ? visibleRoots : [document];
            const options = Array.from(new Set(searchRoots.flatMap((root) => {
                const matchesRoot = root instanceof HTMLElement && root.matches(optionSelector) ? [root] : [];
                return matchesRoot.concat(Array.from(root.querySelectorAll(optionSelector)));
            })));
            const option = options.find((node) => {
                if (!(node instanceof HTMLElement) || !isVisible(node) || node.closest('nav, aside')) return false;
                const haystacks = [
                    node.textContent,
                    node.getAttribute('aria-label'),
                    node.getAttribute('title'),
                    node.getAttribute('data-testid'),
                ];
                return haystacks.some(matchesLabel);
            });
            if (!(option instanceof HTMLElement)) return { found: false };
            return { found: true, checked: false, x: 1, y: 1 };
        })()\`)), 'chatgpt tool option click');
        if (optionCenter.found) break;
        await page.wait(0.5);
    }
    if (!optionCenter?.found) {
        throw new CommandExecutionError(\`Could not find the ChatGPT \${target.label} tool option.\`);
    }
    if (!optionCenter.checked) {
        await page.nativeClick(Number(optionCenter.x), Number(optionCenter.y));
    }

    await page.wait(0.5);
    const after = await getCurrentChatGPTTool(page);
    if (after.tool !== target.key) {
        throw new CommandExecutionError(\`ChatGPT tool did not switch to \${target.label}.\`);
    }
    return { Status: optionCenter.checked ? 'Already selected' : 'Success', Tool: target.label };
}
`;
}

async function withFakeWebSelectorOpenCli(run, { sourceDrift = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'm006-web-selector-'));
  const installRoot = join(root, 'install');
  const packageRoot = join(installRoot, 'node_modules', '@jackwener', 'opencli');
  const sourcePath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  const executablePath = join(packageRoot, 'dist', 'src', 'main.js');
  const capture = join(root, 'capture.json');
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module' })}\n`);
  await writeFile(sourcePath, pinnedSelectorSource({ sourceDrift }));
  await writeFile(executablePath, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync(new URL('../../clis/chatgpt/utils.js', import.meta.url), 'utf8');
const fixture = ${JSON.stringify(fixture)};
if (process.argv[2] === '--version') {
  console.log('1.8.7');
} else {
  const broadLabels = ['网页搜索', '搜索', 'Web Search', 'Search'];
  const normalized = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const fixed = source.includes("'web-search': { label: 'Web Search', labels: ['网页搜索', 'Web Search'] }")
    && source.includes("const rootSelector = '[role=\\\"group\\\"], [role=\\\"menu\\\"]")
    && source.includes('const exactLabels = labels.map')
    && source.includes('chatgpt Web Search selected chip');
  const selected = fixed
    ? fixture.options.find((option) => ['网页搜索', 'Web Search'].some((label) => normalized(option.primary) === normalized(label)))
    : fixture.options.find((option) => broadLabels.some((label) => normalized(option.text).includes(normalized(label))));
  const selectedChipOk = fixed && normalized(fixture.selected_chip.primary) === normalized('Web Search');
  writeFileSync(${JSON.stringify(capture)}, JSON.stringify({
    args: process.argv.slice(2),
    executable: process.argv[1],
    environment: {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      OPENCLI_CONFIG_DIR: process.env.OPENCLI_CONFIG_DIR,
    },
    selected: selected?.id ?? null,
    selectedChipOk,
  }));
  if (selected?.id !== 'web-search' || !selectedChipOk) {
    console.error('ChatGPT tool did not switch to Web Search.');
    process.exit(4);
  }
  console.log(JSON.stringify([{ conversationId: 'web-selector-1', conversationUrl: 'https://chatgpt.com/c/web-selector-1', tool: 'Web Search', response: '' }]));
}
`, { mode: 0o700 });
  try { return await run({ root, executablePath, sourcePath, capture, fixture }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('current pinned Web Search matching selects the preceding library row', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(pinnedWebCandidate(fixture)?.id, 'library');
});

test('web ask patches only a temporary pinned selector and preserves Browser Bridge routing environment', async () => withFakeWebSelectorOpenCli(async ({ root, executablePath, sourcePath, capture }) => {
  const installedBefore = await readFile(sourcePath, 'utf8');
  const environment = {
    HOME: join(root, 'home'),
    USERPROFILE: join(root, 'userprofile'),
    PATH: process.env.PATH,
    XDG_CONFIG_HOME: join(root, 'xdg'),
    OPENCLI_CONFIG_DIR: join(root, 'config'),
  };
  const identity = await preflightOpenCli({ executablePath, environment });
  const result = await runOpenCliAsk({ executablePath, identity, prompt: 'research this', mode: 'web', timeoutSeconds: 600, environment });
  const observed = JSON.parse(await readFile(capture, 'utf8'));
  assert.equal(result.tool, 'Web Search');
  assert.equal(observed.selected, 'web-search');
  assert.equal(observed.selectedChipOk, true);
  assert.deepEqual(observed.args, ['chatgpt', 'ask', 'research this', '--new', 'true', '--site-session', 'persistent', '--timeout', '600', '--format', 'json', '--wait', 'false', '--web-search', 'true']);
  assert.notEqual(observed.executable, executablePath);
  assert.deepEqual(observed.environment, {
    HOME: environment.HOME,
    USERPROFILE: environment.USERPROFILE,
    XDG_CONFIG_HOME: environment.XDG_CONFIG_HOME,
    OPENCLI_CONFIG_DIR: environment.OPENCLI_CONFIG_DIR,
  });
  assert.deepEqual(await readFile(sourcePath, 'utf8'), installedBefore);
}));

test('web ask fails closed before execution when the pinned selector source drifts', async () => withFakeWebSelectorOpenCli(async ({ executablePath, capture }) => {
  const identity = await preflightOpenCli({ executablePath });
  await assert.rejects(runOpenCliAsk({ executablePath, identity, prompt: 'research this', mode: 'web', timeoutSeconds: 600 }), { code: 'ERR_OPENCLI_WEB_COMPAT' });
  await assert.rejects(readFile(capture), { code: 'ENOENT' });
}, { sourceDrift: true }));
