# M006 — Selector Capture Analysis

- Issues: #2 Web Search; #3 Deep Research
- Source branch: `m006/selector-compatibility`
- Production selector changes: none
- Current evidence source: sanitized no-submit capture recorded on PR #9 at commit `96acc8d28c084c0f0a182129cbdd7fc835082ef4`
- Epistemic status: root-cause investigation; hypotheses below are not fixes

## 1. What the current capture rules out

The 2026-08-26/27 no-submit ChatGPT observation found:

- the plus/tools control is still `button[data-testid="composer-plus-btn"]`;
- the opened tool surface itself is a `div[role="group"]`;
- Web Search is a same-level `div[tabindex="0"]` whose text content includes `Web search`;
- Deep Research is a same-level `div[tabindex="0"]` whose text content includes `Deep research`;
- no nested submenu was observed;
- selected Web Search and Deep Research are represented by inline `span[contenteditable="false"]` chips inside the contenteditable composer.

Those shapes are structurally compatible with the exact OpenCLI v1.8.7/current-main implementation:

- option discovery includes `div[tabindex="0"]`;
- English matching is case-insensitive/normalized;
- if no preferred menu/popover root exists, discovery falls back to the document;
- selected-state detection allows a label-bearing node inside a nearest `[contenteditable="false"]` pill even when that pill is inside the editable composer.

The current in-app-browser capture therefore does **not** reproduce either historical selector failure. It does not satisfy #2/#3's required pre-fix reproduction fixture and cannot justify a production patch by itself.

## 2. Why the historical errors remain informative

The exact v1.8.7 error stages still constrain the search.

### Web Search

Historical error: `ChatGPT tool did not switch to Web Search.`

The selector had already returned a candidate from option discovery. Either it considered that candidate already selected or it issued a native coordinate click, then its postcondition did not recognize Web Search.

### Deep Research

Historical error: `Could not find the ChatGPT Deep Research tool option.`

The selector opened the tools control, then exhausted option-discovery polling without returning a Deep Research candidate.

Because `sendChatGPTMessage()` occurs later in `ask.js`, both failures are pre-submission selector failures.

## 3. Shared root-scoping hypothesis worth falsifying

`selectChatGPTTool()` does **not** always search the document. It first collects visible roots matching:

- `[role="menu"]`
- `[role="listbox"]`
- Radix popper/menu wrappers
- test IDs containing `menu` or `popover`

and searches the whole document only when that preferred-root set is empty.

The observed current tool surface is only `role="group"`, so it is not itself a preferred root.

This creates a specific failure possibility in the external Chrome runtime:

1. the correct `role=group` tools surface is visible;
2. some *other* visible preferred menu/popover root also exists outside `nav`/`aside`;
3. `visibleRoots.length > 0`, so document fallback is suppressed;
4. the real tool options are outside every chosen root.

That condition would naturally explain a Deep Research discovery miss.

It could also explain the different Web Search error if an unrelated chosen root contains an element matching the deliberately broad Web Search alias `Search`: OpenCLI could return that unrelated candidate, click or treat it as selected, and then fail the selected-tool postcondition.

This is a **single falsifiable hypothesis**, not an established root cause. The in-app capture reported zero preferred-root matches, so the condition was absent there. It must be tested against the external Chrome/Browser Bridge runtime that produced the historical errors.

## 4. Native coordinate-click hypothesis worth falsifying

The ChatGPT selector does not use OpenCLI's newer general `page.click()` resolver. It:

1. evaluates JavaScript to scroll an element into view and compute the center of its bounding rectangle;
2. returns the coordinates across the bridge;
3. separately invokes `page.nativeClick(x, y)`.

The general OpenCLI click path contains additional hit-testing/retargeting logic because a center point can land on an overlay, ancestor, or wrong descendant. `selectChatGPTTool()` bypasses those safeguards.

This is relevant primarily to #2, where option discovery succeeded but the postcondition failed. A moving/animated menu, overlay, or wrong center target between measurement and native click could produce that symptom.

It does not by itself explain #3's pre-click discovery miss, so it is not a complete shared explanation.

## 5. Timing/UI-variant hypotheses still open

The evidence also leaves open:

- external persistent Chrome receiving a different ChatGPT experiment/DOM from Codex's in-app browser;
- a transient menu portal/root during the v1.8.7 polling window;
- ChatGPT changing between the historical M004 failures and the later capture;
- unrelated label-bearing controls producing a Web Search false positive under document fallback;
- the external Browser Bridge's native click targeting behaving differently from manual in-app clicks.

Do not collapse these into "selector drift" without a reproducing external-runtime observation.

## 6. Next discriminating diagnostic

Before modifying production code, observe the **external Chrome runtime used by OpenCLI** at the selector boundary and record, without prompt submission:

1. after the plus click, every visible preferred root used by the current `rootSelector`, with a short sanitized identity (tag, role, data-testid, aria-label);
2. whether the observed `role=group` tool container is inside any of those roots;
3. every option candidate the exact v1.8.7 matcher would consider for Web Search and Deep Research, including which root supplied it;
4. for a candidate center point, `document.elementFromPoint(x, y)` and whether the hit is the candidate, a descendant/ancestor, or unrelated node;
5. after a native Web Search click, the selected-chip shape and elapsed time until it appears;
6. no message submission and no unrelated DOM/account/session data.

A useful receipt should distinguish:

`preferred-root selection -> candidate selection -> coordinate/hit target -> native click -> selected-chip postcondition`

If the historical error is no longer reproducible on the exact external Chrome/OpenCLI path, do not fabricate a failing fixture. Record the issue premise as stale/currently unreproducible and decide whether a no-code live capability requalification is the correct disposition.

## 7. Current implementation decision

No selector patch is justified yet.

The current observed DOM already fits the shipped selector, while issues #2/#3 explicitly require a **current-UI fixture that reproduces the failure before the fix**. The next evidence should therefore come from the exact external Chrome path, not from inventing a DOM difference merely to make a red test.
