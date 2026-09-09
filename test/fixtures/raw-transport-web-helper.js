// Local process-boundary fixture only; no browser, provider, or Standard qualification.
// Pinned selector fixture copied from opencli-web-selector-compat.test.js.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

export async function withRawTransportWebFixture(run, { body = 'console.log(JSON.stringify([row]));' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'raw-transport-local-'));
  const packageRoot = join(root, 'node_modules', '@jackwener', 'opencli');
  const path = join(packageRoot, 'dist', 'src', 'main.js');
  const capture = join(root, 'calls.jsonl');
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module' }));
  await writeFile(join(packageRoot, 'clis', 'chatgpt', 'utils.js'), pinnedSelectorSource());
  await writeFile(path, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else {
  appendFileSync(${JSON.stringify(capture)}, JSON.stringify({ args: process.argv.slice(2), environment: process.env }) + '\\n');
  const tool = process.argv.includes('--web-search') ? 'Web Search' : process.argv.includes('--deep-research') ? 'Deep Research' : '';
  const row = { conversationId: 'local-transport-1', conversationUrl: 'https://chatgpt.com/c/local-transport-1', tool, response: 'local fixture answer' };
  ${body}
}
`, { mode: 0o700 });
  try { return await run({ root, path, capture }); }
  finally { await rm(root, { recursive: true, force: true }); }
}
