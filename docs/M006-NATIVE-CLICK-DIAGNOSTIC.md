# M006 ChatGPT tool-activation diagnostic

Status: diagnostic / intervention plan only. No production change is authorized by this document.

## 1. Verified repository state

Evidence cutoff: 2026-08-27 after PR #10 merge.

- `main`: `87cc9325135b88885bf876b7f48e2379df04d84b`
- PR #10 (`fix: restore forced Web Search selection`) is merged into that commit.
- Post-merge GitHub Actions run `33048664086` succeeded.
- Issue #2 (Web Search selector compatibility) is open.
- Issue #3 (Deep Research selector compatibility) is open.

The merged adapter retains OpenCLI v1.8.7 and, for forced Web mode, copies the pinned OpenCLI package into a temporary workspace and patches `clis/chatgpt/utils.js`. PR #10 corrected Web label/root matching and the Web selected-chip postcondition without mutating the installed package.

## 2. Local-runtime evidence provenance

The observations below are from a bounded local diagnostic performed against the exact external-Chrome path. They are **not GitHub-hosted artifacts** and are not reliability estimates.

Runtime identity reported by the local diagnostic:

- OpenCLI: exact installed v1.8.7
- executable: `.runtime/opencli/node_modules/@jackwener/opencli/dist/src/main.js`
- executable SHA-256: `246004200e381e5aecdfaef13e904953c0d18e0600ca66d02b956c4b1820ec02`
- Browser Bridge extension: v1.0.23
- browser path: external Chrome, `surface=adapter`, `siteSession=persistent`
- provider submissions: zero
- production edits: zero
- tracked worktree changes: zero

Local ignored evidence files and reported SHA-256 values:

- `.runtime/m006-web-diagnostic/patched-path-result.json` — `c3c2417f97ffe09377bcd95aa3a58faca26870bbf202d9f3fbb723a2ae69f2d7`
- `.runtime/m006-web-diagnostic/menu-structure-result.json` — `b43b157c39912a44629b13c916286317634c45b1e770e5dbd7c264a891eb1813`
- `.runtime/m006-web-diagnostic/activation-comparison-result.json` — `92df2463ee70b2bfad8a82062742f24b0e53d87141d7be267fb62f6039fec498`
- `.runtime/m006-web-diagnostic/composer-matrix-result.json` — `9299593f0f56c4473e8120faa3c326c1e9612cc99b8f0fa9d687a53ee53356cc`
- `.runtime/m006-web-diagnostic/final-cleanup-result.json` — `f1a371eba700f5a699bed31766688b2c6c1e633fc54b927a09d613ab4cf7ddeb`

All child/outer records reportedly declare `provider_submission=false`; diagnostic stderr logs were empty.

## 3. Direct local observations

### 3.1 Exact patched selector path

The diagnostic exercised the adapter's actual temporary-copy Web compatibility path, imported the copied v1.8.7 `selectChatGPTTool()` directly, and did not import or invoke a send function.

From a blank `/new` composer:

- `selectChatGPTTool(page, "web-search")` failed with `Could not find the ChatGPT Web Search tool option.`
- `selectChatGPTTool(page, "deep-research")` failed with `Could not find the ChatGPT Deep Research tool option.`
- no conversation was created and no prompt was submitted.

### 3.2 Failure is before label/root matching

For the plus/tools control, the selector-computed click point hit-tested to the intended element:

- `button`
- `data-testid="composer-plus-btn"`
- `aria-label="Add files and more"`

After `page.nativeClick()`:

- `aria-expanded` remained `false`;
- no menu/preferred root appeared.

A bounded DOM `button.click()` comparison on the same control immediately produced:

- `aria-expanded="true"`;
- three visible `role="group"` roots;
- the actual tools group at preferred-root index 2;
- exact Web Search and Deep Research rows as `div[tabindex="0"]`;
- both rows inside the merged preferred-root matcher.

Thus current label/root discovery cannot run after the inert native plus click because the tool surface never opens.

### 3.3 Native option click is also inert

With the tools surface opened by the bounded DOM setup:

- the exact Web Search candidate's center hit-tested to that row/a descendant;
- `page.nativeClick()` did not close the menu or create the Web Search chip;
- bounded DOM activation of that row did create the expected chip.

After Web Search had been selected through DOM setup, the exact patched selector returned `Already selected / Web Search`, corroborating the selected-tool detection path once activation has actually occurred.

### 3.4 Composer state

The diagnostic also observed:

- an empty standard composer was correctly recognized as having no selected tool;
- preselected Web was correctly recognized as already selected;
- a synthetic unsent draft was neither erased nor submitted by the failed selector;
- final state was `/new`, zero message nodes, empty composer, zero provider submissions.

One Deep setup made a non-chip text heuristic report nonblank; the diagnostic deliberately did not inspect or retain that text. The composer was subsequently cleared through a sanitized cleanup.

## 4. Source-level triangulation

### 4.1 OpenCLI ChatGPT selector

Current OpenCLI `clis/chatgpt/utils.js` still requires `page.nativeClick` for `selectChatGPTTool()`. It uses raw coordinate `page.nativeClick()` first on the tools-menu control and then on the selected tool row. If the menu does not appear, option discovery eventually emits `Could not find the ChatGPT <tool> tool option.`

This matches the local failure stage.

### 4.2 Generic OpenCLI `page.click()` is not yet a proven replacement

Current OpenCLI `BasePage.click()` is more sophisticated than the ChatGPT helper: it resolves and hit-tests the target, attempts the native CDP click, and has a JavaScript `el.click()` fallback. However, `tryNativeClick()` treats a native click as successful if the call resolves without throwing. It does not verify an application-specific state transition before returning `click_method=cdp`.

The M006 failure is precisely a **resolved but behaviorally inert native click**. Therefore replacing raw `nativeClick()` with the generic high-level `page.click()` is not by itself evidence-backed: the generic path can accept the same no-op native event and skip its JS fallback.

### 4.3 PR #10 remains useful but was not sufficient

PR #10 correctly fixed a real earlier Web false-match (`Add from library / Browse and search your files`) and aligned the copied selector with the observed `role="group"` tool surface. The new diagnostic establishes a second, earlier blocker in the exact external-Chrome path: control activation.

The PR #10 matching corrections should therefore be preserved rather than reverted.

## 5. Diagnosis

### Directly observed

- Native click points hit-test to the intended plus/tool elements.
- Those native clicks do not activate the controls in the tested external-Chrome / Browser Bridge configuration.
- DOM `.click()` activates the same controls.
- Once activation succeeds, the merged Web root/label matching and selected-chip detection can recognize the intended state.

### Supported inference

The currently reproducible M006 blocker is **ChatGPT tool-control activation through Browser Bridge/CDP native click**, not stale Web/Deep labels or missing tool-root coverage.

### Unknown

The diagnostic does not establish:

- why the native events are inert;
- whether the behavior is specific to Browser Bridge v1.0.23, this Chrome/profile/runtime combination, or ChatGPT's current event handling;
- whether a generic OpenCLI browser-layer correction is warranted for other sites;
- live Web or Deep provider success after an activation correction;
- any reliability rate.

## 6. Intervention options

### A. ChatGPT-specific, state-verified DOM fallback in the temporary compatibility copy — RECOMMENDED

Keep native click as the first attempt, but treat it as an **attempt**, not proof of activation.

For the two interaction boundaries inside `selectChatGPTTool()`:

1. locate the existing exact tools control / exact candidate row;
2. native-click once;
3. wait briefly and verify the expected UI transition;
4. only if the transition did not occur, perform one bounded DOM `.click()` on the same already-resolved control/row;
5. verify the transition again;
6. fail closed if neither activation path establishes the expected state.

Expected transition checks:

- plus control: `aria-expanded=true` and/or the expected visible tool surface becomes present;
- tool row: target-specific exact selected-chip/current-tool state appears.

This should be a ChatGPT tool-selection compatibility patch only. It should not introduce arbitrary browser control or generalized click retries.

**Why this is smallest:** it changes the exact seam proven defective, preserves native activation when it works, uses the exact fallback already proven to work locally, and leaves Browser Bridge/OpenCLI's generic click semantics untouched.

### B. Change OpenCLI generic `BasePage.click()` to verify activation before accepting native success — DEFER

This could be architecturally cleaner upstream, but application-specific activation is not generically knowable. A change here affects every OpenCLI site and is too broad for the current M006 evidence.

### C. Replace ChatGPT native clicks with unconditional DOM clicks — NOT RECOMMENDED

This is smaller in code but discards the existing native path even where it works and provides less information about behavioral drift. Prefer native-first plus explicit state verification and a single fallback.

## 7. Smallest bounded source-development slice

If this plan is approved, implement one shared **ChatGPT tool-activation compatibility** slice for #2 and #3.

### Scope

- Branch from exact integrated `main` after plan approval.
- Preserve PR #10's Web exact-label/root corrections.
- Generalize the temporary copied-OpenCLI tool patch so it can be used for both explicit `web` and explicit `deep` modes.
- Patch only `clis/chatgpt/utils.js::selectChatGPTTool()` inside the disposable copy.
- Add a state-verified native-click -> one DOM-click fallback at:
  - tools-menu activation;
  - exact tool-row activation.
- Generalize the copied selector's selected-chip postcondition to the requested target (`Web Search` or `Deep Research`) rather than a Web-only hard-coded chip.
- Continue to fail closed if the exact pinned OpenCLI source anchors drift.
- Keep standard mode on the original verified executable path.
- Do not change `ask.js`, submission semantics, receipt schemas, connector support, or the installed OpenCLI package.

### Required RED fixtures before production change

1. **Menu native-no-op:** `nativeClick()` resolves, hit-test is correct, but menu state does not change; DOM click would open it.
2. **Web option native-no-op:** correct exact Web row is found; native click resolves but no Web chip appears; DOM click would select it.
3. **Deep option native-no-op:** same causal failure for Deep; DOM click would select it.
4. Keep the existing PR #10 false-match fixture (`Add from library ... search ...` before the true Web row).

The first three must fail against the current merged production transformer for the intended reason before implementation.

### GREEN requirements

- Native activation success does **not** invoke DOM fallback.
- Native no-op invokes exactly one DOM fallback and then verifies state.
- Web selects only exact Web Search and yields the exact Web selected state.
- Deep selects only exact Deep Research and yields the exact Deep selected state.
- If both native and DOM activation fail, return a typed pre-submission selector failure.
- Standard mode remains on the original executable path.
- Existing mode exclusivity and exactly-once/ambiguous-effect/recovery tests remain green.
- Temporary package is removed on success and failure; installed OpenCLI remains byte-identical.
- Full repository test / authority / requirements / syntax / package gates pass.

### Explicit non-goals

- no generic Browser Bridge/CDP fix;
- no arbitrary browser-control API;
- no model-selector changes;
- no connectors;
- no Gmail/OAuth interaction;
- no provider submission while developing the patch;
- no automatic retry after possible submission.

## 8. Live gate after source review and merge

Provider tests remain separately approval-gated.

If the implementation is reviewed, merged, and post-merge CI is green:

1. authorize and run exactly one forced-Web smoke from integrated `main`;
2. disposition #2 from that receipt;
3. separately authorize and run exactly one Deep smoke;
4. disposition #3 from that receipt.

A failure after possible submission must preserve the existing ambiguous-effect/no-retry discipline.

## 9. Revision triggers

Revisit this plan if any of the following changes before implementation/live qualification:

- OpenCLI pinned version changes;
- `selectChatGPTTool()` source anchors change;
- Browser Bridge is upgraded and native activation begins working;
- current ChatGPT plus/tool DOM no longer matches the recorded structure;
- a bounded test proves OpenCLI's generic high-level click reliably detects this no-op-native case;
- evidence shows DOM activation produces materially different behavior from a user-equivalent tool selection.

## 10. Review gate

This document intentionally stops before production implementation. Production code should not change until this intervention plan is reviewed and approved.
