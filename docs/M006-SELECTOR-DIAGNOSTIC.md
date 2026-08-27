# M006 — ChatGPT Tool Selector Diagnostic Handoff

- Observation time: 2026-08-26 23:18–23:22 EDT / 2026-08-27 03:18–03:22 UTC
- Scope: no-prompt-submission structural capture for issues #2 and #3
- Production selector changes: none
- Issue state changes: none
- Provider submissions during this diagnostic: none

This document contains only sanitized selector-relevant structure. It excludes cookies, tokens, headers, storage, challenge material, account identity, unrelated conversations, and network traffic.

## Runtime identity

- Executable: `/Users/rookslog/Development/chatgpt-research-adapter/.runtime/opencli/node_modules/.bin/opencli`
- Symlink target: `../@jackwener/opencli/dist/src/main.js`
- Version: `1.8.7`
- Executable SHA-256: `246004200e381e5aecdfaef13e904953c0d18e0600ca66d02b956c4b1820ec02`
- Package integrity: `sha512-2M+oPc70R1jNGzKzNrsm3fN4/gdvxCKlla7s9eaaTjkDjlzHpoZFN1YdV01A185kwCTN/ChOg+rbO4epO73c3w==`
- `clis/chatgpt/utils.js` SHA-256: `41fe6da20ec7184d6fa08defa86240b2a0261177e6311b6528cdb7b62ebc2d33`
- Installed package metadata has no `gitHead`; release identity is therefore the version, package integrity, installed bytes, and executable identity rather than an embedded commit SHA.

OpenCLI v1.8.7's relevant functions are `selectChatGPTTool`, `getCurrentChatGPTTool`, and `requireKnownChatGPTTool` in `clis/chatgpt/utils.js`. The shipped target labels are `Web Search`/`Search` and `Deep Research` (plus Chinese aliases).

## Sanitized current-UI structure

The current signed-in ChatGPT blank composer was inspected in the Codex in-app browser. The external persistent Chrome instance used by OpenCLI's Browser Bridge was healthy according to `opencli doctor`, but was not available through the separate Codex browser-control connection. Cross-browser identity is therefore a material unknown, not an assumed equivalence.

```json
{
  "composer": {
    "tag": "div",
    "id": "prompt-textarea",
    "role": "textbox",
    "aria-label": "Chat with ChatGPT",
    "contenteditable": "true"
  },
  "tools_control": {
    "tag": "button",
    "data-testid": "composer-plus-btn",
    "id": "composer-plus-btn",
    "aria-label": "Add files and more",
    "aria-haspopup": "menu",
    "aria-expanded_before": "false",
    "aria-expanded_open": "true"
  },
  "opened_surface": {
    "opencli_preferred_root_matches": 0,
    "observed_container": {
      "tag": "div",
      "role": "group"
    },
    "relationship": "Web search and Deep research are same-level descendants; no nested submenu was observed"
  },
  "web_search_option": {
    "tag": "div",
    "tabindex": "0",
    "role": null,
    "data-testid": null,
    "aria-selected": null,
    "aria-checked": null,
    "normalized_label": "Web search",
    "normalized_description": "Find real-time news and info",
    "observed_text_content": "Web searchFind real-time news and info"
  },
  "deep_research_option": {
    "tag": "div",
    "tabindex": "0",
    "role": null,
    "data-testid": null,
    "aria-selected": null,
    "aria-checked": null,
    "normalized_label": "Deep research",
    "normalized_description": "Get a detailed report",
    "observed_text_content": "Deep researchGet a detailed report"
  },
  "web_search_selected_state": {
    "composer_text": "Web search",
    "chip": {
      "tag": "span",
      "contenteditable": "false",
      "role": null,
      "data-testid": null,
      "aria-selected": null,
      "aria-checked": null,
      "normalized_text": "Web search",
      "parent_tag": "p",
      "ancestor": "div#prompt-textarea[contenteditable=true][role=textbox]"
    }
  },
  "deep_research_selected_state": {
    "chip": {
      "tag": "span",
      "contenteditable": "false",
      "role": null,
      "data-testid": null,
      "normalized_text": "Deep research"
    }
  }
}
```

## Stage observations

| Stage | Web Search | Deep Research |
| --- | --- | --- |
| Composer | observed success | observed success |
| Tools control | exact `composer-plus-btn` observed and opened | same control observed and opened |
| Menu root | OpenCLI preferred root selectors matched none; document fallback is available | same |
| Option discovery | exactly one current-UI `div[tabindex=0]` candidate observed | exactly one current-UI `div[tabindex=0]` candidate observed |
| Click | manual UI click succeeded | manual UI click succeeded |
| Selected-state representation | inline `span[contenteditable=false]` chip observed | inline `span[contenteditable=false]` chip observed |
| Composer preservation | blank composer remained on `/`; zero message nodes | an unsent diagnostic draft marker remained present; zero message nodes |
| Exact OpenCLI selector execution | unobserved: v1.8.7 exposes no standalone no-submit selector command | unobserved for the same reason |

Historical failure-stage mapping from the recorded v1.8.7 errors:

- Web Search: `ChatGPT tool did not switch to Web Search.` is thrown at **selected-state detection**, after the option-discovery/click block. The earlier stages were not independently receipted, so only the thrown stage is exact.
- Deep Research: `Could not find the ChatGPT Deep Research tool option.` is thrown at **option discovery**, after the composer, tools-control, and menu-open steps.
- Current no-submit observation: the corresponding manual UI stages reached selected-state representation for both tools. The exact OpenCLI path was not executable without entering the prompt-sending command, so no current OpenCLI failure stage is claimed.

`[ROOT LIVE OBSERVATION]` The historical errors `ChatGPT tool did not switch to Web Search.` and `Could not find the ChatGPT Deep Research tool option.` were not reproduced by the bounded current-UI manual stages. Both current options were discoverable and selectable without sending a prompt.

`[SOURCE FACT]` OpenCLI v1.8.7 first looks for a visible root matching `[role=menu]`, `[role=listbox]`, Radix menu/popup wrappers, or test IDs containing `menu`/`popover`; if none exists, it searches the whole document. The observed `role=group` container is not a preferred root, so current selection depends on that document fallback. The option selector does include `div[tabindex="0"]`, which matches both observed options. Selected-state detection explicitly permits a label-bearing descendant inside a nearest `[contenteditable=false]` pill, matching the observed chip shape.

`[INFERENCE]` The captured DOM and installed source are mutually compatible for label discovery and selected-chip detection. This does not establish that OpenCLI's native coordinate clicks succeed in the external Chrome runtime, and it does not explain the historical failures unambiguously. No production fix is justified from this capture alone.

## Suggested deterministic fixture boundaries

Create independent fixtures for these contracts rather than one full-page snapshot:

1. composer plus control by exact `data-testid`, including `aria-expanded` transition;
2. a `role=group` tools surface with same-level `div[tabindex=0]` options and descriptive child text;
3. no preferred menu-root match, exercising the current document fallback explicitly;
4. Web Search selected as a label-bearing `span[contenteditable=false]` inside the contenteditable composer;
5. Deep Research selected in the same chip shape;
6. unrelated navigation/account nodes containing `Search` must not satisfy option or selected-state detection;
7. composer draft text remains unchanged and no submit/message event occurs during selection.

Material unknowns for the #2/#3 development lane:

- whether the external Chrome DOM differs from this in-app-browser capture;
- whether a transient portal/root timing difference caused the historical option miss;
- whether native coordinate click targeting, rather than DOM discovery, caused the historical Web Search post-click failure;
- whether ChatGPT changed between the historical failures and this observation;
- whether the current document fallback can choose an unrelated label in a larger account/UI state.
