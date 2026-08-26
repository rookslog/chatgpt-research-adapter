# Review, Verification, and CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve PR #6's validated review findings through test-first hardening, encode hard-requirement traceability, add deterministic credential-free CI, and iterate fresh review rounds until no valid P1 remains or the recurring-P1 stop rule fires.

**Architecture:** Preserve `f183a500f6e9283af8ff42599bc470bc02d768a6` as the exact recovered-baseline provenance point, then add review-hardening commits on `m006/baseline-recovery`. Extend the existing dispatch receipt journal with an immutable provider-handoff stage and crash-safe intent publication, keep user-facing M004 response artifacts compatible, and add lightweight repository policy/CI contracts rather than a new service or deployment system.

**Tech Stack:** Node.js >=22 ESM, built-in `node:test`, GitHub Actions, existing canonical JSON and fault-injection seams, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-review-verification-ci-design.md`

## Global Constraints

- Preserve recovered-baseline provenance at commit `f183a500f6e9283af8ff42599bc470bc02d768a6`.
- Do not run a live ChatGPT/provider request or manipulate a signed-in browser.
- Do not merge, deploy, publish, close issues, or authorize provider retries.
- External review findings must be independently verified before implementation.
- Every deterministic fix uses a failing regression before production changes.
- A recurring/sibling P1 category stops the patch loop for architectural reassessment.
- CI is credential-free and performs no provider/browser operations.
- Node support floor remains `>=22`.
- No new runtime dependency.

---

### Task 1: Record provenance and review/verification policy

**Files:**
- Create: `docs/REVIEW-POLICY.md`
- Create: `docs/VERIFICATION-POLICY.md`
- Modify: PR #6 description

**Interfaces:**
- Consumes: approved design spec and recovered-baseline SHA.
- Produces: human-readable repository policy referenced by later CI and review rounds.

- [ ] **Step 1: Write REVIEW-POLICY.md** with the verify-before-implement loop, finding classifications, severity handling, original-thread reply rule, fresh-review rule, and recurring-P1 stop condition.
- [ ] **Step 2: Write VERIFICATION-POLICY.md** defining hard requirement -> verification coverage, the five verification classes, TDD evidence rules, and live-vs-offline qualification distinction.
- [ ] **Step 3: Update PR #6 description** to separate `Recovered baseline (f183a500...)` from `Post-recovery review hardening`; retain the original 82-test provenance claim only for the recovered commit.
- [ ] **Step 4: Verify** the two policy docs contain no placeholder/TODO language and the PR description does not claim the new head is byte-identical to the recovered tree.

### Task 2: Make prepare/submit output-root semantics consistent (review P2)

**Files:**
- Modify: `test/prepare-cli.test.js`
- Modify: `src/cli.js`
- Modify: `package.json` authority digests as required

**Interfaces:**
- Consumes: CLI `prepare --output-root` and `submit-once --output-root` arguments.
- Produces: one boundary rule: dispatchable output roots are absolute before preparation.

- [ ] **Step 1: Write failing regression** asserting `prepare` with relative `--output-root ./out` is rejected with `ERR_CLI_USAGE` before filesystem mutation, matching `submit-once`/prepared-bundle absolute-root requirements.
- [ ] **Step 2: Run focused test** `node --test test/prepare-cli.test.js`; confirm RED because the current CLI accepts the relative root.
- [ ] **Step 3: Implement minimal CLI validation** by requiring `isAbsolute(argv[4])` in the prepare command boundary; do not silently reinterpret a relative path against an implicit cwd.
- [ ] **Step 4: Run focused test** and `node --test test/prepare-cli.test.js`; confirm GREEN.
- [ ] **Step 5: Update authority digest** for `src/cli.js` and verify `npm run check:authority`.
- [ ] **Step 6: Reply to review thread `3864884313`** with the verified disposition and focused-test evidence; resolve only after GREEN.

### Task 3: Make prepared-job publication crash durable (review P2)

**Files:**
- Modify: `test/receipts.test.js`
- Modify: `src/receipts.js`
- Modify: `package.json` authority digest

**Interfaces:**
- Consumes: staged prepared-job directory.
- Produces: published `<outputRoot>/jobs/<jobId>` whose directory entry is synced before success is reported.

- [ ] **Step 1: Add a fault seam immediately after syncing `jobsRoot`** and a failing regression proving the success path reaches that seam only after rename; the existing `after-publish` seam is insufficient because it occurs before parent sync.
- [ ] **Step 2: Run `node --test test/receipts.test.js`** and confirm RED because no post-rename parent sync exists.
- [ ] **Step 3: After successful rename, call existing `syncDirectory(jobsRoot)`**, then fire `after-jobs-directory-sync`; preserve the existing `after-publish` seam for compatibility.
- [ ] **Step 4: Run `node --test test/receipts.test.js`** and confirm GREEN, including existing crash/fault matrix.
- [ ] **Step 5: Update authority digest and run `npm run check:authority`.**
- [ ] **Step 6: Reply to review thread `3864884317`** with the persistence ordering and test evidence; resolve after GREEN.

### Task 4: Publish dispatch intent transactionally (review P2 / REQ-DISPATCH-004)

**Files:**
- Modify: `test/dispatch-receipts.test.js`
- Modify: `test/submit-once.test.js`
- Modify: `src/dispatch-receipts.js`
- Modify: `src/submit-once.js` only if the persistence API requires no caller change otherwise
- Modify: `package.json` authority digests

**Interfaces:**
- Consumes: validated job root + immutable dispatch intent.
- Produces: either no final `dispatch/` directory or a complete synced `dispatch/intent.json`; incomplete attempts never masquerade as an existing dispatch.

- [ ] **Step 1: Add failing fault-injection regressions** for failures after staging-directory creation, intent open/write/sync/close, staging-directory sync, rename publication, and parent job-directory sync. Before final publication, `jobRoot/dispatch` MUST be absent; after final publication, `intent.json` MUST be complete and immutable.
- [ ] **Step 2: Add a submit-once regression** proving a failed pre-publication intent attempt does not permanently cause `ERR_DISPATCH_EXISTS` on a later clean attempt.
- [ ] **Step 3: Run `node --test test/dispatch-receipts.test.js test/submit-once.test.js`** and confirm intended RED failures.
- [ ] **Step 4: Replace direct final-directory creation** with unique private staging under the job root, exclusive intent write+sync, staging-directory sync, atomic rename to `dispatch`, parent job-directory sync, and cleanup/recognizable staging semantics that never authorize remote retry after final publication.
- [ ] **Step 5: Run both focused suites** and confirm GREEN.
- [ ] **Step 6: Update authority digests and run `npm run check:authority`.**
- [ ] **Step 7: Reply to review thread `3864884329`** with the transactional-publication evidence; resolve after GREEN.

### Task 5: Persist provider handoff before collection (review P1 / REQ-DISPATCH-002/003)

**Files:**
- Modify: `test/dispatch-receipts.test.js`
- Modify: `test/direct-ask.test.js`
- Modify: `test/submit-once.test.js`
- Modify: `src/dispatch-receipts.js`
- Modify: `src/direct-ask.js`
- Modify: `src/submit-once.js`
- Modify: `package.json` authority digests

**Interfaces:**
- New exported persistence operation: `persistDispatchHandoff({ jobRoot, bundle, intentSha256, conversationId, conversationUrl, tool, now, testSeam })` -> immutable `{ handoff_sha256, handoff_path }`.
- New terminal persistence operation: `persistRecoveryRequiredResult(...)` for a known valid provider handoff whose response/report collection or final validation failed; it MUST prohibit automatic resubmission and retain the canonical conversation reference.
- Existing `persistCompletedResult` remains completion-only and is extended to bind the durable handoff digest rather than introducing the conversation reference for the first time.

- [ ] **Step 1: Write dispatch-receipt RED tests** proving handoff bytes are exclusive, canonical, bound to intent, and persisted before a terminal result; malformed IDs/URLs/tools are rejected.
- [ ] **Step 2: Write direct-ask RED tests** where `ask` returns a valid conversation reference and then `readDetail`, `readDeep`, answer/report write, or user-facing result write fails. Each case MUST leave a durable handoff containing the exact conversation reference and MUST NOT call `ask` twice.
- [ ] **Step 3: Write submit-once RED test** where the process returns a valid conversation reference with a blank/invalid completed answer; the result MUST become `recovery_required` (or equivalent approved schema state) bound to the durable handoff rather than escape unclassified.
- [ ] **Step 4: Run `node --test test/dispatch-receipts.test.js test/direct-ask.test.js test/submit-once.test.js`** and confirm RED for the intended missing handoff/recovery behavior.
- [ ] **Step 5: Implement `persistDispatchHandoff`** as an exclusive canonical artifact under the already-published dispatch directory, syncing file and directory before return.
- [ ] **Step 6: Implement `persistRecoveryRequiredResult`** with `remote_effect: accepted`, canonical conversation identity, handoff digest, and a retry decision that prohibits resubmission while allowing read-only resume/recovery.
- [ ] **Step 7: Update direct ask lifecycle** to create/persist dispatch intent before `ask`, persist handoff immediately after a valid `ask` return, then collect/write answer/report. Failures after handoff persist recovery state before rethrowing or returning the documented recovery outcome; do not send another provider request.
- [ ] **Step 8: Update submit-once lifecycle** to persist handoff after a valid answer row and place completed-result validation/persistence inside the guarded post-intent path so blank/invalid completion becomes a durable recovery state.
- [ ] **Step 9: Run the three focused suites** and confirm GREEN.
- [ ] **Step 10: Run exactly-once/transport-related affected suites** (`test/opencli-transport.test.js`, `test/direct-ask.test.js`, `test/submit-once.test.js`, `test/dispatch-receipts.test.js`) and confirm no duplicate submission behavior regressed.
- [ ] **Step 11: Update authority digests and run `npm run check:authority`.**
- [ ] **Step 12: Reply to P1 thread `3864884308` and blank-answer P2 thread `3864884326`** with the common lifecycle fix and evidence; resolve both only after GREEN.

### Task 6: Add machine-readable requirement verification

**Files:**
- Create: `verification/requirements.json`
- Create: `scripts/check-requirements.js`
- Create: `test/requirements-check.test.js`
- Modify: `package.json`
- Modify: `scripts/m002-authority-check.js` only as required to admit the new repository-owned verification script without widening runtime authority

**Interfaces:**
- `npm run check:requirements` returns zero only when the registry schema is valid and all deterministic bindings point to existing test/static-check artifacts.

- [ ] **Step 1: Write checker tests first** for: valid registry; hard requirement with no bindings; nonexistent deterministic test file; duplicate requirement ID; unknown verification type; and a live/manual requirement incorrectly marked as deterministically satisfied.
- [ ] **Step 2: Run `node --test test/requirements-check.test.js`** and confirm RED because the checker does not exist.
- [ ] **Step 3: Implement the smallest registry checker** using only Node built-ins and strict JSON parsing; do not build a general requirements engine.
- [ ] **Step 4: Seed `verification/requirements.json`** with REQ-DISPATCH-001..006 and current high-value exactly-once, authority, Markdown-fidelity, and live-qualification requirements, each with explicit verification type/path/name bindings.
- [ ] **Step 5: Add `check:requirements` package script** and update the authority checker/digests narrowly if its existing unlisted-script policy requires it.
- [ ] **Step 6: Run checker tests, `npm run check:requirements`, and `npm run check:authority`**; all GREEN.

### Task 7: Add deterministic CI and release-readiness checks

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Create or Modify: repository verification script only if needed for stable `check:syntax`

**Interfaces:**
- Stable local/CI commands: `npm test`, `npm run check:authority`, `npm run check:syntax`, `npm run check:requirements`, package dry-run.

- [ ] **Step 1: Add `check:syntax`** using a repository-owned deterministic command that covers `bin/`, `scripts/`, `src/`, and `test/` JavaScript without introducing runtime dependencies.
- [ ] **Step 2: Validate `check:syntax` locally** against all JS files and add a regression/static-check test if a helper script is introduced.
- [ ] **Step 3: Create `.github/workflows/ci.yml`** for PRs and pushes to `main`, Node 22, no secrets/provider/browser steps, running the five required gates plus `npm pack --dry-run --json --ignore-scripts`.
- [ ] **Step 4: Pin third-party GitHub Actions to reviewed immutable commits or otherwise document the chosen supply-chain pinning decision; do not use unreviewed floating actions if immutable pins are available.
- [ ] **Step 5: Run the same command sequence locally** and verify the workflow contains no ChatGPT/OpenCLI/browser invocation.

### Task 8: Full verification, provenance update, and first review-round disposition

**Files:**
- Modify: PR #6 description
- Modify: review threads (GitHub metadata)

**Interfaces:**
- Produces: one fully dispositioned review round and a new substantive head eligible for fresh review.

- [ ] **Step 1: Run full deterministic suite** `npm test` and record exact test/pass/fail count.
- [ ] **Step 2: Run** `npm run check:authority`, `npm run check:syntax`, `npm run check:requirements`, `npm pack --dry-run --json --ignore-scripts`, and `git diff --check` or the strongest exact equivalent available in the execution environment.
- [ ] **Step 3: Inspect PR #6 patch for unrelated churn** and confirm recovered commit `f183a500...` is still an ancestor.
- [ ] **Step 4: Update PR #6 description** with separate recovered-baseline and post-recovery-hardening verification sections.
- [ ] **Step 5: Confirm every original review thread has a technical reply and supported resolution.**

### Task 9: Launch and process fresh Codex review rounds

**Files:**
- GitHub review metadata/comments only unless new valid findings require code.

**Interfaces:**
- Input: current PR #6 head.
- Output: no unresolved valid P1, or an explicit recurring-P1 architectural stop.

- [ ] **Step 1: Request a fresh review** by posting `@codex review` on PR #6 after all substantive fixes and CI/policy changes are pushed.
- [ ] **Step 2: Read the complete fresh review and classify each item** using REVIEW-POLICY.md and the Superpowers receiving-code-review discipline.
- [ ] **Step 3: If any P1 is an exact/sibling recurrence**, STOP implementation and report the recurring category, affected invariant, why the prior design failed, and the architectural decision that must be revisited.
- [ ] **Step 4: For genuinely new valid findings**, add RED regression (when deterministic), implement minimal fix, run focused + full gates, reply/resolve, and request another fresh review.
- [ ] **Step 5: Repeat Steps 1-4 until no valid unresolved P1 remains.**
- [ ] **Step 6: Do not merge.** Report PR #6 as merge-eligible or blocked by a recurrence/design issue; merge remains a separate owner-authorized action.

### Task 10: Branch/ruleset enforcement assessment

**Files:**
- Repository settings if connector authority exposes compatible write operations; otherwise documentation only.

**Interfaces:**
- Produces: required CI checks and resolved-conversation policy enforced in GitHub where supported.

- [ ] **Step 1: Inspect repository branch-protection/ruleset capabilities and current settings.**
- [ ] **Step 2: If this connected GitHub surface supports safe writes, configure `main` to require stable CI checks and resolved review conversations, without enabling auto-merge or deployment.**
- [ ] **Step 3: If writes are unavailable, record the exact unsupported operations and the precise owner UI/settings actions needed; do not claim enforcement exists.**
- [ ] **Step 4: Keep release/deploy publication absent; CI/CD remains verification plus release-readiness only.**
