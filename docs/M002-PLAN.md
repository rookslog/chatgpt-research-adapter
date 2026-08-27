# M002 — Offline Wrapper Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for every production behavior. Root owns integration and document propagation; workers must not commit.

- Status: implementation complete locally/offline 2026-08-24; live and installation boundaries remain closed
- Milestone type: local/offline executable vertical slice
- Live browser/account/provider activity: prohibited

**Goal:** Build a dependency-free `chatgpt-research prepare` path that validates a typed request, selects an explicit research mode, compiles and hashes a pinned prompt template, and durably creates job/turn receipts without dispatching anything to OpenCLI or ChatGPT.

**Architecture:** A small Node.js ESM library separates mode validation, canonical serialization, template loading/compilation, write-once prepared-bundle persistence, and orchestration. A thin CLI accepts one JSON request file and an output root. The terminal result is a locally prepared job whose receipt explicitly says `transport_status: not_dispatched`; there is no transport or browser module in M002.

**Tech stack:** Node.js 26 standard library, `node:test`, ESM, JSON/JSONL, SHA-256. No runtime or development dependencies and no package installation.

---

## Decision under implementation

`[OWNER DECISION — 2026-08-24]` The first implementation phase is authorized locally and offline. The wrapper remains the supported Codex-facing protocol over pinned OpenCLI; this milestone implements only the pre-dispatch contract.

`[ROOT IMPLEMENTATION DECISION — 2026-08-24]` Use dependency-free Node.js ESM for the first slice. This is reversible because no public package or remote exists. It minimizes the future seam to OpenCLI's JavaScript CLI and lets the repository run deterministic tests without installing dependencies.

Alternatives considered:

- Python standard library: equally dependency-free, but adds a cross-runtime seam to the selected JavaScript upstream.
- TypeScript: stronger compile-time checking, but requires selecting and installing a compiler before the offline contract earns that complexity.

Load-bearing assumption: the wrapper can establish its request, compilation, and receipt contracts without importing or invoking OpenCLI. Reopen the stack decision if a later pinned integration slice demonstrates that process isolation or a different runtime materially improves the authority boundary.

## Authority and scope

M002 may create local source, fixtures, receipts in temporary test directories, and deterministic test output. It must not:

- import, install, clone, or execute OpenCLI;
- connect to an account, browser, extension, provider, or network endpoint;
- read cookies, profiles, unrelated files, or conversation history;
- create a remote, publish, deploy, run a live smoke, or commit;
- claim that selectors, attachments, connectors, generated files, or provider behavior work.

The first slice supports one operation:

```text
prepare(request, outputRoot) -> prepared job summary
```

It does not support submit, poll, answer retrieval, cancellation, retry, attachments, or output materialization. Those operations remain named protocol requirements, not implemented behavior.

## File map

| Path | Responsibility |
|---|---|
| `package.json` | Private, dependency-free ESM package, deterministic test script, and exact production-source SHA-256 pins |
| `bin/chatgpt-research.js` | Executable entry point that delegates to the CLI module |
| `src/cli.js` | Parse `prepare --request <path> --output-root <path>` and return stable JSON/errors |
| `src/canonical-json.js` | Recursively sort object keys and serialize canonical JSON |
| `src/strict-json.js` | Parse a JSON request while rejecting duplicate object keys and trailing content |
| `src/modes.js` | Validate `standard`, `web`, `deep`, and `image`; default only omitted mode to `standard` |
| `src/template-registry.js` | Load an exact template ID/version through a bounded no-follow path and validate body plus semantic-manifest identity |
| `src/compiler.js` | Validate request fields, render placeholders, canonicalize the mode appendix, and hash exact UTF-8 prompt bytes |
| `src/receipts.js` | Build and publish one write-once prepared bundle through a unique staging directory |
| `src/prepare.js` | Coordinate mode, template, compiler, IDs/clock, and receipt creation without transport |
| `scripts/m002-authority-check.js` | Enforce exact production-source pins plus the positive file/import/package allowlist and reject dynamic authority |
| `templates/registry.json` | Pin each accepted template ID/version to its semantic `template_sha256` |
| `templates/research-question/1.0.0.json` | Immutable first template manifest and body |
| `test/fixtures/golden-prompt.utf8` | Checked-in literal prompt bytes used as an independent compiler oracle |
| `test/modes.test.js` | Mode defaulting and rejection tests |
| `test/compiler.test.js` | Template identity, canonical prompt, and hash tests |
| `test/receipts.test.js` | Durable event/current-state and duplicate-job tests |
| `test/prepare-cli.test.js` | End-to-end offline prepare path and CLI boundary tests |
| `test/authority-check.test.js` | Mutation tests for forbidden imports, dynamic loading/evaluation, package scripts, and file drift |

## Request and receipt contracts

Accepted request keys are exact; unknown keys fail closed:

```json
{
  "template_id": "research-question",
  "template_version": "1.0.0",
  "question": "Compare the two bounded approaches.",
  "mode": "standard",
  "mode_reason": "No current external sources are required."
}
```

`mode` may be omitted, in which case it becomes `standard`. If supplied, it must be one of `standard`, `web`, `deep`, or `image`. An invalid or empty supplied value fails; there is no fallback. `web`, `deep`, and `image` therefore require an explicit value in the request. `mode_reason` is required for any explicitly supplied non-standard mode and optional for explicit `standard`; supplying a reason while omitting mode fails as ambiguous. Defaulted standard records the fixed reason `default`.

The CLI uses a duplicate-key-rejecting JSON parser; duplicate object names, trailing content, a BOM before the document, or a non-object top level fail before filesystem mutation. The request file is limited to 64 KiB, `question` to 32 KiB of UTF-8, `mode_reason` to 2 KiB, the template body to 32 KiB, and the compiled prompt to 64 KiB. Questions and reasons reject NUL, unpaired UTF-16 surrogates, and bidi-format control characters; other valid Unicode is preserved without NFC/NFD normalization. LF and CRLF are preserved and therefore hash differently. U+2028 and U+2029 are valid and preserved.

The compiler renders exact UTF-8 bytes:

```text
<template body with {{question}} replaced>

--- chatgpt-research mode ---
{"mode":"standard","reason":"No current external sources are required."}
```

The template manifest stores `template_id`, semantic `version`, `status: active`, `supersedes`, `body`, `body_sha256`, allowed input keys, supported modes, and `output_expectation`. It also stores `template_sha256`, calculated over canonical semantic manifest content excluding only `template_sha256` itself. A separate `templates/registry.json` pins each accepted ID/version to the expected semantic hash. The loader recalculates both digests and compares the semantic digest to the registry pin; even a manifest mutation accompanied by a recomputed self-declared digest fails under the same ID/version. A retired template, wrong ID/version, unsupported mode, missing placeholder, extra placeholder, or unresolved placeholder also fails before a receipt is written. Receipts preserve both digests.

Template IDs must match `/^[a-z][a-z0-9-]{0,63}$/`; versions must be canonical three-component SemVer without build metadata for M002. Dot segments, separators, backslashes, percent escapes, and Unicode lookalikes are rejected rather than normalized. The loader resolves the candidate under the real template root, rejects symlinked version directories/files, opens the file once with no-follow semantics where the platform supports them, and uses bytes from that handle for parsing, identity, and compilation.

The body is parsed before substitution and must contain exactly one `{{question}}` token and no other placeholder token. Replacement occurs once with the question treated as opaque data; placeholder-like strings, braces, quotes, and the mode delimiter inside the question are preserved and never reparsed.

The published job directory is `<outputRoot>/jobs/<job_id>/` and contains:

- `events.jsonl`: the exact two canonical event lines for this prepared bundle;
- `current.json`: canonical materialized prepared state;
- `prompt.txt`: exact compiled bytes, hashed by the wrapper.

M002 publishes one **write-once prepared bundle**; it does not yet claim a generally appendable or restart-recoverable ledger. The persistence layer creates a unique sibling staging directory, creates each file exclusively, writes and syncs exact bytes, syncs the staging directory where supported, and then publishes the directory once. Claims of atomic publication and no overwrite are bounded to cooperative writers on the same local filesystem. Injected failures exercise every mutation boundary, but temporary-directory tests do not establish physical power-loss durability or adversarial-filesystem guarantees. An abandoned staging directory remains distinctly named and recognizable for a later cleanup/recovery slice.

The production authority inventory is also closed-world. `package.json` pins the exact SHA-256 bytes of every production JavaScript file, including the checker, while the checker independently validates the exact file set, per-file static import allowlist, empty dependency sets, package scripts, and forbidden authority mutations. Any production-source edit requires a deliberate pin update. Raw comment openers and non-allowlisted raw Unicode escapes fail closed in this M002 source surface. These checks corroborate reviewed-source drift; they are not a signature, hostile-tamper defense, runtime sandbox, or OS-level network proof.

The initial event sequence is exactly:

1. `job_created`
2. `turn_prepared`

The event schema is provisional pre-dispatch schema `m002.prepared.v1`; it cannot be promoted unchanged to the full V1 lifecycle merely because this slice passes. `job_created` requires and permits: sequence 1, UTC event time, job ID, caller `codex`, template identity and both hashes, selected mode/reason, pacing decision `not_applicable_pre_dispatch`, and job state `preparing`. `turn_prepared` requires and permits: sequence 2, the same job ID, turn ID, `attempt: 1`, `prior_turn_id: null`, prompt SHA-256, turn state `prepared`, and `transport_status: not_dispatched`. It explicitly carries null conversation reference, submitted/accepted/unknown/completed times, answer hash, and remote effect. Remote or terminal values in a prepared event are illegal.

`current.json` materializes the corresponding job and turn fields without flattening their ownership. Sequences must be monotonic, event job/turn linkage must agree, timestamps must be valid canonical UTC strings, and job/turn IDs must be unique in their declared scope. IDs and clocks are injected into `prepare()` for deterministic tests; the CLI supplies `crypto.randomUUID()` and the current UTC time.

## TDD execution tasks

### Task 1: Package shell and mode contract

**Files:**
- Create: `package.json`
- Create: `src/modes.js`
- Create: `test/modes.test.js`

- [x] **Step 1 — RED:** Add focused tests that call `resolveMode(undefined)` and expect `{ mode: "standard", reason: "default" }`; accept all four literal modes; require a non-empty reason for explicit `web`, `deep`, and `image`; and reject `""`, unknown strings, numbers, and silent fallback.
- [x] **Step 2 — prove RED:** Run `node --test test/modes.test.js`. Expected: failure because `src/modes.js` does not exist.
- [x] **Step 3 — GREEN:** Implement and export:

```js
export const MODES = Object.freeze(["standard", "web", "deep", "image"]);
export function resolveMode(requestedMode, requestedReason) {}
```

The implementation defaults only `undefined`, preserves an explicit standard reason when supplied, and returns frozen plain data.
- [x] **Step 4 — prove GREEN:** Run `node --test test/modes.test.js`. Expected: all mode tests pass with no warnings.

### Task 2: Canonical JSON and pinned prompt compilation

**Files:**
- Create: `src/canonical-json.js`
- Create: `src/template-registry.js`
- Create: `src/compiler.js`
- Create: `templates/registry.json`
- Create: `templates/research-question/1.0.0.json`
- Create: `test/fixtures/golden-prompt.utf8`
- Create: `test/compiler.test.js`

- [x] **Step 1 — RED:** Add tests for recursive key sorting and a checked-in literal UTF-8 prompt fixture with a precomputed literal SHA-256 that is not produced by the compiler under test. Compare `Buffer` bytes, not only strings. Cover NFC/NFD distinction, LF/CRLF distinction, U+2028/U+2029 preservation, rejection of unpaired surrogates/NUL/bidi controls, and one-byte mutations in body, question, reason, and mode appendix. Test opaque single replacement with questions containing `{{question}}`, another placeholder token, the mode delimiter, braces, quotes, and non-ASCII text.
- [x] **Step 2 — RED manifest identity:** Mutate ID, version, status, supersession, body, allowed inputs, supported modes, and output expectation one field at a time under the same declared identity. Require registry-pin mismatch for every semantic mutation, including when the mutated manifest's self-declared `template_sha256` is recomputed; require `body_sha256` mismatch for an unrehashed body mutation. Add traversal, malformed SemVer, symlinked registry/directory/file, missing/extra/unresolved placeholder, empty question, unsupported mode, and size-boundary cases.
- [x] **Step 3 — prove RED:** Run `node --test test/compiler.test.js`. Expected: failure because compiler modules and template do not exist.
- [x] **Step 4 — GREEN:** Implement these public functions with no ambient time or locale input:

```js
export function canonicalJson(value) {}
export async function loadTemplate({ templatesRoot, templateId, templateVersion }) {}
export function compilePrompt({ template, request, resolvedMode }) {}
```

`compilePrompt` returns frozen `{ prompt, prompt_sha256, template_id, template_version, template_sha256, template_body_sha256, mode, mode_reason }`. Hash exact `Buffer.from(prompt, "utf8")` bytes. Canonical semantic template hashing must be implemented separately from the prompt compiler.
- [x] **Step 5 — prove GREEN:** Run `node --test test/compiler.test.js` twice. Expected: all compiler tests pass; checked-in bytes and the independently precomputed hash match on both runs.

### Task 3: Write-once prepared receipt bundle

**Files:**
- Create: `src/receipts.js`
- Create: `test/receipts.test.js`

- [x] **Step 1 — RED:** Add tests that use a fresh temporary root and assert event-specific required/forbidden fields, exact two-event ordering, monotonic sequence, valid canonical UTC times, exact job/turn linkage, `attempt: 1`, null remote fields, canonical single-line JSONL, exact nested current state, prompt-byte/hash correspondence, duplicate job refusal, job/turn ID validation, and no overwrite.
- [x] **Step 2 — RED fault matrix:** Inject failure after staging-directory creation, each exclusive file creation, each write, each file sync, each close, directory sync, and final publish. Assert that no published `current.json` can say `prepared` unless both event lines and prompt bytes/hash agree; the pre-existing published job remains byte-identical; partial work remains only under a recognizable staging name. Race two concurrent writers for the same job ID and require exactly one complete publication and one typed duplicate rejection.
- [x] **Step 3 — prove RED:** Run `node --test test/receipts.test.js`. Expected: failure because `src/receipts.js` does not exist.
- [x] **Step 4 — GREEN:** Implement:

```js
export async function persistPreparedJob({ outputRoot, job, turn, compiled }) {}
```

Use `fs.open(..., "wx")`, explicit writes, `FileHandle.sync()`, close, directory sync where supported, and one same-filesystem staging-directory publish. The persistence function is called only after request/template/ID/time validation and then creates only the wrapper-owned `jobs` parent. Validate IDs with `/^[a-z0-9][a-z0-9_-]{0,63}$/`. Expose a narrowly scoped injected persistence adapter or checkpoint callback only where needed for deterministic fault tests; do not add production retry or recovery behavior.
- [x] **Step 5 — prove GREEN:** Run `node --test test/receipts.test.js`. Expected: all success, fault-injection, and concurrency tests pass with no warnings.

### Task 4: Offline prepare orchestration and CLI

**Files:**
- Create: `src/strict-json.js`
- Create: `src/prepare.js`
- Create: `src/cli.js`
- Create: `bin/chatgpt-research.js`
- Create: `test/prepare-cli.test.js`

- [x] **Step 1 — RED mode matrix:** Parameterize omitted mode, explicit `standard`, `web`, `deep`, and `image`. Assert exact mode/reason in prompt bytes, both events, current state, and CLI summary with no substitution. Add wrong-case, empty, null, array/object mode values; omitted mode plus supplied reason; explicit standard without reason; and whitespace-only question/reason cases.
- [x] **Step 2 — RED bounded input:** Add strict JSON tests for duplicate keys at every object depth, trailing content, BOM, non-object roots, and malformed strings/numbers. Add request/question/reason/template/prompt byte ceilings, invalid clock/IDs, traversal separators/dot segments/backslashes/percent escapes/Unicode-confusable identities, and symlinked template cases. Invalid input must create neither `jobs` parent nor job/staging directory.
- [x] **Step 3 — RED orchestration:** Add library and child-process tests proving that one request produces one prepared job, injected IDs/time make output byte-identical, duplicate IDs fail without mutation, CLI stdout is one canonical JSON summary, stderr is one stable typed error, and the published state cannot contain `completed`, a conversation reference, answer hash, remote timestamp, or dispatched effect.
- [x] **Step 4 — prove RED:** Run `node --test test/prepare-cli.test.js`. Expected: failure because strict parsing, orchestration, and CLI modules do not exist.
- [x] **Step 5 — GREEN:** Implement:

```js
export async function prepareResearchJob({ request, outputRoot, templatesRoot, now, newJobId, newTurnId }) {}
export async function runCli(argv, io = process) {}
```

The executable supports only:

```text
chatgpt-research prepare --request <json-file> --output-root <directory>
```

It resolves the built-in template root relative to its own module, reads at most 64 KiB from exactly one request file, rejects duplicate keys, calls `prepareResearchJob`, prints a canonical summary, and sets a nonzero exit code for typed validation/persistence errors. It does not shell out. The library derives `caller: codex` and the pre-dispatch pacing disposition; neither can be overridden by request JSON.
- [x] **Step 6 — prove GREEN:** Run `node --test test/prepare-cli.test.js`. Expected: all end-to-end tests pass with no production browser, network, or child process path.

### Task 5: Positive production-authority gate

**Files:**
- Create: `scripts/m002-authority-check.js`
- Create: `test/authority-check.test.js`
- Modify: `package.json`

- [x] **Step 1 — RED:** Define the exact allowed production/package files and allowed built-in imports per file. Require empty `dependencies`, `devDependencies`, `optionalDependencies`, and `peerDependencies`; allow only non-lifecycle scripts `test` and `check:authority`; reject `pre*`/`post*`, install/prepare hooks, package imports/exports drift, dynamic `import()`, `require`, `createRequire`, `eval`, `Function`, computed loader access, and production use of process spawning, network, browser, OpenCLI, cookie, CDP, extension, or profile surfaces.
- [x] **Step 2 — RED mutations:** In temporary fixture packages, introduce forbidden authority through static alias import, `node:http`, bare `http`, re-export, computed dynamic import, `createRequire`, `globalThis["fetch"]`, a lifecycle script, an external dependency, and an unlisted production file. Require the checker to reject every mutation. Test code may use `child_process` only to invoke the local CLI executable.
- [x] **Step 3 — prove RED:** Run `node --test test/authority-check.test.js`. Expected: failure because the authority checker does not exist.
- [x] **Step 4 — GREEN:** Implement exact production-source digest pins, a closed file/import/package allowlist, and stable machine-readable violation output. The checker is source-boundary corroboration, not a claim that OS-level network activity has been proven absent.
- [x] **Step 5 — prove GREEN:** Run `node --test test/authority-check.test.js` and `node scripts/m002-authority-check.js`. Expected: every mutation is caught and the real package passes.

### Task 6: Integrated deterministic gate and documentation propagation

**Files:**
- Modify: `README.md`
- Modify: `docs/PROJECT-BOUNDARY.md`
- Modify: `docs/M001-PLAN.md`
- Modify: `docs/EVALUATION.md` only if a claim about candidate evidence changes; otherwise leave it untouched
- Modify: `docs/M002-PLAN.md`

- [x] Run `npm test` without installing packages. Expected: all tests pass.
- [x] Run the full suite ten consecutive times and compare normalized test counts plus the golden prompt/receipt hashes. Expected: identical hashes and no intermittent failures.
- [x] Run `node --check` on every JavaScript source, bin, and test file. Expected: all exit zero.
- [x] Run `node scripts/m002-authority-check.js` and inspect its positive file/import/package inventory. Expected: pass with no unclassified production path.
- [x] Run `npm pack --dry-run --json --ignore-scripts` without fetching dependencies and compare its file list to the package allowlist. Expected: only declared distributable files; tests and staging artifacts are absent.
- [x] Run `git diff --check` and inspect `git diff -- README.md docs package.json bin src templates test` plus untracked files. Expected: no unintended whitespace errors or unrelated changes; the repository has no baseline commit, so untracked files were inspected directly.
- [x] Record exact commands, results, accepted review findings, remaining uncertainty, and M002 disposition in this document.
- [x] Propagate the M002 status and next approval boundary to obvious dependent artifacts without rewriting the M001 evidence record.

## Acceptance criteria

M002's first slice is complete only when:

1. `standard` is the sole default; `web`, `deep`, and `image` require explicit selection and are never silently substituted.
2. An exact ID/version template produces deterministic prompt bytes and SHA-256; manifest drift fails closed.
3. One offline `prepare` call publishes one internally consistent, write-once prepared bundle containing the exact two-event receipt, current state, and prompt bytes. Same-filesystem cooperative-writer publication survives the injected fault/concurrency matrix; physical power-loss durability remains untested.
4. The receipt distinguishes `prepared` and `not_dispatched` from any remote effect.
5. Invalid input fails before job creation, and duplicate identity never overwrites existing state.
6. The positive source/package authority gate corroborates that production has no external dependency, child process, dynamic loading/evaluation, network, browser, extension, OpenCLI execution, account, or provider path.
7. Focused and integrated deterministic checks pass under the current local Node runtime.
8. Existing M001 evidence remains visible; only the approved M002 implementation status and dependent links are added.

## Explicit deferrals

| Recorded V1 requirement | M002 disposition |
|---|---|
| OpenCLI command mapping and submit | Deferred to a separately reviewed pinned-integration slice; M002 records `not_dispatched` only |
| Queue, pacing enforcement, retry, stop, and restart recovery | Deferred; M002 records `not_applicable_pre_dispatch` and implements no remote-effect transition |
| Answer and source return | Deferred until submit/read behavior is authorized and source-corroborated |
| Approved attachments and inline context bundles | Deferred to the SP-002 successor slice |
| Generated text/binary/image artifacts | Deferred to the SP-003/SP-006 successor slices |
| GitHub connector state | Deferred pending bounded adapter design and separately approved live observation |
| Installation, dedicated profile, extension, account, browser, and provider behavior | Separately approval-gated; prohibited in M002 |

## Fastest falsifiers and stop conditions

Stop and surface a decision if any of these occur:

- deterministic compilation requires provider/UI state or OpenCLI execution;
- durable receipts require a new dependency or an authority surface outside the repository and test temporary directories;
- the accepted request/receipt schema conflicts with a recorded owner decision;
- tests reveal that a possibly dispatched remote effect is needed to establish the first slice;
- implementation reaches the separately approval-gated OpenCLI installation or live-smoke boundary.

Ordinary test or implementation defects are not owner blockers; correct them through RED–GREEN–REFACTOR and continue.

## Review and integration contract

- Sol High reviews the plan's tests and false-green risks read-only before implementation. Root dispositions every finding.
- Terra High owns `package.json`, `bin/`, `src/`, `templates/`, and `test/` for the bounded implementation. The worker is not alone in the worktree, must preserve all existing files, must use TDD, must not commit, and must not cross any live/network/install boundary.
- Root owns `docs/`, shared integration, review disposition, fresh reruns, and the final M002 status.
- Worker and advisor results are reported evidence until root inspects the files/diff and reproduces the load-bearing checks.

## Checkpoint receipt

Sol High review `cra-m002-test-design-01` returned `CONCUR_WITH_CHANGES` on 2026-08-24. Root disposition:

1. **Accepted:** semantic template identity now uses a canonical semantic digest plus an external ID/version registry pin; mutation with a recomputed self-declared digest must still fail.
2. **Accepted with bounded claim:** persistence is a write-once staged bundle, not a general append-only/recoverable ledger; injected fault and concurrency tests do not establish physical power-loss durability.
3. **Accepted:** checked-in literal bytes and a precomputed digest form the independent prompt oracle; Unicode/newline and opaque placeholder behavior are explicit.
4. **Accepted:** event-specific provisional schemas include caller, pacing disposition, attempt, null remote fields, state rules, and job/turn ownership.
5. **Accepted with bounded claim:** a positive allowlist plus mutations corroborates the production source/package boundary; it is not OS-level proof of no network activity.
6. **Accepted:** the end-to-end mode/input/path matrix covers all modes, strict JSON, byte ceilings, identities, symlinks, timestamps, and pre-mutation failure.
7. **Accepted:** the slice stays prepare-only; all transport and live behaviors are visibly deferred.

Current disposition: `IMPLEMENTATION_COMPLETE_OFFLINE`; installation and live/provider authority remain closed.

## Implementation receipt

`[ROOT VERIFICATION — 2026-08-24]`

- `npm test`: 42 tests passed, 0 failed, 0 skipped.
- Ten consecutive `node --test` runs: each reported 42 passed and 0 failed.
- Ten identical injected-ID/time prepare runs produced one bundle digest: `757699fae9fcaa9ccc51ae3388c68a4c5e991821f90991603fa49e5d67378586`.
- The checked-in golden prompt fixture SHA-256 is `8133da4b2c8544cac42048f811b9ad7d7676ddff6331dc29c5d2acd9d26ebd55`.
- `node scripts/m002-authority-check.js`: `M002_AUTHORITY_OK` with no violations; all ten production JavaScript files matched their package-manifest pins.
- `node --check`: all 15 source, bin, checker, and test JavaScript files passed.
- `npm pack --dry-run --json --ignore-scripts --cache /private/tmp/m002-root-final-npm-cache`: 14 declared files only; tests/docs/staging were absent and the bin mode was `0755` (`493`).
- The POSIX direct-executable test passed, Markdown links resolved, `git diff --check` passed for tracked state, and direct untracked inspection found only the intentional Markdown layout that was normalized before closure.

Sol High's test-design review was integrated before implementation and its final source-level verdict was `SPEC_COMPLIANT`. Independent Sol code-quality review first exposed executable-mode and authority-scanner false greens. TDD revisions added direct invocation coverage and then replaced blacklist-only confidence with exact external source pins. Final review `M002-code-quality-review-06` returned `CODE_QUALITY_APPROVED`.

Remaining uncertainty is intentionally bounded: no dependency installation, OpenCLI import/execution, browser/extension/account access, provider request, signed-in smoke, remote, publish, deploy, or commit occurred. Same-filesystem cooperative publication is exercised; hostile filesystem races, physical power loss, restart recovery, transport effects, and joint malicious source/pin edits are not claimed.

## M003 follow-on

`[OWNER DECISION — 2026-08-24]` M003 was approved after M002 closure. It adds a standard-only one-shot OpenCLI subprocess boundary and separate dispatch artifacts without modifying the three M002 prepared-bundle files. Its offline suite passed before any installation or account operation. See `M003-DESIGN.md` and `M003-PLAN.md` for the exact command, ambiguity/no-retry contract, live authorization, and evidence. M002's implementation receipt remains a historical statement about the earlier prepare-only package.

`[M003 TERMINAL FOLLOW-ON — 2026-08-24]` Exact install plus isolated daemon/bridge/login preflight ultimately passed in temporary Chrome for Testing. The one authorized wrapper attempt produced no accepted answer/reference and terminated as durable `ambiguous_effect` with unknown remote effect. It was not retried. M002's prepared bundle remained hash-bound and unchanged.
