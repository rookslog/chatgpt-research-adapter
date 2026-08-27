# M003 — One-Shot OpenCLI Transport and Live-Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:test-driven-development` for every production behavior, `superpowers:executing-plans` for checkpointed execution, and `superpowers:verification-before-completion` before any success claim. Do not commit.

- Status: M003 terminal after one live `ambiguous_effect`; no retry
- Milestone type: one bounded standard-mode transport slice followed by one approval-authorized live smoke
- Commit authority: not granted

**Goal:** Extend the offline wrapper with one fail-closed `submit-once` operation that consumes an immutable M002 prepared bundle, durably records dispatch intent, invokes exactly OpenCLI v1.8.7 once, and records either one validated answer or an ambiguous remote effect; then exercise that exact wrapper path once in an isolated temporary ChatGPT profile.

**Architecture:** New modules validate the M002 bundle, identify and invoke the pinned executable through a single subprocess authority boundary, publish write-once dispatch receipts, and orchestrate one attempt. The existing CLI exposes only a fixed `submit-once` grammar. Offline tests use a fake executable and injected spawn seams; the live phase occurs only after the full deterministic gate, published-package inspection, exact installation, isolated Browser Bridge setup, and preflight.

**Tech stack:** Node.js 26 standard library, ESM, `node:test`, JSON/JSONL, SHA-256, one allowlisted `node:child_process.spawn` import, OpenCLI `@jackwener/opencli@1.8.7`, and its matching Browser Bridge release. No wrapper dependencies.

---

## Authority and closure target

`[OWNER DECISION — 2026-08-24]` M003 is approved and may execute through the one-prompt live-smoke protocol in `M003-DESIGN.md`. This includes inspecting and installing exactly OpenCLI v1.8.7, loading its matching Browser Bridge in a new temporary ChatGPT-only Chrome profile, manual owner sign-in, and one standard-mode provider turn.

`[OWNER RISK ACCEPTANCE — 2026-08-24]` The owner accepts the unresolved contract/account risk previously recorded for this bounded smoke. That acceptance does not establish a legal-compliance finding and does not broaden the smoke into general extraction or automation.

The closure target is one actual wrapper result whose local state is either:

- `completed`, with exact token `CHATGPT_RESEARCH_LIVE_SMOKE_OK`, a validated conversation reference, and internally consistent receipts; or
- a recorded stop/falsifier showing why the bounded design could not safely complete.

An `ambiguous_effect` after durable intent is terminal for M003. It must never trigger a retry. A direct OpenCLI or browser-only success is diagnostic evidence, not milestone success.

The following remain outside authority: normal-profile attachment, existing-chat inspection, cookie export, challenge bypass, stealth/evasion, arbitrary browser commands, second provider turns, Web Search, Deep Research, images, files, connectors, queueing, retry, continuation, remote creation, publishing, deployment, and commits.

## Fixed command and output contract

Pinned source at OpenCLI release v1.8.7, commit `87b60a36590c3e2a466c37266c3348d73d7f68fe`, defines the `chatgpt ask` command. M003 fixes the invocation to this argv after the executable path:

```text
chatgpt
ask
<exact prompt bytes decoded as UTF-8>
--new
true
--site-session
ephemeral
--timeout
120
--format
json
```

The process is created with `shell: false`, a fixed repository working directory, no stdin, and a minimal environment allowlist. The request cannot select an executable, subcommand, option name/value, timeout, output format, cwd, or environment key; only the CLI's separately validated absolute `--opencli` path and the prepared prompt value vary.

Before dispatch intent, the wrapper resolves the absolute path, requires the resolved target to be a regular file, hashes its bytes, and runs only `<path> --version`. Exact trimmed stdout `1.8.7`, zero exit, empty-or-bounded stderr, and stable target identity are required. The identity receipt records the supplied path, real path, target SHA-256, size, and version. The wrapper invokes the supplied path after confirming that it still resolves to the same identity immediately before the ask spawn. This is a cooperative local check, not an OS-level executable lock or sandbox.

The ask output must be UTF-8 JSON with exactly one array element and exactly these keys:

```json
{
  "conversationId": "<nonempty id>",
  "conversationUrl": "https://chatgpt.com/c/<same id>",
  "tool": "",
  "response": "<nonblank answer>"
}
```

Unknown keys, multiple rows, nonempty `tool`, mismatched IDs, non-HTTPS/non-ChatGPT URLs, fragments/query strings, blank answers, malformed UTF-8/JSON, or output above 256 KiB make the post-spawn effect ambiguous. Standard error is independently capped at 256 KiB. A 135-second local process deadline bounds OpenCLI's declared 120-second response wait plus startup/cleanup allowance.

## File map

| Path | Responsibility |
|---|---|
| `src/prepared-bundle.js` | Bounded no-follow revalidation of immutable M002 `events.jsonl`, `current.json`, and `prompt.txt` |
| `src/dispatch-receipts.js` | Exact dispatch intent/result schemas and exclusive durable publication of `intent.json`, `answer.md`, and `result.json` |
| `src/opencli-transport.js` | Sole production subprocess import; executable identity/version preflight, fixed ask argv, byte limits, timeout, and exact output parser |
| `src/submit-once.js` | Ordering coordinator: validate, preflight, write intent, recheck/spawn once, classify, and persist terminal local result |
| `src/cli.js` | Add exact `submit-once --output-root <directory> --job-id <id> --opencli <absolute-path>` grammar and canonical summary |
| `scripts/m002-authority-check.js` | Extend the closed inventory/import/capability rules and exact source pins for the bounded process seam |
| `package.json` | Preserve empty dependencies and scripts; add exact pins for new/modified production files |
| `test/prepared-bundle.test.js` | Acceptance/corruption/symlink/size tests for M002 bundle reopening |
| `test/opencli-transport.test.js` | Fake executable tests for version, identity, argv, exact prompt, limits, timeout, and output parsing |
| `test/dispatch-receipts.test.js` | Write ordering, immutability, injected faults, hash binding, and duplicate tests |
| `test/submit-once.test.js` | End-to-end offline one-shot outcome, ambiguity, and no-retry tests |
| `test/prepare-cli.test.js` | Preserve prepare behavior and add submit CLI grammar/integration coverage |
| `test/authority-check.test.js` | Mutation tests for all new subprocess-boundary restrictions and pins |
| `docs/M003-LIVE-RECEIPT.md` | Minimal install/preflight/smoke/cleanup evidence; excludes prompt/answer content except the fixed expected token and hashes |

M002's `events.jsonl`, `current.json`, and `prompt.txt` are never edited by submit. M003 adds only `<job>/dispatch/intent.json`, optional `<job>/dispatch/answer.md`, and `<job>/dispatch/result.json`.

## Receipt and ordering contract

`intent.json` uses schema `m003.dispatch-intent.v1` and records: job/turn/template/mode/prompt identity, `attempt: 1`, exact fixed command-contract SHA-256, executable identity, UTC `intent_recorded_at`, and `retry_policy: none`. It excludes the prompt body, answer, credentials, cookies, or inherited environment values.

`answer.md` contains exact validated UTF-8 response bytes. `result.json` uses schema `m003.dispatch-result.v1` and records the intent hash, terminal status, UTC finish time, process disposition, remote-effect classification, conversation reference when completed, answer hash/byte count when completed, and `retry_decision: prohibited` for ambiguous outcomes.

Ordering is strict:

1. validate bundle and executable/version without creating `dispatch/`;
2. exclusively create and sync `dispatch/intent.json` and its directory;
3. revalidate executable identity and call the ask process once;
4. on validated success, exclusively write/sync `answer.md`, then exclusively write/sync `result.json`;
5. on any uncertainty after ask spawn begins, write/sync one `ambiguous_effect` result without an answer;
6. any pre-existing intent, answer, or result fails closed without spawn or mutation.

A crash after intent or after answer but before result leaves an incomplete one-shot record that cannot be resubmitted in M003. Recovery/reconciliation is deferred.

## TDD execution tasks

### Task 1: Prepared-bundle validator

**Files:** create `src/prepared-bundle.js`, create `test/prepared-bundle.test.js`.

- [x] **RED:** Build a valid M002 bundle through the real prepare API, then require a frozen normalized dispatch input. Mutate every load-bearing event/current field, prompt byte, hash, line count/order, job/turn link, state, mode, template identity, remote-null field, and transport status independently; require typed pre-intent failure.
- [x] **RED boundary:** Cover missing files, directories in place of files, symlinked job/directory/files, unknown extra files only where relevant, malformed/duplicate-key JSON, malformed JSONL, non-UTF-8, job ID/path traversal, and byte caps. Prove validation creates no `dispatch/` path.
- [x] **Prove RED:** `node --test test/prepared-bundle.test.js` fails because the module does not exist.
- [x] **GREEN:** Implement `loadPreparedBundle({ outputRoot, jobId })` using absolute-root validation, bounded no-follow file handles, strict JSON parsing, exact schemas, and byte/hash comparison.
- [x] **Prove GREEN:** Run the focused test twice; all cases pass and no prepared file bytes change.

### Task 2: OpenCLI identity and fixed transport

**Files:** create `src/opencli-transport.js`, create `test/opencli-transport.test.js`.

- [x] **RED identity:** Generate temporary executable fake scripts for `--version` and ask behavior. Reject relative paths, missing paths, directories, symlink target anomalies, wrong versions, nonzero version exit, malformed/oversize version output, changed target identity, and non-executable targets before ask.
- [x] **RED ask:** Assert the exact argv vector and byte-identical Unicode/newline prompt value. Assert `shell: false`, fixed cwd, no stdin, only allowlisted environment keys, one spawn, and no retry. Cover spaces, quotes, shell metacharacters, leading hyphens, and newlines in the prompt as opaque one-argument data.
- [x] **RED result:** Accept the one exact JSON row; reject malformed/duplicate-key/oversize/non-UTF-8 output, extra/missing keys, multiple/zero rows, nonzero exit, signal, timeout, blank response, wrong tool, and invalid/mismatched conversation URL/ID. Require one SIGTERM and bounded completion on timeout.
- [x] **Prove RED:** `node --test test/opencli-transport.test.js` fails because the module does not exist.
- [x] **GREEN:** Implement `preflightOpenCli(...)`, `runOpenCliStandard(...)`, and the exact parser. Only this file imports `node:child_process`; narrowly inject spawn/clock/timer seams for deterministic tests.
- [x] **Prove GREEN:** Run the focused test twice; all cases pass without network or OpenCLI installation.

### Task 3: Dispatch receipts

**Files:** create `src/dispatch-receipts.js`, create `test/dispatch-receipts.test.js`.

- [x] **RED schemas:** Assert exact intent/result keys, canonical JSON plus newline, prompt/job/turn/executable/command hashes, timestamps, completed versus ambiguous field rules, exact answer hash/byte count, and rejection of unknown/inconsistent fields.
- [x] **RED persistence:** Inject failure after every create/write/sync/close/directory-sync boundary. Require intent durability before a spawn checkpoint can run; result never declares completion before durable matching answer; existing artifacts remain byte-identical; duplicate/concurrent calls never overwrite.
- [x] **Prove RED:** `node --test test/dispatch-receipts.test.js` fails because the module does not exist.
- [x] **GREEN:** Implement exclusive bounded directory/file publication with `O_NOFOLLOW` where available, file sync, directory sync where supported, and no cleanup/overwrite/recovery behavior.
- [x] **Prove GREEN:** Run the focused test twice, including the complete fault and concurrency matrix.

### Task 4: One-shot orchestration

**Files:** create `src/submit-once.js`, create `test/submit-once.test.js`.

- [x] **RED success:** From a real prepared bundle and fake executable, assert validation and version preflight precede intent; intent precedes ask observation; one ask produces exact `answer.md` then completed result; returned summary agrees with disk.
- [x] **RED ambiguity/no retry:** Parameterize spawn error, identity change after intent, nonzero exit, signal, timeout, malformed/oversize output, invalid row, and post-answer persistence fault. Require zero ask spawn for pre-intent failures; exactly one for post-intent paths; `ambiguous_effect` where result publication is possible; never a second ask.
- [x] **RED duplicate:** Reinvoke after completed, ambiguous, intent-only, and answer-without-result states. Require typed refusal, no spawn, no changed bytes.
- [x] **Prove RED:** `node --test test/submit-once.test.js` fails because the module does not exist.
- [x] **GREEN:** Implement `submitPreparedJobOnce(...)` as the only orchestration path. It catches only post-intent transport uncertainty for ambiguity classification and never converts local persistence faults into provider retries.
- [x] **Prove GREEN:** Run the focused test twice and compare artifact digests across deterministic successful runs.

### Task 5: CLI and authority integration

**Files:** modify `src/cli.js`, `scripts/m002-authority-check.js`, `package.json`, `test/prepare-cli.test.js`, and `test/authority-check.test.js`.

- [x] **RED CLI:** Add exact accepted grammar, absolute OpenCLI-path requirement, canonical one-line success summary, stable typed errors, and wrong-order/unknown/repeated/missing-argument rejection. Prove existing `prepare` behavior stays byte-identical.
- [x] **RED authority:** Extend mutation fixtures so only `src/opencli-transport.js` may statically import `node:child_process` and reference spawn/process-environment mechanics. Reject `exec`, `execFile`, `fork`, shell enablement, network/browser imports, additional process importers, dynamic loading/evaluation, nonempty dependency sets, lifecycle scripts, unlisted production files, changed source bytes, and drift in the fixed command/version/limits.
- [x] **Prove RED:** Focused CLI and authority tests fail on the missing integration/pins.
- [x] **GREEN:** Add submit routing without weakening strict prepare parsing. Extend the exact inventory/import/process allowlist and source SHA-256 manifest; keep wrapper dependency sets empty and scripts unchanged.
- [x] **Prove GREEN:** Run `node --test test/prepare-cli.test.js test/authority-check.test.js` and `node scripts/m002-authority-check.js`.

### Task 6: Offline integrated gate and documentation propagation

**Files:** modify `README.md`, `docs/PROJECT-BOUNDARY.md`, `docs/M001-PLAN.md`, `docs/M002-PLAN.md`, `docs/M003-DESIGN.md`, and this plan; modify `docs/EVALUATION.md` only if candidate evidence changes.

- [x] Run `npm test` without installing OpenCLI. Result: 60 passed, 0 failed, 0 skipped.
- [x] Run the full suite ten consecutive times. Result: all ten independent runs exited zero with 60 tests represented in each dot report.
- [x] Run `node --check` over every production/test JavaScript file. Result: 23/23 passed.
- [x] Run the authority checker and inspect every newly allowed import/process token. Result: `M002_AUTHORITY_OK`; only `src/opencli-transport.js` imports `node:child_process`.
- [x] Run `npm pack --dry-run --json --ignore-scripts` with a temporary cache and compare the distributable inventory. Result: 18 declared files, no bundled dependency.
- [x] Run `git diff --check`, inspect every untracked/changed file directly because there is no baseline commit, and verify no M002 bundle artifact contract was silently rewritten.
- [x] Propagate M003's offline status, exact remaining live gate, unresolved policy risk, and deferrals to dependent artifacts.

`[ROOT OFFLINE CHECKPOINT — 2026-08-24]` Tasks 1–6 are complete. TDD added four production modules, the exact CLI route, and 18 new tests while preserving all 42 M002 tests. The final offline suite is 60/60. Ten repeat runs, 23 syntax checks, the exact-source authority gate, and the 18-file package dry run all passed. No OpenCLI package, extension, browser, account, provider, remote, or commit was used or created at this checkpoint.

### Task 7: Published-package inspection and exact installation

**Files:** create `docs/M003-LIVE-RECEIPT.md`; do not add the installed dependency to this wrapper package.

- [x] Fetch npm metadata and tarball for exactly `@jackwener/opencli@1.8.7` into a temporary directory. Record registry integrity, tarball SHA-256, package name/version/bin/engine, file inventory summary, lifecycle scripts, extension asset identity, and comparison to release commit `87b60a36590c3e2a466c37266c3348d73d7f68fe`.
- [x] Stop before installation on version/integrity/source mismatch, unexpected native installer, credential access, normal-profile binding, or output-schema drift.
- [x] Install the exact version in an isolated temporary prefix, with no `latest`, skills, plugins, or wrapper manifest change. Re-run the executable hash/version checks against the installed target.
- [x] Record installed paths/digests and every install side effect that can be established. Do not claim absent side effects from filtered evidence.

`[ROOT INSTALL CHECKPOINT — 2026-08-24]` Exact registry, release, tarball, extension, installed executable, and adapter identities are recorded in `M003-LIVE-RECEIPT.md`. Lifecycle scripts were inspected and disabled; the wrapper manifest remains dependency-free. Task 7 is complete.

### Task 8: Isolated Browser Bridge preflight

**Files:** update `docs/M003-LIVE-RECEIPT.md` only.

- [x] Obtain the extension asset matching the inspected v1.8.7 release and verify its digest before loading.
- [x] Create a new temporary Chrome user-data directory used only for this smoke and attempt to launch branded Chrome with only the verified unpacked extension. Do not attach the bridge to the ambient in-app browser or the owner's normal Chrome profile.
- [x] Owner completes ChatGPT sign-in manually in the browser instance that actually carries the verified bridge. Do not type, reveal, record, or export credentials/cookies/storage.
- [x] Start/select the matching OpenCLI daemon/profile and run version, `doctor`, and `chatgpt status` preflight. Any authentication, extension, version, challenge, policy, quota, navigation, or profile anomaly stops before wrapper submit.
- [x] Record only minimal status/version/context identifiers required to prove isolation; do not enumerate chats or unrelated browser state.

`[OWNER DECISION / ROOT PREFLIGHT — 2026-08-24]` The owner authorized one bounded use of `~/.opencli`. Its original cache was backed up; the predicted runtime entries were created; and `doctor` started daemon v1.8.7 with its profile/config rooted in the temporary directory. Branded Chrome 151 ignored `--load-extension`, consistent with Chrome's documented version-137 removal. The owner then chose the recommended temporary official Chrome for Testing route instead of normal-profile installation. Chrome for Testing 151.0.7922.174 loaded the verified bridge; doctor reported daemon 1.8.7, extension 1.0.23, context `6hfwpnpj`, and connectivity OK; `chatgpt status` reported connected and logged in.

`[ROOT TDD CORRECTION — 2026-08-24]` Preflight exposed that the wrapper did not pass `OPENCLI_CONFIG_DIR` through its minimal child environment. A new focused test failed first, the allowlist was extended by exactly that key, the source pin was updated, the focused suite passed twice, and `M002_AUTHORITY_OK` remained green.

### Task 9: One live wrapper smoke and cleanup

**Files:** update `docs/M003-LIVE-RECEIPT.md` and this plan.

- [x] Prepare one standard-mode job whose question is exactly `Reply with exactly CHATGPT_RESEARCH_LIVE_SMOKE_OK` and no files.
- [x] Run exactly one `chatgpt-research submit-once` against the verified installed OpenCLI path. Do not manually invoke `opencli chatgpt ask` first and do not retry.
- [x] If completed, require exact answer token, one validated conversation reference, answer/intent/result hash agreement, and one recorded ask spawn. If uncertain after intent, preserve `ambiguous_effect` and stop.
- [x] Stop the daemon and close the temporary Chrome instance. Remove the temporary profile, unpacked extension, isolated install prefix, npm cache/tarball, and smoke output containing prompt/answer after recording minimal hashes/status evidence. Report what was removed and that it was temporary/nonrecoverable.
- [x] Run the wrapper's deterministic suite and authority checker fresh after cleanup. Verify no dependency, remote, commit, normal-profile bridge installation, or extra provider turn was introduced; record any normal-window UI inspection.

`[ROOT LIVE STOP — 2026-08-24]` The one wrapper attempt wrote durable intent and then ended near the fixed deadline with `ERR_OPENCLI_EXIT`. M003 correctly persisted terminal `ambiguous_effect`, `remote_effect: unknown`, and `retry_decision: prohibited`; no answer/reference exists and no second turn occurred. Root cause is not established because the current receipt retains only error class and stderr hash. M003 closes on this falsifier after cleanup; any future attempt requires an offline observability design and separate live authorization.

`[ROOT FINAL CHECKPOINT — 2026-08-24]` The daemon and Chrome for Testing were stopped. The pre-existing 72-byte `~/.opencli/update-check.json` was restored with its original mode, mtime, and SHA-256; all M003-created user-runtime entries were removed. The entire resolved M003 temporary root—isolated OpenCLI/npm state, extension, Chrome/Chrome-for-Testing profiles and binary/archive, backups, and smoke prompt/dispatch files—was deleted and is not recoverable. Fresh post-cleanup evidence: 61/61 tests passed; `M002_AUTHORITY_OK`; `src/opencli-transport.js` syntax passed; the package dry-run contained 18 declared files with no bundled dependency; the temporary root and verification cache are absent; the repository remains on `main` with no commit or remote. No bridge was installed in the normal Chrome profile and no second provider turn occurred. Desktop-control diagnosis briefly navigated the active normal Chrome tab to internal extensions/version pages; it was returned to `https://chatgpt.com/`. Accessibility state exposed sidebar titles but no conversation was opened or read. This exceeded the intended minimal isolated-status inspection and is retained as a process finding.

## Acceptance criteria

1. All pre-intent validation/version/identity failures create no dispatch artifacts and no ask spawn.
2. Durable intent exists before the one possible provider-mutating ask process; a second invocation cannot spawn or modify prior bytes.
3. The exact prompt is one opaque argv value under the fixed standard-mode contract with no shell, arbitrary environment, dynamic options, or retry.
4. Every post-spawn uncertainty becomes terminal `ambiguous_effect` where the result can be persisted; only an exact one-row response becomes `completed`.
5. Completed state has a byte/hash-consistent answer and exact `https://chatgpt.com/c/<id>` reference. Prepared M002 files remain byte-identical.
6. The exact-source authority gate allows child-process authority in one reviewed module only and catches representative authority/contract mutations.
7. The full offline suite is deterministic and passes before any installation/account/provider step.
8. The installed OpenCLI and Browser Bridge match the inspected v1.8.7 identities and operate only in the temporary dedicated profile.
9. The live smoke uses one wrapper submit and no retry; success requires exact token and receipt consistency.
10. Temporary live state is cleaned up, while minimal durable evidence and all unresolved risks/deferrals remain documented. No commit or remote is created.

## Fastest falsifiers and stop conditions

Stop and record evidence if:

- pinned package metadata, tarball, release commit, installed executable, extension version, or runtime output contract does not agree;
- child-process uncertainty cannot be distinguished from a safe pre-send failure without risking a second prompt;
- OpenCLI requires the normal browser profile, cookie export, generic browser control, history inspection, challenge handling, or broader permissions than the design permits;
- dedicated-profile sign-in, extension handshake, `doctor`, or ChatGPT status is abnormal;
- the live answer is not the exact expected token, the conversation reference is invalid, or any receipt/hash is inconsistent;
- cleanup would require deleting a non-temporary or unresolved path.

Ordinary offline test defects are not owner blockers. Resolve them through RED–GREEN–REFACTOR while preserving the approved design. A falsifier, post-intent ambiguity, or required scope expansion returns to the owner without retry.

## Explicit deferrals

M003 does not implement or validate Web Search, Deep Research, image mode, attachments, generated files, sources/citations extraction, continuation, cancellation, polling, queueing, pacing across jobs, retry, restart reconciliation, installation automation, persistent profiles, conversation cleanup, deployment, publication, or general V1 transport. The accepted M002 mode values remain compile-time receipt values; only `standard` may dispatch in M003.
