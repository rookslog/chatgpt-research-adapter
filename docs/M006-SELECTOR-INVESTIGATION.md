# M006 — ChatGPT Selector Compatibility Investigation

- Branch: `m006/selector-compatibility`
- Base: integrated `main` `adf8d6c4c682a5c23fc54965920d2f862878f51e`
- Issues: #2 Web Search selector compatibility; #3 Deep Research selector compatibility
- Status: root-cause investigation; no production selector change yet
- Method: Superpowers systematic debugging — reproduce/localize before fixing

This document records source facts, prior live observations, test-coverage gaps, and the evidence still required from the current ChatGPT UI. It does **not** claim that either selector root cause is established yet.

## 1. Frozen upstream source

The wrapper pins `@jackwener/opencli` v1.8.7. GitHub tag `v1.8.7` resolves to commit `87b60a36590c3e2a466c37266c3348d73d7f68fe` (release commit dated 2026-08-23).

At this investigation cutoff, upstream `jackwener/OpenCLI` `main` is `90d507091cbec9d01334a0d0a8c784c522d490f3` (2026-08-26). `main` is 37 commits ahead of v1.8.7, but the compare contains no `clis/chatgpt/*` changes.

The relevant files are byte-identical between v1.8.7 and current upstream `main`:

- `clis/chatgpt/ask.js` blob `7d615f3b5993ddaac0ea895fc0e100d27f35d401`
- `clis/chatgpt/utils.js` blob `ab19a98463deaa01cec9d68e904de51610015098`

Therefore an upgrade from released v1.8.7 to current upstream `main` would not change the ChatGPT selector implementation. This is a source observation, not a claim about future upstream changes.

## 2. Wrapper execution boundary

`runOpenCliAsk()` maps the wrapper modes to the pinned OpenCLI command:

- `standard` → no tool flag
- `web` → `--web-search true`
- `deep` → `--deep-research true`

It executes the preflighted OpenCLI `identity.real_path` directly. The temporary copied-package compatibility mechanism introduced for #4 is currently used only by `runOpenCliDetail()` for Markdown conversion; it does not alter `chatgpt ask` or selector behavior.

OpenCLI `chatgpt ask` calls `selectChatGPTTool()` before generation-state checks, baseline message capture, `sendChatGPTMessage()`, and conversation creation. Selector errors at this stage are therefore pre-submission failures in this call path.

## 3. Exact selector state machine in v1.8.7/current main

For an explicitly requested tool, `selectChatGPTTool()` performs:

1. validate the requested tool and require native click support;
2. ensure ChatGPT and the composer are visible;
3. call `getCurrentChatGPTTool()` and return early only if the requested tool is already recognized;
4. locate exactly `button[data-testid="composer-plus-btn"]`;
5. native-click the plus button and wait 0.5 s;
6. poll up to 10 times for a matching tool option, waiting 0.5 s between unsuccessful polls;
7. search visible non-nav/non-aside menu/popover roots, falling back to the whole document only when no recognized root is visible;
8. consider as options only `[role="menuitemradio"]`, `[role="menuitem"]`, `[role="option"]`, `button`, or `div[tabindex="0"]`;
9. match the target against option `textContent`, `aria-label`, `title`, or `data-testid` using normalized/compacted labels;
10. if the option is not `aria-checked=true` or `aria-selected=true`, native-click its center;
11. wait 0.5 s, then call `getCurrentChatGPTTool()`;
12. fail unless the requested tool is recognized as the postcondition.

Known target labels are:

- Deep Research: `深度研究`, `Deep Research`
- Web Search: `网页搜索`, `搜索`, `Web Search`, `Search`

`getCurrentChatGPTTool()` searches the first visible `<form>` when one exists, otherwise `document.body`. Within that root it scans buttons, button/menu/option roles, spans, `div[tabindex="0"]`, and generic divs. It rejects candidates inside the editable composer unless the candidate has a `[contenteditable="false"]` ancestor, then recognizes a tool from `textContent`, `aria-label`, `title`, or `data-testid`.

## 4. Prior live failures and what they actually localize

### #2 — Web Search

Prior bounded live observation:

`ChatGPT tool did not switch to Web Search.`

That exact error is emitted only after:

- the composer was available;
- the exact `composer-plus-btn` was found and clicked;
- a candidate matching the Web Search labels was discovered;
- the code either clicked that candidate when it was not marked checked/selected, or skipped the click if the candidate already advertised checked/selected state;
- the 0.5 s post-selection wait completed;
- `getCurrentChatGPTTool()` failed to recognize Web Search as selected.

This localizes #2 to the **option-action/postcondition boundary**, but does not yet distinguish among a wrong click target, an already-selected false positive, asynchronous state change, changed selected-tool representation, or another postcondition mismatch.

### #3 — Deep Research

Prior bounded live observation:

`Could not find the ChatGPT Deep Research tool option.`

That exact error is emitted only after:

- the composer was available;
- the exact `composer-plus-btn` was found and clicked;
- all option-discovery polls completed without a recognized Deep Research candidate.

This localizes #3 to **option discovery after the tools menu is opened**. It does not establish whether Deep Research was absent from the account/UI, nested behind another control, rendered outside the recognized roots/option element types, labeled differently, or present but not visible to the current matcher.

Neither observed selector error is evidence that a research prompt was submitted; in the pinned `ask.js` call order, submission occurs later.

## 5. Upstream deterministic coverage gap

OpenCLI v1.8.7/current main has deterministic tests for `getCurrentChatGPTTool()` recognizing simple visible labels such as `Deep Research`, `Web Search`, `网页搜索`, and `搜索` inside a form.

However, the `selectChatGPTTool()` validation block tests only:

- rejection of unknown tool names; and
- rejection when native browser click support is unavailable.

There is no upstream DOM-fixture test exercising:

- tools-menu opening;
- current custom menu/popover markup;
- Web Search option discovery/clicking;
- Deep Research option discovery;
- nested tool-menu structure;
- checked/selected option behavior;
- selected-tool pill recognition after the click;
- false-positive resistance when unrelated composer/menu text contains `Search` or `Deep Research`.

This means the current selector can remain green upstream while failing against current ChatGPT UI structure.

## 6. Evidence required before a fix

The next root-cause input is a sanitized, no-submission structural capture from the current ChatGPT UI. Capture only selector-relevant structure for:

- composer and plus/tools button;
- opened tools menu/popover;
- Web Search candidate;
- Deep Research candidate or the structure where it would be expected;
- any submenu involved;
- post-Web-Search selected state/pill/chip.

Useful fields are tag, role, `data-testid`, `aria-*`, title, selected-state attributes, normalized visible label, and parent/child/menu relationships.

Do not collect cookies, tokens, auth headers, browser storage, account identifiers, unrelated conversation content, or unrelated network traffic.

## 7. Root-cause questions to answer with that capture

For #2:

1. Which exact candidate does the current matcher select as `Web Search`?
2. Is that candidate itself actionable, or is the actual click target an ancestor/descendant?
3. Does it advertise `aria-checked`/`aria-selected` before the action?
4. Where and how is selected Web Search represented afterward?
5. Is that representation inside the first visible form, outside it, or inside editable-composer structure excluded by `getCurrentChatGPTTool()`?
6. Does selection require more than the fixed 0.5 s post-click wait?

For #3:

1. Is Deep Research present after the plus menu opens?
2. If present, is it in the first menu/popover or behind a submenu/category control?
3. What element is actually actionable?
4. Does its label still match `Deep Research`/`深度研究`, or is the accessible/visible name different?
5. Is the relevant root or option element outside the current selector families?
6. If absent, is that stable product/account state rather than selector drift?

## 8. Implementation decision deferred

Do not choose a selector patch until the sanitized current-UI fixture reproduces the live failures for the same causal reason.

If both failures reduce to one shared recognition/action seam, keep #2/#3 in one selector-compatibility PR. If the fixture shows materially independent causes, share fixture/helper infrastructure but split the fixes so each acceptance criterion has a causal regression test.

Any wrapper-local compatibility patch should preserve:

- typed `standard | web | deep` exclusivity;
- proof of requested tool selection before prompt submission;
- exactly-once/no-auto-retry semantics;
- unchanged standard mode;
- no arbitrary browser-control exposure;
- the pinned OpenCLI identity and existing residual-risk disclosures.

The existing #4 copied-package mechanism demonstrates one possible compatibility-patching seam, but selecting that architecture for ask/tool behavior is deferred until root cause is established.
