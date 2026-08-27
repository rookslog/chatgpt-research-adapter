import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { preflightOpenCli, runOpenCliAsk } from '../src/opencli-transport.js';

function pinnedSelectorSource() {
  return `class CommandExecutionError extends Error {}
const CHATGPT_TOOL_OPTIONS = {
    'deep-research': { label: 'Deep Research', labels: ['深度研究', 'Deep Research'] },
    'web-search': { label: 'Web Search', labels: ['网页搜索', '搜索', 'Web Search', 'Search'] },
};
function requireKnownChatGPTTool(tool) { return CHATGPT_TOOL_OPTIONS[tool]; }
async function ensureOnChatGPT() {}
async function ensureChatGPTComposer() {}
function unwrapEvaluateResult(value) { return value; }
function requireObjectEvaluateResult(value) { return value; }
function requireBooleanEvaluateResult(value) { return value; }
async function getCurrentChatGPTTool(page) { return { tool: page.selectedTool ?? null }; }

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
    if (!menuButton.found) {
        throw new CommandExecutionError('Could not find the ChatGPT tools menu button in the composer.');
    }
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
            const rootSelector = '[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-radix-menu-content], [data-testid*="menu"], [data-testid*="popover"]';
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
            return { found: true, checked: false, x: 2, y: 2 };
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

async function withActivationOpenCli(scenario, run) {
  const root = await mkdtemp(join(tmpdir(), 'm006-tool-activation-'));
  const packageRoot = join(root, 'node_modules', '@jackwener', 'opencli');
  const sourcePath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  const executablePath = join(packageRoot, 'dist', 'src', 'main.js');
  const capturePath = join(root, 'capture.json');
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module' })}\n`);
  await writeFile(sourcePath, pinnedSelectorSource());
  await writeFile(executablePath, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { selectChatGPTTool } from '../../clis/chatgpt/utils.js';
const scenario = ${JSON.stringify(scenario)};
const capturePath = ${JSON.stringify(capturePath)};
if (process.argv[2] === '--version') {
  console.log('1.8.7');
  process.exit(0);
}
const isWeb = process.argv.includes('--web-search');
const isDeep = process.argv.includes('--deep-research');
const targetKey = isWeb ? 'web-search' : (isDeep ? 'deep-research' : null);
const targetLabel = targetKey === 'web-search' ? 'Web Search' : 'Deep Research';
const state = { menuOpen: false, menuChecks: 0, menuOpenedAtCheck: 0, selectedTool: null, selectedChecks: 0, selectedAtCheck: 0, nativeMenuClicks: 0, nativeOptionClicks: 0, domMenuClicks: 0, domOptionClicks: 0 };
const openMenu = () => { state.menuOpen = true; state.menuOpenedAtCheck = state.menuChecks; };
const selectTool = () => { state.selectedTool = targetKey; state.selectedAtCheck = state.selectedChecks; };
const page = {
  get selectedTool() { return state.selectedTool; },
  async nativeClick(x) {
    if (x === 1) {
      state.nativeMenuClicks += 1;
      if (scenario.menuNativeWorks) openMenu();
      return;
    }
    state.nativeOptionClicks += 1;
    if (scenario.optionNativeDismissesMenu) state.menuOpen = false;
    if (scenario.optionNativeWorks) selectTool();
  },
  async wait() {},
  async evaluate(code) {
    const text = String(code);
    if (text.includes('.click()') && text.includes('composer-plus-btn')) {
      state.domMenuClicks += 1;
      if (state.menuOpen) state.menuOpen = false;
      else openMenu();
      return true;
    }
    if (text.includes('.click()') && (text.includes('menuitemradio') || text.includes('tabindex'))) {
      if (!state.menuOpen) return false;
      state.domOptionClicks += 1;
      selectTool();
      return true;
    }
    if (text.includes('composer-plus-btn') && text.includes('aria-expanded')) {
      state.menuChecks += 1;
      const scopedToHitTarget = text.includes('document.elementFromPoint');
      if (scenario.hiddenExpandedPlus && !scopedToHitTarget) return true;
      if (!state.menuOpen) return false;
      return (state.menuChecks - state.menuOpenedAtCheck) > (scenario.menuVisibleAfterChecks ?? 0);
    }
    if (text.includes('const optionSelector')) return state.menuOpen ? { found: true, checked: state.selectedTool === targetKey, x: 2, y: 2 } : { found: false };
    if (text.includes('[contenteditable="false"]')) {
      state.selectedChecks += 1;
      const visibilityAware = text.includes('const composers =') && text.includes('isVisible');
      const visibleAfter = scenario.selectedVisibleAfterChecks ?? 0;
      const selectedVisible = state.selectedTool === targetKey && (state.selectedChecks - state.selectedAtCheck) > visibleAfter;
      return { selected: selectedVisible && (!scenario.hiddenComposerFirst || visibilityAware) };
    }
    return false;
  },
};
try {
  const selected = targetKey ? await selectChatGPTTool(page, targetKey) : { Status: 'Standard', Tool: '' };
  writeFileSync(capturePath, JSON.stringify({ ok: true, state, selected }));
  console.log(JSON.stringify([{ conversationId: 'activation-test-1', conversationUrl: 'https://chatgpt.com/c/activation-test-1', tool: targetKey ? targetLabel : '', response: '' }]));
} catch (error) {
  writeFileSync(capturePath, JSON.stringify({ ok: false, state, error: error?.message ?? String(error) }));
  console.error(error?.message ?? String(error));
  process.exit(4);
}
`, { mode: 0o700 });
  try { return await run({ root, executablePath, sourcePath, capturePath }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

async function runScenario(mode, scenario) {
  return withActivationOpenCli(scenario, async ({ executablePath, capturePath }) => {
    const identity = await preflightOpenCli({ executablePath });
    const result = await runOpenCliAsk({ executablePath, identity, prompt: 'activation test', mode, timeoutSeconds: 600 });
    const capture = JSON.parse(await readFile(capturePath, 'utf8'));
    return { result, capture };
  });
}

test('tool selector falls back once when the native tools-menu click is behaviorally inert', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: false, optionNativeWorks: true });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.nativeMenuClicks, 1);
  assert.equal(capture.state.domMenuClicks, 1);
  assert.equal(capture.state.domOptionClicks, 0);
});

test('Web Search falls back once when the exact option native click is behaviorally inert', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: true, optionNativeWorks: false });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.domMenuClicks, 0);
  assert.equal(capture.state.nativeOptionClicks, 1);
  assert.equal(capture.state.domOptionClicks, 1);
});

test('Deep Research uses the same bounded fallback when its exact option native click is behaviorally inert', async () => {
  const { result, capture } = await runScenario('deep', { menuNativeWorks: true, optionNativeWorks: false });
  assert.equal(result.tool, 'Deep Research');
  assert.equal(capture.state.domMenuClicks, 0);
  assert.equal(capture.state.nativeOptionClicks, 1);
  assert.equal(capture.state.domOptionClicks, 1);
});

test('successful native tool activation does not invoke the DOM fallback', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: true, optionNativeWorks: true });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.domMenuClicks, 0);
  assert.equal(capture.state.domOptionClicks, 0);
});

test('slow native menu render does not toggle an already-open tools menu with the DOM fallback', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: true, optionNativeWorks: true, menuVisibleAfterChecks: 1 });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.nativeMenuClicks, 1);
  assert.equal(capture.state.domMenuClicks, 0);
});

test('selected-state verification ignores hidden stale composers before the active composer', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: true, optionNativeWorks: true, hiddenComposerFirst: true });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.nativeOptionClicks, 1);
  assert.equal(capture.state.domOptionClicks, 0);
});

test('slow DOM-fallback menu render is polled before selector failure', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: false, optionNativeWorks: true, menuVisibleAfterChecks: 1 });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.nativeMenuClicks, 1);
  assert.equal(capture.state.domMenuClicks, 1);
});

test('hidden stale expanded plus button does not suppress fallback for the active composer', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: false, optionNativeWorks: true, hiddenExpandedPlus: true });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.nativeMenuClicks, 1);
  assert.equal(capture.state.domMenuClicks, 1);
});

test('slow native selected-chip render is polled before issuing an option fallback', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: true, optionNativeWorks: true, selectedVisibleAfterChecks: 1 });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.nativeOptionClicks, 1);
  assert.equal(capture.state.domOptionClicks, 0);
});

test('slow DOM-fallback selected-chip render is polled before selector failure', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: true, optionNativeWorks: false, selectedVisibleAfterChecks: 1 });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.nativeOptionClicks, 1);
  assert.equal(capture.state.domOptionClicks, 1);
});

test('dismissed menu is reopened and exact option is resolved again before DOM fallback', async () => {
  const { result, capture } = await runScenario('web', { menuNativeWorks: true, optionNativeWorks: false, optionNativeDismissesMenu: true });
  assert.equal(result.tool, 'Web Search');
  assert.equal(capture.state.nativeOptionClicks, 1);
  assert.ok(capture.state.nativeMenuClicks >= 2 || capture.state.domMenuClicks >= 1);
  assert.equal(capture.state.domOptionClicks, 1);
});
