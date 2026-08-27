# M001 — OpenCLI Narrow-Fork Feasibility

- Status: complete 2026-08-24; deletion-only fork falsified; OpenCLI wrapper adoption retained
- Milestone type: offline source reduction and synthetic evaluation
- Live browser/account/provider activity: prohibited

## Decision under test

Can OpenCLI’s maintained ordinary-question, Web Search, Deep Research, image, session-lease, and unknown-effect primitives be separated into the bounded research adapter defined in [PROJECT-BOUNDARY.md](PROJECT-BOUNDARY.md) without retaining its generic browser authority or replacing most of the system? Can a custom Codex `chatgpt-research` skill drive that typed surface while preserving receipts and explicit mode selection?

`[OBSERVATION]` M001 proved that deleting OpenCLI's generic browser authority while retaining its current ChatGPT implementation would become a substantial rewrite. `[SUPERSEDED RECOMMENDATION]` The project briefly treated that as a reason to reject OpenCLI. `[OWNER DECISION — 2026-08-24]` Complete absence is not required; pinned OpenCLI remains selected behind the wrapper protocol.

## Pin and fork strategy

- Base: OpenCLI release `v1.8.7`, commit `87b60a36590c3e2a466c37266c3348d73d7f68fe`.
- Extension: source/release version `1.0.23`; record and compare the release asset digest before any future installation proposal.
- Build source and extension from the exact reviewed revision. Do not use a floating npm dist-tag or Chrome Web Store auto-update channel as the evaluation authority.
- Preserve the Apache-2.0 license and notices.
- Create only an isolated local clone/branch after approval; no remote repository.
- Do not merge current `main` wholesale. Maintain a small patch queue; review and cherry-pick later ChatGPT-specific fixes only after the narrow command graph and tests exist.

## Execution contract

`[USER DECISION — 2026-08-24]` The owner approved this milestone's offline consequence set. Durable decisions remain in these four project documents. The pinned source reduction, fixtures, and test evidence live only in an isolated `/private/tmp` worktree. There is no project repository, remote, extension installation, browser/account connection, or provider operation.

Each spike must begin with a failing test, static assertion, or explicit evidence gap; identify its hypothesis and fastest falsifier; and end with a receipt containing the exact pin, changed files, commands, results, retained uncertainty, and disposition. A passing implementation test cannot promote an inferred UI capability to confirmed. Source facts, fixture behavior, and future live behavior remain separate evidence classes.

### Wave A — contracts and red tests

#### SP-000 — pinned baseline and forbidden-authority graph

- **Hypothesis:** the exact `v1.8.7` ChatGPT path can be enumerated and mechanically checked without executing a browser or installing the extension.
- **Red evidence:** a closed-world static test must initially identify every reachable generic command/permission from all shipped CLI/bin entrypoints, daemon routes, WebSocket messages, extension dispatchers, package exports, lifecycle scripts, generated bundles, and the manifest.
- **Output:** source identity receipt; retained/replaced/deleted graph; generated-artifact allowlist; mutation cases that reintroduce renamed/re-exported forbidden authority; upstream-diff command.
- **Pass:** `HEAD` equals the approved pin; source and built-package inventories are reproducible; and every retained build fails if raw `exec`, CDP, cookies, screenshots, network capture, generic tabs/navigation, `bind`, broad hosts, or outside-root file input becomes reachable. Renaming or wrapping a forbidden capability must not evade the check.
- **Fastest falsifier:** the ChatGPT path cannot be separated from the generic dispatcher without replacing most of transport.

#### SP-001 — versioned prompt compiler and skill schema

- **Hypothesis:** one compiler can apply epistemic standards independently of `standard`, `web`, `deep`, and `image` execution modes.
- **Red tests:** unknown/retired template, same ID/version with changed content, incompatible mode, unversioned rubric, unknown fields, Unicode/BOM/newline/object-key/default normalization drift, nondeterministic time/locale rendering, compiled-versus-transported byte mismatch, prompt/receipt hash mismatch, unapproved command, and silent fallback/escalation or retry after ambiguous effect all fail.
- **Output:** versioned template schema; deterministic compilation contract; mode appendix; custom `chatgpt-research` skill call/return schema; golden prompt fixtures.
- **Pass:** an independently specified canonicalization produces byte-identical prompts and hashes; metamorphic/mutation tests complement golden files; mode and reason are explicit; `standard` is default; `deep` and `image` require explicit selection; and enforcement below the skill layer accepts only the typed adapter surface.
- **Fastest falsifier:** correct routing or receipt identity requires raw OpenCLI/browser skill exposure.

#### SP-002 — bounded inline context bundles

- **Hypothesis:** small text/code inputs can be carried as a deterministic prompt context bundle without pretending they are browser attachments.
- **Red tests:** traversal-like labels; delimiter repetition/nesting/truncation; ambiguous or invalid encoding; NUL/BOM/control/bidi content; binary/sparse/special files; hardlinks; case-folded duplicates; root/parent/file/symlink TOCTOU; secret-like paths; unsupported type; per-file/aggregate/rendered-prompt overflow; and changed-after-hash input fail closed.
- **Output:** normalized context-manifest schema; delimiter/escaping rules; size/type/count policy; SHA-256 identity; adversarial fixtures.
- **Pass:** one no-follow file handle supplies identity, hashing, and bytes; compilation preserves boundaries and provenance, never reads outside the approved input root, and receipts distinguish inline context from true attachment. Fixtures corroborate encoding and structure only; model obedience to the data/instruction boundary remains a live uncertainty.
- **Fastest falsifier:** safe delimiting materially harms fidelity or requires unbounded prompt/file access.

#### SP-003 — text artifact envelope and rooted materialization

- **Hypothesis:** text/Markdown/JSON/code outputs can be returned as explicit artifact envelopes and safely materialized without generic browser downloads.
- **Red tests:** absolute/traversal/symlink paths; multiple, quoted, truncated, nested, duplicate-key, or trailing-content envelopes; duplicate/case/Unicode-colliding names; unsupported or content-mismatched media type; per-file/aggregate overflow; output-root/parent/symlink races; concurrent writers; disk-full/short-write/crash cleanup; overwrite; parser recovery; and executable/open-on-write behavior fail.
- **Output:** envelope grammar; parser/materializer contract; controlled output manifest; collision-safe naming; golden and adversarial fixtures.
- **Pass:** answer text remains distinct from artifact data; creation is atomic and no-follow; the materializer hashes exact written bytes rather than trusting a model-supplied hash; every file is inert, rooted, normalized, receipted, and has no adapter hook that opens, executes, applies, imports, or commits it.
- **Fastest falsifier:** reliable extraction requires accepting arbitrary HTML/download behavior or ambiguous parser recovery.

Sol High independently reviewed the Wave A/B red matrix as `M001-RED-MATRIX-20260824` and returned `CONCUR_WITH_CHANGES`. The corrections above and below are accepted. Root owns the disposition; the advisor altered no shared files.

### Wave B — pinned OpenCLI tracer

#### SP-004 — narrow command, transport, receipt, and recovery slice

- **Hypothesis:** OpenCLI's useful lease/journal/unknown-effect primitives can support `submit_question`, `get_status`, `get_answer`, `list_result_files`, `cancel`, and `acknowledge_attention` after generic authority is deleted.
- **Red tests:** forbidden command reachability; missing/wrong secret; wrong or duplicate extension identity; non-loopback bind; unauthenticated no-Origin caller; same command ID with a different caller/payload/action/context/session; wrong/late/duplicate result; result before extension hello; malformed/oversized peer frames; corrupted/truncated/evicted journal; crash before durable intent, after durable intent but before dispatch, and after dispatch before result; lost result; queue full; writer death; restart; queued versus in-flight cancel races; illegal receipt transitions; privacy/expiry/deletion; and selector/payload drift.
- **Output:** smallest source patch/fixture slice in the pinned temporary worktree; command graph; append-only receipt transitions; fake daemon/extension peers; patch-size and retained-authority measurement.
- **Pass:** only typed commands reach an adversarial fake extension; exact daemon secret and extension identity are checked before journal/lease/dispatch mutation; command ID binds to a canonical command digest and install identity; durable intent precedes dispatch; one writer and a queue of at most four are deterministic; possible remote effect becomes `ambiguous_effect` and is never automatically resubmitted.
- **Fastest falsifier:** authentication, receipts, cancellation, or authority deletion replaces rather than extends most retained OpenCLI transport.

The approved per-install bearer secret does not by itself prevent replay by a party that has stolen it. Nonce/counter or challenge-response design is deferred; M001 must record this residual risk rather than claim a replay-proof secret gate.

Terra High owns the first bounded tracer implementation in the isolated worktree. It receives the reviewed red matrix, may not use descendants, and must not run networked installs, a browser, an extension, or provider traffic. Root inspects the diff and reruns deterministic checks before accepting any result.

### Wave C — offline capability probes and live proposal

#### SP-005 — GitHub connector activation probe

- **Hypothesis:** a future typed selector could verify visible connector state without raw JavaScript/CDP or a prompt-only `@GitHub` convention.
- **Offline result:** source/fixture evidence may prove only that a bounded command is structurally possible or absent; it cannot confirm account/UI availability.
- **Pass/defer:** an explicit unavailable/active/unknown state can be represented and fail closed. Defer if real selectors require live observation.
- **Falsifier:** implementation requires generic browser authority. No live connector test is authorized.

#### SP-006 — true attachments and binary/generated-file probe

- **Hypothesis:** approved conversation attachments and returned files can use typed, rooted primitives distinct from Project knowledge and generic downloads.
- **Offline result:** map existing upload/image/download paths and fixture-test roots, manifests, identity, limits, collision, and inert return.
- **Pass/defer:** image support may proceed separately; text artifacts may use SP-003; true document attachments and binary/ZIP return may defer.
- **Falsifier:** the retained path needs arbitrary file-input paths, Project persistence, history scraping, or generic download/network capture.

#### SP-007 — one-live-smoke proposal and mode comparison design

- **Hypothesis:** offline success can be converted into one observable, reversible single-mode test without automatic retries or hidden mode escalation.
- **Output:** proposal only—exact build digests, profile, one harmless `standard` prompt, expected UI evidence, pacing, stop/abort rules, receipts, cleanup, and separate optional later proposals for `web`, `deep`, connector, and file tests.
- **Pass:** the proposal has one smallest one-mode test and an explicit owner approval point. A three-mode comparison is a distinct multi-turn approval. SP-007 performs no live action.
- **Falsifier:** no bounded test can answer the remaining uncertainty without broader authority than V1 permits.

### Sequence and ownership

1. Root freezes this spike contract and source pin.
2. Sol High reviews the Wave A/B red matrix and missing adversarial cases.
3. Root accepts/revises the matrix and creates the detached pinned worktree.
4. Terra High implements SP-000 plus one production-path synthetic `submit_question` envelope: exact auth/identity, command-digest binding, and the before/after-dispatch crash distinction against an adversarial fake extension. It makes no selector/UI claim. Later slices are assigned only after root validation.
5. Root reruns the focused suite, inspects the authority graph/diff, and records accept, revise, or park.
6. SP-001 through SP-003 proceed as independent thin slices; SP-005 through SP-007 start only after the command boundary is credible.
7. Root updates all four documents with measured evidence and the fork/custom recommendation.

This milestone does not authorize a production adapter, installed skill, shipped CLI/MCP tool, extension installation/loading, real profile, browser operation, or provider endpoint.

### Checkpoint 1 — authenticated transport tracer

Disposition at that checkpoint: **accepted with concerns; not operational; advanced only to the build-graph falsifier.** Checkpoint 2 below subsequently closed M001.

- Sol High review `M001-RED-MATRIX-20260824`: `CONCUR_WITH_CHANGES`; root integrated the critical false-green corrections.
- Terra High worktree: detached exact pin `87b60a36590c3e2a466c37266c3348d73d7f68fe`; 412 reported non-test lines, four production files, no runtime dependency, three patch groups.
- Focused root verification: 8/8 tests passed; typecheck and `git diff --check` passed; ten consecutive focused runs passed; local build succeeded and generated 1,332 manifest entries.
- Root security revision: the first worker version trusted a self-asserted extension ID. A new red test forced binding of `research_hello` to the exact WebSocket upgrade Origin, message ID, and secret; the revised 8-test suite passed.
- Package inspection: `npm pack --dry-run --json --ignore-scripts` succeeded from a temporary npm cache and reported 2,353 files.
- Expected RED: `node scripts/m001-authority-inventory.mjs --assert-narrow` exits 1 because generic `/command`, raw extension actions, broad permissions/hosts, unrelated adapters, and generic skills remain.
- Evidence limit: the post-dispatch crash test injects failure in a running process. A physical crash cannot append the synthetic `ambiguous_effect` record, and restart reconstruction is absent. No selector, extension handler, answer path, or live behavior was tested.

Checkpoint decision: proceed only to the **build-graph reduction falsifier**. Before adding prompt, file, connector, or skill implementation, determine whether the shipped ChatGPT path can be represented by a narrow package/extension allowlist without raw generic actions. If not, stop the fork and recommend a custom controller.

### Checkpoint 2 — build-graph falsifier and closure

Historical test disposition: **`CAPABILITY_MINIMIZATION_FALSIFIER_TRIPPED`; stop deletion-only fork work.** This does not stop wrapper adoption.

- Reproducible command: `node scripts/m001-chatgpt-build-graph.mjs --assert-narrow` at the exact detached pin exits 1: `standard ask reaches forbidden generic authority`.
- Root reproduced digest `b6307c8da775a0469e53ba052f50a44900e2631ac2009deb359e9605e7378745` and spot-checked the call path.
- Standard/web: `ask.js` calls ChatGPT utilities that use `page.evaluate` and `page.goto`; `Page` maps them to generic `exec` and `navigate`.
- Deep: the retained result reader additionally reaches `network-capture-start`, `network-capture-read`, `frames`, and `cdp`.
- Image: the retained path reaches `exec`, `navigate`, and conditional `set-file-input`.
- Direct command closure measured 4,031 LOC for standard/web, 4,153 for deep, and 4,069 for image; the shared generic execution/transport slice measured 6,976 LOC. These are inventory measurements, not minimum rewrite estimates.
- The deterministic graph self-test passed twice with byte-identical output digest `e8c1e60c98be2c529b577653f786e68b999e13124f0baea629ec6f781425530e`; focused tracer tests remained 8/8 green; typecheck and `git diff --check` passed.
- Source observation only: no browser, extension, selector, account, provider, or live ChatGPT behavior was exercised.

This directly satisfies the historical capability-minimization falsifier below. Replacing the composer/navigation/evaluation behavior would be a new controller embedded in an OpenCLI-shaped tree, so that deletion effort stops. SP-001 through SP-003 carry forward to the OpenCLI wrapper layer; SP-005 through SP-007 remain separately approval-gated capability and live probes.

## Deterministic gates

Each receipt separates: **source observation**, **fixture result**, and **future-live status** (`not tested`, `deferred`, or separately approved). A fixture pass never changes a future-live status.

| Gate | Offline pass condition | Future-live status in M001 |
|---|---|---|
| Source identity | Exact detached commit, extension version, lockfiles, license, release metadata, dependency inventory, package exports, lifecycle scripts, and built artifacts recorded | Not applicable |
| Command graph | Closed-world source/build allowlist plus mutation tests; only typed research commands can reach the fake extension | Not tested |
| Authentication | Missing/wrong secret, wrong/duplicate extension identity, non-loopback bind, web Origin, and unauthenticated no-Origin client fail before mutation/dispatch | Not tested; bearer replay remains residual |
| Command identity | Command ID binds to canonical bytes plus install/caller/context identity; any mismatch rejects before attach/replay | Not tested |
| Files | Outside-root, traversal, hardlink/symlink/TOCTOU escape, special/unsupported file, excess count/bytes, and changed identity fail closed | Not tested |
| Receipts | Every legal transition and all illegal transitions tested; intent durable before dispatch; hashes and ambiguous outcome survive restart/corruption fixtures | Not tested |
| Retry | Lost post-dispatch result never duplicates submit; same ID/same digest attaches, same ID/different digest rejects | Not tested |
| Concurrency | One active writer; queue capacity four; fifth queued job receives deterministic `rejected`/`attention_required` receipt | Not tested |
| Stop | Queued cancel and in-flight requested/confirmed/unknown states survive races and restart | Not tested |
| Selector/backend drift | Sanitized fixtures yield typed failure for missing/changed signals, never guessed success | Deferred: fixtures do not validate current UI |
| Skill routing | Canonical compiler and enforcement layer default to `standard`; `deep`/`image` require explicit selection; selected mode is receipted | Not tested |
| Connector state | Offline schema supports active/unavailable/unknown and fails closed | Deferred until separately approved observation |
| Privacy | Adversarial peers cannot place cookies/tokens/profile state/full-page captures in receipts; retention and deletion tests pass | Not tested |
| Complete offline suite | Locked install uses controlled lifecycle scripts; focused suite, typecheck, lint/build, generated-artifact audit, and ten repeat runs pass with stable fixture hashes | Not tested |

Package-manager fetching is allowed only into `/private/tmp` as the owner previously authorized; it is not ChatGPT/provider operation. Record registry access and keep lifecycle scripts disabled until reviewed. If the exact locked dependencies are unavailable, the install gate fails rather than floating versions.

For M001, “small patch” means the first tracer changes no more than 1,500 non-test lines across 15 production files, adds no runtime dependency, and forms no more than three independently reviewable long-lived patch groups. “Replaces most” means new/replaced production lines exceed retained production lines in the transport slice. Exceeding either threshold triggers the custom-controller recommendation unless root records a narrower disconfirming measurement. “Reachable” means present in the closed-world source/build command graph. “Deterministic” means ten consecutive focused runs with identical fixture/receipt hashes and no network, browser, extension, or provider dependency after installation.

## Historical deletion-only falsifiers

These criteria evaluated an assistant-proposed capability-minimized fork. They are preserved for auditability but are not current OpenCLI adoption gates.

Stop M001 and recommend a custom narrow controller if any of these occur:

1. The retained ChatGPT path still requires raw `exec`, cookies, broad `<all_urls>`, generic navigation, CDP passthrough, network capture, or user-tab binding.
2. Exact daemon/extension authentication cannot be added without keeping the generic command server or rewriting most of transport.
3. Ordinary conversation attachments and general generated-file return require broad project/history/network authority rather than a bounded new primitive.
4. The receipt, cancel, concurrency, and ambiguous-effect contract replaces rather than extends the retained execution/session model.
5. More than a small, reviewable ChatGPT-specific patch queue is required to stay current with upstream.
6. The complete narrowed offline suite cannot be made deterministic from the pinned source and dependency set.

GitHub connector support may be **deferred without failing the entire adapter** if the ordinary, web, and Deep Research paths pass and the connector requires a distinct later live-observation gate. It becomes a fork falsifier only if implementing the requested source requires retaining generic browser/CDP authority in the operational build.

The result may also be **hybrid/custom warranted**: reuse no runtime code, but carry forward Apache-licensed ideas only where provenance and license obligations are explicit.

## Live-smoke approval gate

Passing M001 does not authorize a live smoke. A later proposal must separately establish or explicitly accept the permission-to-operate basis and obtain owner approval for one exact test. It must include:

- pinned source/extension digests;
- one dedicated profile and owned tab;
- one harmless text prompt, no files by default;
- one active turn and conservative pacing;
- visible start/stop and abort on auth, challenge, quota, policy, rate-limit, selector ambiguity, or unexpected navigation;
- no stealth, disguise, cookie export, challenge handling, remote tunnel, or retry after ambiguous effect;
- exact receipts retained and exact profile/extension/daemon cleanup.

## Rollback

M001 rollback is fully local: stop work, preserve the decision report, then delete the isolated fork clone/branch, dependency caches if authorized, and generated synthetic fixtures. No account, browser, extension, provider, remote repository, or deployment state should exist.

If the feasibility result is negative, update all four project artifacts to record **custom controller warranted** and the specific falsifier. Choosing between a new controller and any owner-supplied older internal controller would require a new authority boundary; this project does not inspect that internal code.

## Decision and next approval

`[SUPERSEDED RESULT — 2026-08-24]` M001 initially closed the OpenCLI route using an unratified capability-absence gate.

`[OWNER DECISION — 2026-08-24]` OpenCLI remains the adoption route. The wrapper is the supported protocol; generic upstream capabilities may remain.

`[M002 FOLLOW-ON — 2026-08-24]` The local/offline wrapper foundation now implements the versioned template compiler, typed mode selection, and write-once pre-dispatch receipts. Pacing, handoff, controlled OpenCLI command mapping, installation, and a signed-in smoke remain later work; installation and live operation remain explicit approval-gated steps.

`[M005 FOLLOW-ON — 2026-08-25]` SP-001's previously deferred versioned epistemic rubric is now implemented as a separate wrapper-owned `chatgpt-research-epistemic` profile layer. `standard` is the default, `light` and `strict` are explicit alternatives, expanded citations and an audit appendix are independent options, and an absolute custom JSON profile is supported through the same closed schema. Exact profile and prompt identities propagate through prepared, dispatch, and direct-result records. The owner supplied AHR-C v2.0 as an example only; it is not adopted or vendored by this adapter. Deterministic prompt checks do not promote model output conformance to established behavior.

`[M003 FOLLOW-ON — 2026-08-24]` The owner subsequently approved a wrapper-first one-shot standard transport and one bounded live smoke. The transport is implemented and verified offline. Exact v1.8.7 and Browser Bridge identities were inspected; an owner-selected temporary official Chrome for Testing context passed daemon/extension/login preflight. The single wrapper attempt ended with terminal `ambiguous_effect` (`ERR_OPENCLI_EXIT`, remote effect unknown) and was not retried. User-runtime state was restored. Future live work requires offline diagnostic design and separate authorization. This follow-on does not rewrite M001's source observations or deletion-only falsifier result.
