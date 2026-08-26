# Project Boundary

- Status: pinned OpenCLI plus wrapper protocol selected; M004 standard mode live-verified; M005 rigor profiles implemented and one standard conformance turn observed; M006 production-usability work tracked in a private GitHub milestone; web/deep selectors blocked upstream
- Product: adapter to ordinary signed-in ChatGPT Chat only

## Product intent

`[OWNER DECISION — 2026-08-24]` Codex may act as the owner’s bounded proxy for basic questions and external research instead of requiring manual copy/paste or file attachment. The desired experience uses the owner’s ordinary ChatGPT subscription and preserves the ordinary Chat product experience.

V1 is a research/question handoff system:

1. select a versioned prompt template and wrapper-owned epistemic-rigor profile;
2. create one job and one turn receipt;
3. submit a bounded question and explicitly approved files to an owned ordinary-Chat conversation;
4. return the answer and generated files into a controlled local handoff area;
5. preserve hashes, states, stop/retry decisions, and ambiguous outcomes;
6. expose the narrow local CLI through the custom Codex skill; defer MCP until the receipt and recovery contract is proven.

V1 is not a coding runtime, general browser controller, provider router, autonomous agent platform, repository investigator, project synchronizer, API proxy, or ChatGPT Work product. The OpenAI API is a comparator/control, not a substitute. The internal ChatGPT CLI and Bridgewright projects are owner context only and were not inspected.

## Codex-facing skill contract

`[OWNER DECISION — 2026-08-24]` Codex will invoke a custom `chatgpt-research` skill backed by pinned OpenCLI. OpenCLI's generic `opencli-usage`, browser, smart-search, sitemap, and repair skills are not the supported agent interface. The custom skill owns template selection, source/depth choice, receipts, attention states, output handoff, and the decision to call only an allowlisted OpenCLI command. The protocol governs agent behavior; it is not a capability sandbox around OpenCLI.

| Requested mode | Selection rule | Pinned OpenCLI mapping |
|---|---|---|
| `standard` | Default for basic questions, synthesis from the supplied prompt, or attached context | `chatgpt ask`; no composer tool selected |
| `web` | Current facts, external research, or source links are required | `chatgpt ask --web-search`; mutually exclusive with Deep Research |
| `deep` | Caller explicitly requests broad, long-form investigation and accepts longer/less predictable completion | `chatgpt ask --deep-research` plus result polling |
| `image` | Caller explicitly requests generation or editing and approves inputs/output root | Separate OpenCLI ChatGPT image command |

The skill may recommend `deep` but must not silently escalate to it. It must record the selected mode and reason in the job receipt. A first attempt may not automatically resubmit through another mode after an ambiguous remote effect.

`github` is a future source capability, not a prompt convention. Official OpenAI documentation describes GitHub-capable plugins/connectors, but current OpenCLI source does not expose typed app selection. `[ROOT LIVE OBSERVATION — 2026-08-25]` A bounded standard-mode prompt returned the exact private parent-issue and milestone state and reported that the connected GitHub surface could create an issue with a milestone but exposed no parent/sub-issue operation; it performed no write under the no-partial-issue constraint, and root independently confirmed that no child had been created. This establishes one account/session observation of connected GitHub read access and provider-reported issue-create capability, not a direct schema capture, general reliability, or typed OpenCLI activation. Before `github` can enter the skill schema, a bounded adapter command must identify and select the visible connected app, confirm its active state, fail closed when unavailable, and return that state in the receipt. The skill must never type an `@GitHub` string and assume activation.

## Required interaction contract

| Surface | V1 requirement |
|---|---|
| Templates | Immutable `template_id`, semantic version, body hash, input schema, output expectation, and retirement/supersession state |
| Rigor | Immutable protocol/profile ID, semantic version, content hash, citation level, audit-appendix selection, and custom-profile snapshot identity |
| Job | `job_id`, caller, created time, template and rigor versions, pacing decision, state, and terminal disposition |
| Turn | `turn_id`, attempt number, conversation reference, submitted/accepted/unknown/completed times, answer hash, and explicit prior-attempt relationship |
| Input files | One approved handoff root; canonical no-follow paths; type/size/count policy; manifest and SHA-256 before submission |
| Answer | Sanitized text/Markdown plus source/conversation reference where observable; no passive history harvesting |
| Generated files | Controlled output root, normalized filename, MIME/type, size, SHA-256, provenance, collision-safe naming, and no automatic execution/opening |
| Concurrency | One active ChatGPT writer in V1; bounded queue; token-bucket pacing and cooldown state |
| Stop | User-visible queued cancel and in-flight stop request; receipt must distinguish requested, confirmed, and unknown remote outcome |
| Retry | Never retry a write merely because a transport result was lost; inspect state or require owner action after ambiguous effect |
| Recovery | Append-only events plus materialized current state; restart must not duplicate a possibly submitted question |

Terminal/attention states are `completed`, `cancelled`, `rejected`, `rate_limited`, `auth_required`, `permission_missing`, `ambiguous_effect`, and `attention_required`. “Failed” is insufficient when the remote effect is unknown.

## Controlled profile and browser authority

`[SUPERSEDED OWNER DECISION — 2026-08-24]` The initial design required one dedicated ChatGPT-only browser profile and excluded the owner's normal Chrome profile.

`[OWNER DECISION — 2026-08-24]` Operate on the owner's local Mac using the explicitly selected persistent OpenCLI Browser Bridge installation in normal Chrome. The owner intentionally logged in and accepted incidental bookmark visibility and the extension's disclosed browser permissions. The wrapper still targets ChatGPT operations only; this decision is not a request to enumerate unrelated tabs, history, cookies, local storage, extensions, or account content, and no remote orchestration is authorized.

The supported Codex-facing surface is a typed ChatGPT research protocol. The wrapper exposes only:

- `submit_question`
- `get_status`
- `get_answer`
- `list_result_files`
- `cancel`
- `acknowledge_attention`

The wrapper does not call or instruct agents to call raw JavaScript, CDP passthrough, cookie reads/exports, screenshots, network capture, arbitrary tabs, user-tab binding, unrestricted file-input paths, history scraping, OS file opening, or arbitrary downloads. OpenCLI may retain such primitives internally or in its broader CLI. Their presence is a disclosed upstream characteristic, not an adoption failure. Direct use outside the wrapper is unsupported by this product.

`[OWNER DECISION — 2026-08-24]` Keep the operating location local; no remote orchestration is part of V1. `[OBSERVATION]` Upstream binds the daemon to loopback and checks browser origins but does not provide secret application authentication. `[RECOMMENDATION]` Do not tunnel or intentionally expose that listener. Per-install authentication and exact extension-origin binding remain optional hardening contributions, not adoption prerequisites.

## Privacy and retention

Local state may contain template metadata, append-only job/turn events, sanitized answers, approved-file manifests, output hashes, pacing state, and bounded diagnostics. It must not contain exported session/access tokens, raw cookie values, raw browser profiles, unrelated history, full-page HTML, full-page screenshots, clipboard copies, or broad network captures.

Prompt and answer bodies require an explicit retention window. Receipts retain hashes and minimal metadata after content expiry. Diagnostic collection is opt-in, scoped to the owned ChatGPT surface, redacted before persistence, size bounded, and separately deletable. Generated files are inert outputs; the adapter never executes, imports, applies, opens, or commits them.

## Safety and permission boundaries

The owner requires responsible pacing, but rate limiting does not expand authority. The adapter must stop and require visible attention on rate-limit, challenge, authentication, quota, consent, or policy signals. It must not:

- disguise automation or falsify browser properties;
- use stealth/Patchright-style evasion;
- bypass or solve challenges;
- extract/export cookies or access tokens;
- circumvent rate limits, restrictions, or protective measures;
- retry through provider refusal;
- expose a tunnel or public control plane.

`[CONFIRMED — https://openai.com/policies/row-terms-of-use/ — “Automatically or programmatically extract data or Output”]` Current individual Terms create an unresolved permission-to-operate risk for the core answer-return path. Technical feasibility, owner authorization, and responsible operation do not by themselves settle that external contract. This package is not legal advice. `[OWNER DECISION — 2026-08-24]` The owner accepts that unresolved risk for bounded local operation and does not treat it as a technical release blocker; mass extraction and restriction bypass remain outside scope.

Official plugin/MCP documentation supports the opposite direction: ChatGPT discovers and calls a server tool, then uses the tool result in the conversation. `[CONFIRMED — https://developers.openai.com/plugins/concepts/mcp-server — “The model selects a tool”; “uses the result to continue the conversation”]` That can provide inputs/tools to ChatGPT but does not establish a supported return channel for ChatGPT’s ordinary-Chat answer to Codex.

## OpenCLI adoption rule

OpenCLI is acceptable when the custom skill can reliably map its research protocol to the necessary OpenCLI ChatGPT commands, preserve receipts and user-visible recovery, and keep direct generic operations outside the supported workflow. Adoption does not require deleting unrelated commands, adapters, or extension capabilities from upstream.

Concrete integration failures—not the mere presence of generic internals—can reopen adopt/fork/build. Examples include inability to return the expected answer, unacceptable selector instability, failure to preserve ambiguous outcomes, unusable foreground disruption, or inability to constrain approved file paths in the wrapper.

### M001 outcome

`[OBSERVATION — pinned source at 87b60a36590c3e2a466c37266c3348d73d7f68fe]` Standard `chatgpt ask` uses `page.evaluate` and `page.goto`; Web uses the same path; Deep adds network capture, frames, and CDP; image adds conditional file input. The package retains the generic daemon route, browser/CDP exports, other adapters/skills, broad permissions, and `<all_urls>`.

`[OWNER DECISION — 2026-08-24]` Those facts describe OpenCLI's implementation and risk surface. They do not disqualify it. The wrapper protocol, dedicated profile, local-only operation, and responsible workflow are the selected integration boundary.

### M002 outcome

`[OBSERVATION — local source and deterministic tests, 2026-08-24]` The dependency-free Node.js wrapper now implements only `chatgpt-research prepare`. It requires an explicit template ID/version, defaults only an omitted mode to `standard`, requires explicit `web`/`deep`/`image` selection and reason, compiles exact prompt bytes, and publishes a write-once prepared bundle containing `events.jsonl`, `current.json`, and `prompt.txt`. The receipt records `transport_status: not_dispatched`; there is no submit, browser, account, provider, or OpenCLI execution path.

`[ROOT IMPLEMENTATION DECISION — 2026-08-24]` The M002 authority gate uses a package-manifest SHA-256 pin for every production JavaScript file, plus exact file/import/package allowlists and fail-closed mutation checks. This makes source drift review-visible; it is corroboration of the reviewed local source boundary, not a signature, tamper-resistant package, JavaScript sandbox, or OS-level proof that network activity is impossible.

M002's two-event schema and write-once prepared bundle remain provisional pre-dispatch contracts. They do not satisfy V1 append-only restart recovery, pacing, cancellation, files, or general retry/reconciliation.

### M003 outcome

`[OWNER DECISION — 2026-08-24]` The owner approved the wrapper-first M003 design, its exact pinned installation/dedicated-profile protocol, and one harmless signed-in smoke while explicitly accepting the unresolved contract/account risk for that bounded test.

`[OBSERVATION — local source and deterministic tests, 2026-08-24]` The wrapper now exposes one additional operation, `submit-once`, for validated `standard` bundles only. It preflights an exact OpenCLI v1.8.7 executable, durably writes one dispatch intent, invokes the fixed no-shell `chatgpt ask` argv once, and records either a hash-bound completed answer/reference or terminal `ambiguous_effect`. Existing intent refuses all subsequent invocation before an executable process. There is no retry, Web/Deep/image dispatch, files, continuation, queue, browser control, network module, or wrapper dependency.

`[ROOT VERIFICATION — 2026-08-24]` The offline suite passed 60/60 tests; ten independent repeat runs exited zero; 23/23 JavaScript files passed syntax checks; the closed source/import/package authority check passed; and the package dry-run contained 18 declared files. The sole production child-process import is in `src/opencli-transport.js`. These results establish the local fake-transport contract, not provider/UI behavior.

`[OBSERVATION — exact installed OpenCLI v1.8.7, 2026-08-24]` Registry, release, tarball, executable, adapter, and matching Browser Bridge identities were verified and recorded in `M003-LIVE-RECEIPT.md`. OpenCLI hard-codes part of its user runtime beneath `os.homedir()` despite `OPENCLI_CONFIG_DIR`. The owner explicitly authorized one bounded initialization; after a byte-for-byte backup it created the predicted runtime entries, and `doctor` started daemon v1.8.7 with config/profile state in the temporary root. Cleanup stopped the daemon and restored the pre-existing `~/.opencli` state.

`[OBSERVATION — branded Chrome 151.0.7922.170, 2026-08-24]` The temporary Chrome process accepted `--load-extension` but had no Browser Bridge extension worker, so `doctor` reported the extension missing. Chrome documents that branded builds removed this flag starting in v137 while Chrome for Testing and Chromium retain it. The visible signed-in window/bookmarks were associated with a separately running normal Chrome surface; isolated-profile authentication was not established. Bookmark visibility and the owner's intentional login are not themselves blockers.

`[OWNER DECISION — 2026-08-24]` The owner chose temporary official Chrome for Testing rather than persistent normal-profile installation. Version 151.0.7922.174 loaded the verified bridge in a new user-data directory. Doctor and ChatGPT status established daemon 1.8.7, bridge 1.0.23, connected isolated context, and logged-in ChatGPT before submit.

`[OBSERVATION — one authorized live wrapper attempt, 2026-08-24]` Durable intent preceded exactly one standard-mode ask. The process ended near the configured deadline with `ERR_OPENCLI_EXIT`; no accepted answer or conversation reference exists. The wrapper persisted `ambiguous_effect`, `remote_effect: unknown`, and `retry_decision: prohibited`, and no retry/manual submission occurred. The exact upstream failure is unresolved because the receipt retained only the error class and stderr hash. M003 is terminal. A future live attempt requires a separately approved milestone after an offline bounded/redacted diagnostic design.

`[OWNER DECISION — 2026-08-24]` M004 and live execution were subsequently approved, superseding the M003-only future-live gate. The owner also directed the wrapper to retain useful raw OpenCLI failure text instead of adding a new redaction subsystem for this local tool.

`[OBSERVATION — M004 live operation, 2026-08-24]` A standard-mode wrapper call completed through the persistent Chrome bridge and saved the exact requested answer plus a machine-readable result. The working sequence submits once with `--wait false`, then reads only the returned conversation reference until its completed assistant response is available. Separate `web` and `deep` checks failed before prompt submission because OpenCLI could not select the current ChatGPT Web Search or Deep Research UI controls. Standard local use is established; live web/deep use is not.

`[OWNER DECISION — 2026-08-25]` The wrapper owns a compact epistemic-rigor protocol. `standard` automatically covers substantive claims; `light` and `strict`, expanded citations, an audit appendix, and a versioned custom profile are explicit caller choices. AHR-C v2.0 was supplied as a design example, not adopted as adapter governance. `[OBSERVATION — deterministic local tests, 2026-08-25]` Exact profile selection, prompt bytes, hashes, and prepared/dispatch/result propagation are testable offline. Whether a provider response follows the requested claim ledger remains a separate output-conformance observation.

### M006 setup

`[OWNER DECISION — 2026-08-25]` Create a private GitHub remote and use a parent/sub-issue milestone to drive the smallest remaining production-usability work. The private remote is code-empty: no commit or push was authorized. Milestone `M006 — Production usability` contains parent issue #1 and four direct children for Web Search selection, Deep Research selection, Markdown/GFM preservation, and live expanded-citation/audit-appendix conformance. The approved ChatGPT-connector experiment was limited to one potential child; after it reported no parent-link operation and made no write, root used authenticated `gh` to create all four correctly parented children.

## Decision provenance constitution

- `OWNER DECISION` requires an exact owner statement and date; it controls the product until amended or superseded.
- `OBSERVATION` requires current source, primary-source, artifact, or command evidence.
- `INFERENCE` explains what evidence suggests without turning it into authority.
- `RECOMMENDATION` is advisory and must identify tradeoffs.
- `PROPOSED GATE` is non-binding until the owner explicitly approves that criterion and its consequence.
- General approval to continue or execute does not ratify hidden acceptance criteria.
- Superseded decisions remain visible with the reason and replacing authority.

This constitution can be amended by the owner. Research may inform an amendment, but neither agent caution nor a security recommendation silently changes the owner's risk tolerance.

## Live-smoke gate and rollback

No live smoke was part of M001 or M002. `[OWNER DECISION — 2026-08-24]` M003 authorizes exactly one wrapper-first smoke using the inspected v1.8.7 build, matching Browser Bridge, a new temporary ChatGPT-only profile, manual owner sign-in, no attachment, and prompt `Reply with exactly CHATGPT_RESEARCH_LIVE_SMOKE_OK`. The run must stop before submit on abnormal preflight and after submit on any ambiguous effect; it may not retry. Temporary profile/extension/daemon/install/output state must be removed after minimal evidence is recorded.

`[USER DECISION — 2026-08-24]` The owner approved the offline M001 consequence set: design and fixture-test the prompt compiler and skill contract, create a pinned isolated OpenCLI worktree, reduce its source boundary, and run deterministic synthetic tests. This decision does not cross the live-smoke gate.

Offline rollback is deletion of the isolated fork clone/branch and generated fixtures. A future live rollback must unload/remove the extension, stop the daemon, revoke/delete its local secret, close/delete the dedicated profile if authorized, remove receipts/artifacts according to retention policy, and confirm no listener remains.
