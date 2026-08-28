# Ordinary-Chat Adapter Candidate Evaluation

Date: 2026-08-23

Closure target: adopt/fork/build decision after offline falsifier; no live operation

Decision: adopt pinned OpenCLI through a custom wrapper protocol; no deletion-only fork

## Evidence method and discovery record

The gate asks whether a maintained external project can mediate ordinary signed-in ChatGPT Chat for bounded Codex research, or whether a custom controller is warranted. Required V1 capabilities are versioned prompt templates, question and approved-file submission, answer and generated-file return, durable job/turn receipts, bounded concurrency, visible stop/retry/recovery, and one controlled profile.

The broad pass used current GitHub/web results, repository metadata, READMEs, releases, package metadata, and source. Its query families covered signed-in ChatGPT browser automation; CLI over existing profiles; extension/local bridges; MCP/CDP/remote-debugging; Playwright/Puppeteer; answer/export/download/artifact paths; Codex handoff; and reverse-direction “turn ChatGPT into Codex” projects. `[REPORTED — Luna Max discovery ledger, 2026-08-23]`

| Funnel stage | Count | Scope limit |
|---|---:|---|
| Result cards reviewed | 52 | Manual sample, not the search-engine universe |
| Unique repositories/tools | 31 | Forks, mirrors, and package duplicates collapsed |
| Plausible after README screen | 24 | Conceivable ordinary-Chat browser path |
| Serious after current-source screen | 10 | Shipped path or useful reference primitives |
| Terra High shortlist | 6 | One isolated deep audit per repository |

The six deep-audited repositories were OpenCLI, `DrA1ex/chatgpt-bridge`, ask-bridge, ChatFerry, 10x-chat, and `chatgpt-use`. DevSpace received a seventh deep audit because the owner named it. Each audit recorded an exact SHA, cloned only under `/private/tmp`, used a full code graph where available, and avoided live browser/account/provider activity. Root spot-checks re-read load-bearing source anchors before accepting the reports.

Labels:

- `[CONFIRMED — source — “excerpt”]`: source-supported and spot-checked.
- `[REPORTED — source]`: delegated/manual receipt not independently reproduced in full.
- `[UNCERTAIN]`: the checked evidence does not establish the claim.

## Maintenance and adoption

| Candidate | Current maintenance evidence | Concentration / release qualification |
|---|---|---|
| **OpenCLI** `c003a1b` | 28,486 stars, 2,799 forks, same-day push; 93 main-history commits/4 weeks and 275/13 weeks; current core CI/security workflows passed; `v1.8.7` released Aug 23 | Maintainer-led but many contributors; public npm and extension ZIP with digest. Strongest upstream by a large margin. `[CONFIRMED — https://github.com/jackwener/OpenCLI]` |
| **ask-bridge** `fc1507b` | 36 stars, 24 forks; 26 commits/4 weeks, 123/13 weeks; active CI; `v0.2.12` Aug 18 | Owner accounts for about 90%; npm stops at `0.2.11`, so latest source/release is not npm-installable. `[CONFIRMED — https://github.com/doggy8088/ask-bridge/releases]` |
| **10x-chat** `a168eb7` | 45 stars, 10 forks; 3 commits/4 weeks, 24/13 weeks; 157 mocked tests and typecheck passed | Top two identities own 80/82 contributions; public release/npm stop at `0.11.6` while main is tagged `0.11.7`. `[CONFIRMED — https://github.com/MikeChongCan/10x-chat]` |
| **chatgpt-bridge** `b4d1459` | 102 commits in a July–Aug burst; no push after Aug 1 | One effective contributor, zero stars/forks, no release or public CI; current locked install fails on unpublished `zipflow@1.9.0`. `[CONFIRMED — https://github.com/DrA1ex/chatgpt-bridge/blob/b4d1459ceaf54d15905b7bdc4713ba2cf107da78/package.json#L63-L73 — “zipflow”: “1.9.0”]` |
| **ChatFerry** `fc46861` | 6 stars, 1 fork; 64/64 isolated offline tests passed | One contributor, eight commits, last source push May 18, one March release. `[CONFIRMED — https://github.com/shlokkhemani/chatferry]` |
| **chatgpt-use** `96a580c` | 7 stars; 37 commits in one June/July burst, none in the last month | One contributor; only release `v0.0.1` is 24 commits behind main; no successful root CI receipt. `[CONFIRMED — https://github.com/leeguooooo/chatgpt-use]` |
| **DevSpace** `fdbff75` | 3,965 stars, 440 forks, at least 100 commits in four weeks; current CI and eight releases | Owner has 627/632 contributions. Strongly maintained but wrong data-flow direction. `[CONFIRMED — https://github.com/Waishnav/devspace]` |

## Capability and viability matrix

| Candidate | Submit / approved files | Answer / generated files | Receipts, concurrency, recovery | Disposition |
|---|---|---|---|---|
| **OpenCLI** | Text; images; project-knowledge files, but generic conversation documents are unconfirmed | Text, Deep Research, sources, images; arbitrary generated files unconfirmed | One-writer leases, command journal, unknown-effect outcomes; wrapper must add the V1 job/turn contract | **Adopt pinned through wrapper** |
| **chatgpt-bridge** pre-Zipflow `b6b9146` | Text and attachments through ChatGPT-scoped extension | Answer plus robust artifact/download substrate | Durable turn/events, idempotency, one-turn queue, cancellation/reconciliation | **Fallback/comparator**; executable boundary is braided with project/workflow code |
| **ask-bridge** | Text, documents, images; paths unrestricted | Text and generated images only | One process mutex and no-blind-replay transport; no jobs, queue, receipts, or recovery | **Reject as shipped**; detection-evasion flag and missing V1 controls |
| **ChatFerry** | Text; `--file` pastes file contents, not an attachment | Markdown answer; ChatGPT generated-file return absent | Strong run records, configurable slots, local cancel/reconcile; unknown remote effect not modeled | **Receipt-state reference** |
| **10x-chat** | Text; context bundles; real file upload without an approved-root boundary | Text, Deep Research report, images; arbitrary generated files absent | Basic session files; raw JSONL browser delegate; no safe job recovery/concurrency cap | **Reject as shipped**; deliberate disguise mechanisms |
| **chatgpt-use** | Text; local file contents pasted without root/size/type policy | Text/structured JSON only | Best-effort metadata ledger; claimed cross-process lock absent; no stop/recovery/files | **Concept reference only** |
| **DevSpace** | ChatGPT calls local tools; it does not submit a question to ChatGPT | Tool result returns into ChatGPT, not ChatGPT answer to Codex | Coding-process sessions, not research jobs | **Reject: reverse direction and general execution** |

No candidate ships the exact V1 template plus receipt schema. That local contract must be added in any fork.

## Candidate findings

### OpenCLI — strongest upstream and selected wrapper backend

OpenCLI technically covers the hardest ordinary-Chat paths and has the healthiest upstream. `chatgpt ask` submits through the visible composer, records a conversation URL, waits from a message baseline, and returns assistant text. A dedicated Deep Research reader returns progress, report, sources, URL, method, and diagnostics; image generation saves local outputs. `[CONFIRMED — https://github.com/jackwener/OpenCLI/blob/a0fbe90a7f682f6374d75fb99325c60c48e3aa56/clis/chatgpt/ask.js#L38-L128]`

#### Current command and skill refresh

A fresh read-only clone on 2026-08-23 resolved current `main` to `c003a1b1c2a7f3435ef832412a9cdbf745a803ac`, seven commits after `v1.8.7`. A path-scoped diff found no changes from the release across the ChatGPT adapter, its documentation, shipped skills, or extension, so the release pin still represents the currently inspected research surface. `[CONFIRMED — local commands: git rev-parse HEAD; git diff --quiet v1.8.7..HEAD -- clis/chatgpt skills docs/adapters/browser/chatgpt.md extension — “NO_RELEVANT_DIFF_FROM_V1_8_7”]`

| OpenCLI ChatGPT surface | Current source-supported behavior | Design consequence |
|---|---|---|
| `ask` / `send` | Ordinary prompt by default; route new, existing, or project chat; optional Web Search or Deep Research | Ordinary and web modes are usable foundations; Deep Research stays opt-in |
| `read` / `detail` / `history` / `status` | Read visible messages/conversations and check session state | Narrow fork retains current-job reads, but removes broad history enumeration |
| `deep-research-result` | Polls/extracts report, sources, progress, and diagnostics, partly through private conversation payloads | Useful optional path; more fragile and higher authority than ordinary DOM answer return |
| `image` | Generate or edit images, upload local images, and save returned image assets | Keep as a separate explicit capability with approved input/output roots |
| `project-list` / `project-file-add` | Lists projects and uploads files as persistent project knowledge, not conversation attachments | Do not use as the V1 attachment substitute; persistence and scope differ |
| Model selection | Switches visible intelligence levels, with private-setting fallback for some levels | Defer unless a visible-UI-only retained path is justified |
| GitHub app/connector | No typed GitHub/app selector found; typed composer tools are only Web Search and Deep Research | Requires a new bounded adapter command and later live UI approval; prompt text alone is not activation evidence |
| Arbitrary generated files | No typed general-file return in the ChatGPT adapter; generic browser download exists elsewhere | V1 must add a typed, rooted download primitive or falsify the fork route |

OpenCLI ships seven agent skills. `opencli-usage` is the start-of-session orientation and live command-discovery map; `opencli-adapter-author` is the development workflow for adding site commands; `opencli-browser` is the generic ad-hoc browser driver; `opencli-autofix` guides trace-based adapter repair; the two sitemap skills consume and author agent navigation memory; and `smart-search` routes queries across many OpenCLI sources. None is a ChatGPT research job/receipt workflow. The proposed operational surface installs/exposes only the custom `chatgpt-research` skill; adapter-author/autofix may be used during controlled development, while browser and smart-search remain outside the runtime boundary.

The earlier package ranked it too low by treating broad manifest authority as if it were the entire default runtime behavior. Current source also has material mitigations: explicit `127.0.0.1` binding, Origin/CORS checks, owned automation containers instead of daily tabs, domain-scoped cookie reads, allowlisted direct CDP methods, one-writer leases, and fail-closed unknown command results. These controls reduce accidental and webpage-origin risk; they do not make the shared bridge a narrow security boundary.

#### Genuine OpenCLI security risks

| Risk | Real precondition and impact | Existing mitigation | Required narrow-fork change |
|---|---|---|---|
| Daemon has no secret application auth | Any local process—or a caller reaching an intentionally forwarded port—can forge the static header/no-Origin client and command the extension | Loopback bind; web Origin/CORS rejection | Per-install secret, exact extension-ID binding, no remote exposure |
| Broad extension compromise blast radius | Compromised extension/update or authorized daemon caller can inspect/control pages across `<all_urls>` | Owned containers default; explicit `bind` for user tabs | ChatGPT-only hosts; remove `bind`, cookies, debugger where possible |
| Raw browser command authority | Caller can execute JavaScript, capture screenshots/network, read scoped cookie values, and drive file input | CDP passthrough allowlist; leases | Delete raw `exec`, CDP, cookie, screenshot, network, tabs, and generic navigation actions |
| Local-file exfiltration | Caller-supplied absolute file paths reach `DOM.setFileInputFiles` | No bridge-level approved root | Enforce one handoff root, no-follow canonicalization, size/type/count manifest in daemon and extension |
| Private backend/selector drift | Auth and Deep Research use `/api/auth/session`, `/backend-api/conversation/`, DOM, frames, and captured payloads | Multiple fallbacks and typed failures | Prefer visible UI, retain only justified bounded extractor, fixture-test every fallback, fail closed |
| Diagnostic persistence | Traces can retain prompts, answers, screenshots, state, and redacted network data | Trace off by default; redaction/retention helpers | Separate minimal receipt schema; no raw page/network capture in V1 |

There is no source evidence that the maintainers are malicious or that OpenCLI binds publicly by default. Normal webpages are blocked; default work uses owned containers; and current code has mature ambiguity handling. M001 confirmed that ordinary ChatGPT commands use generic `exec` and navigation internally. `[OWNER DECISION — 2026-08-24]` Those internals are accepted; the supported Codex workflow remains the custom wrapper protocol.

### `DrA1ex/chatgpt-bridge` — strongest domain fallback, weakest upstream

The pre-Zipflow revision clean-installed, package-checked, and passed 963 executed tests in the latest Terra run. The previously observed workflow context-sync failure did not reproduce in immediate reruns; logs still showed a temporary-state rename anomaly, so the evidence supports an unresolved race signal rather than a consistently reproducible failing test. `[CONFIRMED — https://github.com/DrA1ex/chatgpt-bridge/blob/b6b914699502bf191041ec288d15e2df2c455f99/test/workflow.test.js#L780-L809]`

Its turn/event/idempotency, artifact identity, path/ZIP safety, one-turn queue, and cancellation/reconciliation designs are unusually aligned with V1. Its extension is narrower than OpenCLI’s. However, current main is un-installable, public maintenance is effectively solo, and the default executable unconditionally constructs project, workflow, Zipflow, shell-restart, and generic RPC surfaces. The domain seams are useful; the executable boundary is not clean enough to outrank a maintained OpenCLI reduction.

### Other deep-audited candidates

- **Ask Bridge:** actively maintained and ships ordinary-Chat text/doc/image input plus text/image return. Current headless source adds `--disable-blink-features=AutomationControlled`, and the required receipt/concurrency/cancel/recovery system is only proposed. `[CONFIRMED — https://github.com/doggy8088/ask-bridge/blob/fc1507b97cc4c156cc15fdb5fba933779e17fd01/src/main.rs#L1788-L1806]`
- **10x-chat:** the best newly discovered mature-looking feature set, but source and released npm explicitly prefer Patchright as an “undetectable” fork, falsify browser properties, and disable `AutomationControlled`. This violates the no-disguise boundary. `[CONFIRMED — https://github.com/MikeChongCan/10x-chat/blob/a168eb792216cfdec794f372219f70354b6bd0fd/src/browser/engine.ts#L1-L13]`
- **ChatFerry:** good async receipt-state reference. ChatGPT `--file` reads prompt text, not browser attachment; only its Claude provider implements generated artifact download. `[CONFIRMED — https://github.com/shlokkhemani/chatferry/blob/fc468619a4b2f989a7f694240ee2690cdbce8cf6/src/cli.ts#L631-L687]`
- **chatgpt-use:** closest conceptual sidekick, typed structured packets, and 73/73 offline tests. Current source has no controlled-profile discovery, durable outcome ledger, concurrency coordinator, cancel, or generated files; it locates an unpinned broad `chrome-use` executable and defaults to private Project endpoints. `[CONFIRMED — https://github.com/leeguooooo/chatgpt-use/blob/96a580c5946d1a73e196e1380f3687482f7a31fd/src/channel.rs#L24-L32]`
- **DevSpace:** well maintained, authenticated, and thoughtfully built, but its MCP server exposes local read/write/edit/shell tools to ChatGPT. It has no ChatGPT submission or answer-extraction client path and is not a candidate for this product. `[CONFIRMED — https://github.com/Waishnav/devspace — “Turn ChatGPT into Codex”]`

## Plausible projects not advanced

| Disposition | Projects | Reason |
|---|---|---|
| Hold for reference | `guilhermesilveira/chatgpt-mcp`, `chatgpt-browser-agent`, `OpenBrowser`, `OLmatter/chatgpt-bridge`, `parkermg/chatgpt-mcp`, `conduit-bridge` | Useful text/stop/bridge ideas, but lower maintenance or no generated-file/receipt boundary |
| Reject: stale or weak prototype | `icedmoca/chatgpt_chrome_bridge`, `Chrome-extension-ChatGPT-API`, `browser-llm-bridge`, `Microck/chatgpt-webui-mcp` | Stale/archived, answer-only, credential-copy, or no recovery/artifact evidence |
| Reject: disguise/high authority | `ceoimperiumprojects/chatgpt-py`, `bmaltais/ai-bridge`, `parley`, `browser-bridge` | Anti-detection/stealth or generic cookie/JS/browser authority outside the boundary |
| Reject: wrong direction/scope | CatDesk, `codex-chatgpt-bridge`, `chatbridge`, `chatgpt-web-image-mcp`, DevSpace | ChatGPT-to-local execution, capture-only, or image-only |
| Reject: API-shaped substitute | `ChatGPT-Web2API`, generic OpenAI-compatible browser proxies, API-only wrappers | They silently change the product contract or retain an overly broad proxy surface |

## Technical viability versus permission to operate

The owner’s proxy authorization and responsible-rate-limit intent are recorded product requirements. They do not change the controlling external text. OpenAI’s current individual Terms prohibit automatically/programmatically extracting Output and separately prohibit bypassing restrictions or protective measures. `[CONFIRMED — https://openai.com/policies/row-terms-of-use/ — “Automatically or programmatically extract data or Output”; “bypass any protective measures”]`

Official MCP/plugin documentation supports ChatGPT calling a tool and using the result inside the conversation; it does not establish an ordinary-Chat output channel back to Codex. `[CONFIRMED — https://developers.openai.com/plugins/concepts/mcp-server]` The API remains a control/comparator, not a target substitute.

## Recommendation, rollback, and falsifiers

**Recommendation:** pin OpenCLI and integrate it through the custom `chatgpt-research` wrapper. Do not spend time deleting generic upstream capabilities unless an observed integration problem later justifies a fork.

`[OWNER DECISION — 2026-08-24]` The wrapper protocol is sufficient; underlying generic capabilities do not need to be absent.

`[USER DECISION]` The future operating location is the owner's local Mac with a dedicated ChatGPT profile, not a remote machine. A persistent background container is preferred; an occasional window-creation or recovery flash is acceptable. The Codex-facing interface is a custom `chatgpt-research` skill over the narrow CLI. Deep Research is included but requires an explicit choice.

Standard `chatgpt ask` reaches `Page.evaluate → exec` and generic `navigate`; Deep adds network capture, frames, and CDP. This remains a disclosed security/maintenance fact, not a rejection criterion. The wrapper does not expose those generic operations as its agent contract.

Rollback is deletion of the isolated feasibility branch/clone and its generated test artifacts; the current four design documents remain the decision record. No profile, account, extension, or remote state exists to unwind.

## M003 operational evidence — 2026-08-24

`[OWNER DECISION]` OpenCLI remained the selected upstream for one bounded wrapper-first live smoke. Exact v1.8.7 and Browser Bridge 1.0.23 identities were verified. Branded Chrome 151 could not load the bridge by command line because Chrome removed that mechanism from branded builds; the owner selected temporary official Chrome for Testing instead of normal-profile installation.

`[CONFIRMED — local M003 receipt]` Chrome for Testing 151.0.7922.174 loaded the verified bridge in an isolated user-data directory. OpenCLI doctor and `chatgpt status` established daemon 1.8.7, extension 1.0.23, connected context, and logged-in ChatGPT. The wrapper then recorded durable intent before exactly one standard ask. That process ended near the deadline with `ERR_OPENCLI_EXIT`; no answer or conversation reference was accepted. The wrapper persisted terminal `ambiguous_effect`, remote effect unknown, and retry prohibited. No second turn occurred.

This is concrete integration evidence, but it does not yet identify whether the failure is adapter drift, response waiting, browser execution, or another upstream condition: the M003 receipt retained only the error class and stderr hash. OpenCLI remains the selected candidate, while live viability is now explicitly unresolved. Before another authorized smoke, the wrapper needs an offline-reviewed bounded/redacted diagnostic receipt that can preserve actionable failure evidence without retaining secrets or enabling replay.

## M004 operational evidence — 2026-08-24

`[OWNER DECISION]` The owner approved the minimal production slice, persistent
normal-Chrome Bridge installation, useful unredacted local failure text, and
live execution. A wrapper call using exact OpenCLI v1.8.7 and Browser Bridge
1.0.23 completed a standard prompt and saved the exact requested answer. The
working sequence is a one-time `chatgpt ask --wait false` followed by a wait on
the returned conversation through `chatgpt detail`; this resolves the practical
standard-mode viability question left open by M003.

`[HISTORICAL LIVE OBSERVATION — 2026-08-24]` The then-current OpenCLI Web Search and Deep Research tool selection was
incompatible with the tested ChatGPT UI. Both mode checks failed before prompt
submission with explicit selector errors. OpenCLI remains selected because the
default standard handoff now works and the project deliberately avoids building
a second generic browser controller merely to patch optional modes.

`[IMPLEMENTATION OBSERVATION — deterministic local tests, 2026-08-28]` Exact
OpenCLI v1.8.7 now supports a local split Deep lifecycle: one durable
submission/handoff returns `running`; process-free status and non-submitting
collect/wait operations later observe the same conversation; collectors publish
report, terminal result, and then a local completion event. This establishes no
live selector or completed-report qualification. The current Deep report/source
extraction remains blocked by the separately approval-gated Browser Bridge diagnostic;
no new provider submission occurred in this implementation phase.

## M001 execution checkpoint — 2026-08-24

`[CONFIRMED — local detached worktree /private/tmp/opencli-m001 at 87b60a36590c3e2a466c37266c3348d73d7f68fe]` Sol High independently reviewed the spike matrix and returned `CONCUR_WITH_CHANGES`; root accepted its build-artifact, command-digest, adversarial-peer, crash-window, filesystem-race, and evidence-class corrections.

A Terra High tracer added one synthetic typed `submit_question` seam to the pinned daemon. After root-required revision, research-peer registration requires the exact `chrome-extension://<pinned-id>` upgrade Origin, matching message ID, and per-install secret before peer or journal mutation. The command ID binds to canonical command/install/caller/context identity, and focused fixtures distinguish pre-dispatch intent from injected post-dispatch ambiguity. `[CONFIRMED — /private/tmp/opencli-m001/src/research-daemon-seam.ts — “expectedOrigin”; /private/tmp/opencli-m001/src/research-tracer.ts — “canonicalCommandDigest”; “ambiguous_effect”]`

Root reran 8/8 focused tests, typecheck, `git diff --check`, a successful local build producing 1,332 manifest entries, and ten consecutive focused runs. The package dry-run succeeded with scripts disabled and reported 2,353 files. The broad upstream unit command was not accepted as green: the delegated run had unrelated sandbox-denied home-directory/listener failures.

The decisive gate remains red. The static inventory and built/package inspection still contain generic `/command`, browser/CDP exports, all unrelated adapters, broad OpenCLI skills, raw extension actions including `exec`, `cookies`, `cdp`, `bind`, and network capture, permissions including debugger/cookies/downloads, and `<all_urls>`. `[CONFIRMED — /private/tmp/opencli-m001/scripts/m001-authority-inventory.mjs; /private/tmp/opencli-m001/extension/manifest.json; /private/tmp/opencli-m001/extension/src/background.ts]` The tracer is evidence that a small authenticated seam is structurally possible; it is not a reduced distribution and makes no ChatGPT UI claim.

### Final build-graph result

Root reproduced `node scripts/m001-chatgpt-build-graph.mjs --assert-narrow` at the exact pin: exit 1 with report digest `b6307c8da775a0469e53ba052f50a44900e2631ac2009deb359e9605e7378745`. Standard/web reach `exec` and `navigate`; Deep additionally reaches network capture, frames, and CDP; image reaches `exec`, `navigate`, and conditional file input. `[CONFIRMED — /private/tmp/opencli-m001/clis/chatgpt/ask.js; /private/tmp/opencli-m001/clis/chatgpt/utils.js; /private/tmp/opencli-m001/src/browser/page.ts; /private/tmp/opencli-m001/scripts/m001-chatgpt-build-graph.mjs]`

`[SUPERSEDED RECOMMENDATION]` The experiment was initially interpreted as `CUSTOM_CONTROLLER_FALSIFIER_TRIPPED`. That promoted an unratified capability-absence preference into an adoption gate.

**Final owner decision:** adopt pinned OpenCLI behind the `chatgpt-research` wrapper. Preserve the versioned-template, typed-command, receipt, context, artifact, pacing, privacy, and live-gate contracts in the wrapper. Reopen custom-controller work only if concrete integration evidence—not generic capability presence—shows OpenCLI cannot meet the workflow.
