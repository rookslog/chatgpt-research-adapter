# M006 — Exact External-Chrome No-Submit Selector Probe

- Issues: #2 Web Search; #3 Deep Research
- Provider submissions: **zero**
- Production source changes: **zero**
- Target: exact installed OpenCLI v1.8.7 ChatGPT selector running through Browser Bridge `surface=adapter`, `siteSession=persistent`
- Purpose: determine whether the historical selector failures still reproduce on the external Chrome path and, only on failure, gather the minimum sanitized evidence needed for root cause

This probe does not call `chatgpt ask`, does not type a prompt, and does not call `sendChatGPTMessage()`. It imports the exact installed `selectChatGPTTool()` function and invokes only tool selection on a blank `/new` composer.

Do not use Codex's in-app browser for this probe. The evidence must come from the normal Chrome profile connected to the installed OpenCLI Browser Bridge.

## Preconditions

```bash
OPENCLI="$PWD/.runtime/opencli/node_modules/.bin/opencli"
"$OPENCLI" --version
"$OPENCLI" doctor --verbose
```

Require exact OpenCLI `1.8.7` and a healthy Browser Bridge/profile. Do not read or record cookies, auth/session tokens, headers, storage, account identity, conversation text, or unrelated network traffic.

## Temporary probe

Write the following script under `.runtime/` or another non-repository temporary location. Do not commit it as production code.

```js
import { realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const executable = process.env.OPENCLI;
if (!executable) throw new Error('OPENCLI is required');
const targetArg = process.argv[2];
if (!['web-search', 'deep-research'].includes(targetArg)) {
  throw new Error('usage: node selector-probe.mjs web-search|deep-research');
}

const realExecutable = await realpath(executable);
const packageRoot = dirname(dirname(dirname(realExecutable)));
const browserModule = await import(pathToFileURL(join(packageRoot, 'dist/src/browser/index.js')).href);
const chatgptUtils = await import(pathToFileURL(join(packageRoot, 'clis/chatgpt/utils.js')).href);
const { BrowserBridge } = browserModule;
const { selectChatGPTTool, getCurrentChatGPTTool } = chatgptUtils;

const label = targetArg === 'web-search' ? 'Web Search' : 'Deep Research';
const session = `m006-selector-${targetArg}-${Date.now()}`;
const bridge = new BrowserBridge();
const page = await bridge.connect({
  session,
  surface: 'adapter',
  siteSession: 'persistent',
  windowMode: 'foreground',
});

const sanitize = async () => page.evaluate(`(() => {
  const visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const compact = (value) => clean(value).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '');
  const labels = ['Web Search', 'Web search', 'Search', 'Deep Research', 'Deep research', '网页搜索', '搜索', '深度研究'];
  const isToolText = (value) => {
    const text = clean(value).toLowerCase();
    const compacted = compact(value);
    return labels.some((label) => {
      const wanted = clean(label).toLowerCase();
      const wantedCompact = compact(label);
      return text === wanted || text.includes(wanted) || (wantedCompact && compacted.includes(wantedCompact));
    });
  };
  const summary = (el) => {
    if (!(el instanceof HTMLElement)) return null;
    const text = clean(el.textContent);
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      tabindex: el.getAttribute('tabindex'),
      testid: el.getAttribute('data-testid'),
      aria_label: el.getAttribute('aria-label'),
      aria_checked: el.getAttribute('aria-checked'),
      aria_selected: el.getAttribute('aria-selected'),
      aria_expanded: el.getAttribute('aria-expanded'),
      data_state: el.getAttribute('data-state'),
      contenteditable: el.getAttribute('contenteditable'),
      tool_text: isToolText(text) ? text.slice(0, 160) : null,
    };
  };
  const rootSelector = '[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-radix-menu-content], [data-testid*="menu"], [data-testid*="popover"]';
  const optionSelector = '[role="menuitemradio"], [role="menuitem"], [role="option"], button, div[tabindex="0"]';
  const preferredRoots = Array.from(document.querySelectorAll(rootSelector))
    .filter((node) => node instanceof HTMLElement && visible(node) && !node.closest('nav, aside'));
  const roleGroups = Array.from(document.querySelectorAll('[role="group"]'))
    .filter((node) => node instanceof HTMLElement && visible(node) && isToolText(node.textContent));
  const matchingOptions = Array.from(document.querySelectorAll(optionSelector))
    .filter((node) => node instanceof HTMLElement && visible(node) && !node.closest('nav, aside') && isToolText(node.textContent));
  const chips = Array.from(document.querySelectorAll('[contenteditable="false"]'))
    .filter((node) => node instanceof HTMLElement && visible(node) && isToolText(node.textContent));
  const composer = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"]');
  return {
    url_path: location.pathname,
    plus: summary(document.querySelector('[data-testid="composer-plus-btn"]')),
    preferred_roots: preferredRoots.map((node, index) => ({
      index,
      node: summary(node),
      contains_tool_group: roleGroups.some((group) => node.contains(group)),
      contains_matching_option: matchingOptions.some((option) => node.contains(option)),
    })),
    role_groups: roleGroups.map(summary),
    matching_options: matchingOptions.map((node) => ({
      node: summary(node),
      preferred_root_index: preferredRoots.findIndex((root) => root.contains(node)),
    })),
    selected_chips: chips.map(summary),
    composer_blank: composer instanceof HTMLElement ? clean(composer.textContent) === '' : null,
    message_nodes: document.querySelectorAll('[data-message-author-role], article[data-testid*="conversation-turn"]').length,
  };
})()`);

try {
  await page.goto('https://chatgpt.com/new', { settleMs: 2000 });
  const before = await sanitize();
  if (before.message_nodes !== 0 || before.composer_blank !== true) {
    throw new Error('probe requires a blank unsent composer');
  }

  let result = null;
  let error = null;
  try {
    result = await selectChatGPTTool(page, targetArg);
  } catch (caught) {
    error = {
      name: caught?.name ?? null,
      code: caught?.code ?? null,
      message: caught?.message ?? String(caught),
    };
  }

  const afterTool = await getCurrentChatGPTTool(page).catch(() => ({ tool: null, label: null }));
  const after = await sanitize();
  console.log(JSON.stringify({
    schema: 'm006.selector-exact-nosubmit.v1',
    target: targetArg,
    label,
    opencli_real_executable: realExecutable,
    result,
    error,
    after_tool: afterTool,
    before,
    after,
    provider_submission: false,
  }, null, 2));
} finally {
  await bridge.close();
}
```

Run once for each target from a clean blank composer:

```bash
OPENCLI="$OPENCLI" node .runtime/selector-probe.mjs web-search \
  > .runtime/m006-selector-web-exact.json

OPENCLI="$OPENCLI" node .runtime/selector-probe.mjs deep-research \
  > .runtime/m006-selector-deep-exact.json
```

Do not automatically rerun a failed target. Preserve the first exact result before any instrumented follow-up.

## Interpretation gate

### If both exact selectors succeed

Record that the historical failures are **currently unreproducible on the exact pinned external-Chrome selector path**. Do not invent a failing fixture or selector patch. The next decision becomes whether to request separate approval for one live web smoke and one live deep smoke to qualify current capability and disposition #2/#3.

### If Web Search fails with the historical postcondition

Preserve the output. Then perform one explicitly recorded instrumented no-submit follow-up that captures, immediately before the option native click:

- which candidate the exact matcher selected;
- candidate rectangle;
- `document.elementFromPoint(centerX, centerY)` relationship to that candidate;
- all visible preferred roots and whether they contain the real `role=group` tools surface;
- selected chip appearance after the native click and elapsed time.

Do not patch until that evidence identifies a causal failing condition and a current-UI red fixture can represent it.

### If Deep Research fails with the historical option-discovery error

Preserve the output. Inspect the still-open menu with a read-only `browser eval`/`find` or equivalent sanitized evaluation and determine:

- all visible preferred roots selected by the exact `rootSelector`;
- whether the `role=group` containing Deep Research is inside any preferred root;
- whether Deep Research exists elsewhere in the document;
- whether the current label/option shape still matches the installed target contract.

The specific root-scoping hypothesis is supported only if a nonempty unrelated preferred-root set suppresses document fallback while the real Deep Research option exists outside those roots.

## Security/evidence boundary

Never record cookies, tokens, authorization headers, storage, account identity, challenge/MFA material, arbitrary page HTML, unrelated conversation text, or network traffic. The probe output is intentionally limited to selector structure, path, result/error, and zero-message/blank-composer checks.

A successful no-submit selector probe is evidence only for tool selection on that configuration. It is not a provider-mode reliability estimate and does not satisfy the approval-gated web/deep live-smoke criteria by itself.
