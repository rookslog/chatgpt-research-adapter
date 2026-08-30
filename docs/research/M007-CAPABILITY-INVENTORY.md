# M007 capability inventory

- Issue: [#24](https://github.com/rookslog/chatgpt-research-adapter/issues/24)
- Evidence cutoff: 2026-08-30
- Adapter source: `2b1df84b2da495d89a50eeeea463a544df4e3718`
- Installed dependency: `@jackwener/opencli@1.8.7`
- Status: inventory complete, including one bounded current zero-submit UI observation

## Purpose and evidence rules

This document inventories what the exact adapter, its installed OpenCLI package,
and the evidence already retained by this repository establish about ChatGPT
models, effort, tools, files, results, and connectors. It does not turn a
plausible interface into a supported product capability.

The labels below are intentionally different:

- **Current source**: present in the exact adapter or installed package inspected
  at the evidence cutoff.
- **Registry correspondence**: the installed OpenCLI ChatGPT adapter files match
  the npm registry tarball for `@jackwener/opencli@1.8.7`; this identifies the
  inspected code but does not qualify it against today's UI.
- **Historical live observation**: one or more retained provider/UI observations.
  An observation is not a reliability estimate.
- **Current zero-submit UI observation**: sanitized structure observed on a blank
  signed-in `/new` composer without entering prompt text or activating a capability.
- **Deterministic only**: exercised by local tests or fixtures, but not established
  live for the stated surface.
- **Unobserved**: no current evidence establishes the capability. Absence of a
  typed command is not proof that the ordinary ChatGPT UI lacks the capability.

The source inventory used no browser. A follow-up opened and closed only the
model/effort and plus menus on a blank composer. No model was changed, no
connector or tool was activated, no file was attached, and no provider prompt
was submitted.

## Exact identities

The adapter pins `VERSION = '1.8.7'` and verifies the executable identity before
each transport operation in
[`src/opencli-transport.js`](https://github.com/rookslog/chatgpt-research-adapter/blob/2b1df84b2da495d89a50eeeea463a544df4e3718/src/opencli-transport.js).
The inspected launcher and resolved executable were:

```text
launcher=/Users/rookslog/Development/chatgpt-research-adapter/.runtime/opencli/node_modules/.bin/opencli
resolved=/Users/rookslog/Development/chatgpt-research-adapter/.runtime/opencli/node_modules/@jackwener/opencli/dist/src/main.js
resolved_sha256=246004200e381e5aecdfaef13e904953c0d18e0600ca66d02b956c4b1820ec02
package=@jackwener/opencli@1.8.7
```

`npm view @jackwener/opencli@1.8.7` reported git head
`87b60a36590c3e2a466c37266c3348d73d7f68fe` and registry integrity
`sha512-2M+oPc70R1jNGzKzNrsm3fN4/gdvxCKlla7s9eaaTjkDjlzHpoZFN1YdV01A185kwCTN/ChOg+rbO4epO73c3w==`.
An offline `npm pack` reproduced that integrity, and a complete SHA-256 listing
of the installed `clis/chatgpt/` tree matched the tarball. The relevant upstream
source can therefore be inspected at the exact git head, including
[`ask.js`](https://github.com/jackwener/OpenCLI/blob/87b60a36590c3e2a466c37266c3348d73d7f68fe/clis/chatgpt/ask.js),
[`model.js`](https://github.com/jackwener/OpenCLI/blob/87b60a36590c3e2a466c37266c3348d73d7f68fe/clis/chatgpt/model.js),
[`utils.js`](https://github.com/jackwener/OpenCLI/blob/87b60a36590c3e2a466c37266c3348d73d7f68fe/clis/chatgpt/utils.js),
[`image.js`](https://github.com/jackwener/OpenCLI/blob/87b60a36590c3e2a466c37266c3348d73d7f68fe/clis/chatgpt/image.js), and
[`project-file-add.js`](https://github.com/jackwener/OpenCLI/blob/87b60a36590c3e2a466c37266c3348d73d7f68fe/clis/chatgpt/project-file-add.js).

This establishes package correspondence, not current UI compatibility.

## Capability matrix

| Surface | Exact adapter | Installed OpenCLI v1.8.7 | Retained live/UI evidence | Current status and falsifier |
|---|---|---|---|---|
| Standard submit and collect | `ask` defaults to `standard`; one new conversation is submitted, then `detail` obtains the last completed assistant message. Job, turn, conversation, prompt, output, and disposition receipts are persisted. | `chatgpt ask`, `detail`, `read`, `send`, and `status` exist. The wrapper always uses `--new true`; it does not expose continuation. | Standard mode completed live in M004. A later regression was recovered from the same conversation without resubmission. | **Supported, with historical live evidence.** Falsifier: an exact-current one-turn run fails to preserve exactly-one submission, the conversation receipt, or the complete assistant message. |
| Explicit Web Search | `--mode web` maps to `chatgpt ask --web-search true`; the returned tool must be exactly `Web Search`. | The typed composer-tool set contains `web-search` and `deep-research`; Web and Deep are mutually exclusive. | [#2](https://github.com/rookslog/chatgpt-research-adapter/issues/2#issuecomment-5448468017) retained one forced-Web success with 15 sources; [#13](https://github.com/rookslog/chatgpt-research-adapter/issues/13#issuecomment-5448646506) retained one stabilized full-message result. | **Supported by deterministic tests and two bounded historical observations, not a reliability estimate.** Falsifier: an exact-current forced-Web run selects another row, lacks the selected-tool postcondition, duplicates submission, or cannot collect the full response. |
| Deep Research selection and submission | `--mode deep` maps to `--deep-research true`. Submission returns a durable running handoff; `status`, `collect`, and `wait` are non-submitting lifecycle commands. | `ask --deep-research` and `deep-research-result` exist. | [#3](https://github.com/rookslog/chatgpt-research-adapter/issues/3#issuecomment-5449218724) retained one successful selection/submission and a native report that later completed, but adapter collection did not recover the report. | **Selection/handoff observed once; completed result recovery not live-qualified.** Falsifier for selection is a current no-submit selector probe or authorized turn that cannot establish the Deep selected state. Falsifier for recovery already exists: [#16](https://github.com/rookslog/chatgpt-research-adapter/issues/16#issuecomment-5450956568) records the cross-origin report iframe missing from the Bridge frame tree. |
| Image generation/editing | `image` appears in `MODES`, but the actual `ask` parser rejects it and no image command is exposed. | `chatgpt image` accepts comma-separated image paths, can generate or edit, and can save generated images locally. | The current plus menu showed `Create image — Visualize anything`; no item was activated and no adapter live qualification was performed. | **OpenCLI source capability and current UI affordance; adapter inconsistency and product gap.** Falsifier for OpenCLI is a bounded current image operation that cannot upload or save as documented. Falsifier for adapter support is already structural: the public parser accepts only `standard|web|deep`. |
| Model and effort selection | No model/effort option, command, transport call, or receipt field exists. | `chatgpt model` is present in the exact installed release. Choices cover `fast`, `balanced`, `advanced`, `very-high` (including Extra High/XHigh/Ultra aliases), `pro`, and `gpt-5.6-pro` plus aliases. `advanced` maps to `gpt-5-5-thinking/extended`; `pro` to `gpt-5-5-pro/standard`; `gpt-5.6-pro` to `gpt-5-6-pro/standard`. | On 2026-08-30 the read-only OpenCLI model observer returned `very-high` / `Very High`; the UI showed `Extra High`, `4 of 5`, a checked `GPT-5.6 Sol` row, an unchecked `GPT-5.5` row, and a `Select model` item. No selection changed. The owner separately reports that Pro is human-selectable; this probe did not independently reach a Pro row. | **Exact OpenCLI source support plus current effort/model structure; wrapper unsupported and Pro postcondition unqualified.** Falsifier: a bounded implementation probe cannot select and verify the requested exact model/effort while preserving the previous state on failure. The source evidence means an OpenCLI fork is not presently justified merely to expose Pro. |
| Conversation continuation | No continuation input; transport unconditionally adds `--new true`. | `ask` accepts a conversation selector and `send` exists. | Not inventoried live. | **OpenCLI source capability; wrapper unsupported.** Falsifier: current source or a typed adapter command that accepts a conversation ID and preserves it in receipts. |
| Project routing | No project option or project receipt. | `ask --project`, `project-list`, and project-aware `model` navigation exist. | Not inventoried live. | **OpenCLI source capability; wrapper unsupported.** Falsifier: exact adapter source exposes and verifies a project target. |
| Project knowledge upload | No file or project-knowledge command. | `project-file-add` uploads one or more local files as project knowledge and explicitly distinguishes this from conversation attachments. | Not inventoried live. | **OpenCLI source capability; wrapper unsupported.** Falsifier: current command execution cannot validate/upload the declared files to the declared project. |
| General conversation attachments | No attachment input or receipt. | No public general conversation-attachment command appears in the complete ChatGPT command registry. Image input and project knowledge are narrower capabilities. | The current blank-composer plus menu showed `Add photos & files — Upload from computer` and `Add from library — Browse and search your files`. No file picker was opened and no file was attached. | **Current UI affordances observed; typed OpenCLI and wrapper surfaces absent.** Falsifier for the typed-surface claim: identify an exact v1.8.7 command that attaches arbitrary files to the current conversation. Falsifier for usable attachment support: a bounded implementation cannot bind exact input-file identities to a conversation receipt and verify the resulting attachment state. |
| Assistant-generated files | No list/download artifact operation. Standard/Web persist Markdown; completed Deep is designed to persist a report and structured sources. | Image output has a download path. No general assistant-generated-file list/download command appears in the complete ChatGPT command registry. | No retained general-file recovery observation. | **Unsupported by the adapter and unobserved in the current UI.** Falsifier: exact source or an authorized observation establishes a stable file identity, enumeration path, and byte-preserving download path for non-image assistant artifacts. |
| Standard/Web answer and sources | Persists `answer.md` plus result/receipt data. It does not return a separately typed source set for Standard/Web. | `detail --markdown` returns conversation rows; source-bearing Markdown can be embedded in the assistant text. | Web observations returned source-bearing answers. [#5](https://github.com/rookslog/chatgpt-research-adapter/issues/5#issuecomment-5434016211) preserves negative citation-coverage and escaped-sentinel findings rather than treating formatting conformance as citation correctness. | **Answer collection supported; structured source recovery not established.** Falsifier: exact current source emits a separately validated source set for Standard/Web. |
| Deep report and sources | A completed Deep result requires a nonblank `report` and an array of `sources`, then publishes immutable result, report, and completion-event artifacts. | `deep-research-result` returns a typed completed row including report and sources. | Deterministic lifecycle tests pass; current retained live evidence shows the native report can complete while extraction fails. | **Deterministic contract only for completion; live recovery blocked.** Falsifier: the retained live run completed in the browser while the reader could not recover its report/source payload. Do not equate browser-visible completion with adapter completion. |
| Connector discovery/activation | No connector schema, selector, `@` mention workflow, active-state verification, or connector receipt exists. | No typed connector command appears in the complete ChatGPT command registry; the only typed composer tools are Web Search and Deep Research. | One bounded historical Standard session returned exact private GitHub issue/milestone state and provider-reported 89 connected operations, as recorded in the [README](https://github.com/rookslog/chatgpt-research-adapter/blob/2b1df84b2da495d89a50eeeea463a544df4e3718/README.md) and [project boundary](https://github.com/rookslog/chatgpt-research-adapter/blob/2b1df84b2da495d89a50eeeea463a544df4e3718/docs/PROJECT-BOUNDARY.md). The current plus menu also showed a visible `GitHub — Triage PRs, issues, CI, and publish flows` row; it was not activated. | **Current discoverability plus historical connected-session evidence; no typed activation contract.** Falsifier for typed absence: identify an exact v1.8.7 connector command and postcondition. Activation, multi-connector composition, and receipt semantics remain unqualified. Typing `@GitHub` or seeing the row alone is not activation evidence. |
| Autonomous Web use in Standard mode | Standard requests no explicit tool and requires the returned tool field to be empty. | Standard `ask` does not select the Web Search row. | No retained observation isolates whether ChatGPT may autonomously browse in Standard mode. | **Unobserved.** Falsifier: a separately authorized Standard turn with native tool/source evidence showing autonomous browsing, or source that proves it is prohibited. |
| Cancel, result-file listing, attention acknowledgement | Named in `PROJECT-BOUNDARY.md` as intended protocol operations, but absent from the current CLI parser. | No corresponding wrapper implementation follows from OpenCLI's current ChatGPT command list. | None. | **Protocol intent, not implementation.** Falsifier: exact current adapter commands and durable receipts for these operations. |

## Current wrapper boundary

The executable adapter surface is narrower than the conceptual protocol in
`docs/PROJECT-BOUNDARY.md`:

```text
ask        standard | web | deep
prepare
submit-once
status     Deep only
collect    Deep only
wait       Deep only
```

The principal implementation points are:

- `resolveMode()` in `src/modes.js` declares `standard`, `web`, `deep`, and
  `image`, with `standard` as the default.
- `parseAsk()` / `runCli()` in `src/cli.js` expose only
  `standard|web|deep` and the four lifecycle commands above.
- `runAsk()` / `runOpenCliAsk()` in `src/opencli-transport.js` pin a new
  persistent-session submission and add only the Web or Deep selector flags.
- `runOpenCliDetail()` extracts the last completed assistant row through the
  Markdown compatibility reader.
- `submitDirectPreparedJob()`, `getDeepPreparedJobStatus()`,
  `collectDeepPreparedJobInternal()`, and `waitDeepPreparedJob()` in
  `src/direct-ask.js` own one-shot handoff and Deep lifecycle persistence.

No existing wrapper function owns model selection, connector activation,
project knowledge, general attachments, conversation continuation, or general
artifact download.

## Findings that change the M007 investigation order

1. **Do not fork OpenCLI merely to make Pro selectable.** The exact installed
   v1.8.7 package already contains `chatgpt model` support for both generic Pro
   and GPT-5.6 Pro. The next design question is how the wrapper selects a model
   before submission, verifies the postcondition, prevents cross-job state
   leakage, and records the requested/resolved state.
2. **The wrapper has a declared-versus-executable Image inconsistency.** `image`
   is a valid domain mode but cannot pass through the public `ask` command. This
   needs an explicit product decision rather than an accidental parser widening.
3. **Files split into at least three ownership problems.** Project knowledge,
   image input/output, and general conversation/generated artifacts have
   different exact OpenCLI support. A single undifferentiated “file support”
   claim would be false.
4. **Deep tool activation and Deep result extraction are separate defects.** A
   historical activation/handoff succeeded; the live report reader later hit a
   separate cross-origin/frame visibility falsifier.
5. **Connector access and connector activation are separate claims.** The
   historical GitHub result establishes one connected session, not a selectable
   connector contract, multi-connector composition, or current availability.

These are investigation findings, not approved product/API decisions for the
remaining M007 issues.

## Current zero-submit UI observation

At `2026-08-30T19:36:39Z`, exact OpenCLI v1.8.7 connected through Browser
Bridge v1.0.23 with `surface=adapter` and `siteSession=persistent`. The managed
tab was navigated to `/new`. Before and after each menu transition, the composer
was blank and the page had zero message nodes.

The minimum allowlisted structure was:

- plus control: `button[data-testid="composer-plus-btn"]`,
  `aria-label="Add files and more"`, closed before activation and expanded
  after one native click;
- effort control: visible `Extra High`, closed before activation;
- effort menu: `Thinking effort`, `Extra High`, `Extra High, 4 of 5`, and a
  `Select model` item;
- model rows: `GPT-5.6 Sol` was `role=menuitemradio`, `aria-checked=true`; the
  `GPT-5.5` row was unchecked;
- plus-menu rows: `Add photos & files`, `Add from library`, `Create image`,
  `Web search`, `Deep research`, and `GitHub`.

No provider command, `ask`, or `send` path ran. The probe recorded
`provider_submission=false`, `model_changed=false`,
`connector_activated=false`, and `file_attached=false`.

The first capture's relevance filter admitted one unrelated profile element.
Its raw temporary file was deleted immediately; the durable summary uses only
the allowlisted capability fields above. No cookies, tokens, storage, headers,
network traffic, unrelated conversation content, or account-identifying field
is retained.

This observation establishes current visibility and selected-state structure,
not successful activation or reliability. A nested `Select model` click did not
produce a distinct captured menu, so the absence of a visible Pro row in this
capture is **not** evidence that Pro is unavailable.

## Remaining gaps carried into implementation issues

1. Model/effort selection still needs an adapter-owned requested/resolved
   contract, atomic pre-submit postcondition, failure restoration behavior, and
   receipts. The current installed selector may read session material and mutate
   account preference internally, so this inventory did not invoke it.
2. Connector activation, multiple simultaneous connectors, and a non-textual
   selected-state postcondition remain unqualified.
3. Conversation-file upload, project knowledge, and returned/generated files
   remain three distinct implementation and qualification problems.
4. Web/Deep rows were visible, but this observation did not activate them and
   does not supersede their retained live evidence or known Deep extraction gap.

## Reproduction commands used

The source inventory used read-only commands equivalent to:

```sh
git rev-parse HEAD
node .runtime/opencli/node_modules/.bin/opencli --version
node .runtime/opencli/node_modules/.bin/opencli chatgpt --help -f yaml
node .runtime/opencli/node_modules/.bin/opencli chatgpt model --help -f yaml
npm view @jackwener/opencli@1.8.7 version gitHead dist --json
npm pack --offline @jackwener/opencli@1.8.7
shasum -a 256 <installed-and-tarball ChatGPT adapter files>
rg <capability terms> src docs .runtime/opencli/node_modules/@jackwener/opencli/clis/chatgpt
```

Repository code discovery also used the current codebase knowledge graph to
locate and trace the adapter lifecycle functions before reading their exact
source. Existing GitHub issue comments and repository artifacts supplied the
historical live evidence. The UI follow-up imported only OpenCLI's read-only
`getCurrentChatGPTModel()` helper and used sanitized DOM evaluation plus native
menu clicks; it made no live provider turn.

## Limitations

- ChatGPT UI state can change independently of both repositories.
- Source presence does not establish that a selector still works against the
  current UI.
- Source absence in OpenCLI does not establish that ordinary ChatGPT lacks the
  capability.
- The historical live observations are bounded examples, not success-rate or
  reliability estimates.
- The registry correspondence check identifies the installed dependency; it
  does not make npm metadata or the upstream repository an authority about
  unobserved ChatGPT behavior.
