# M006 Deep Research Async Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issues #15–#17 by making Deep Research submit once, return a durable running handle, collect the current completed Deep report later, and publish one host-neutral completion event.

**Architecture:** Standard and Web keep their existing synchronous paths. Deep uses one write-once submission operation followed by structurally read-only status, collect, or wait operations. The pinned OpenCLI reader runs through an exact-source-checked private compatibility copy; completed artifacts are published in report → result → event order.

**Tech Stack:** Node.js >=22 ESM; Node built-ins only; pinned `@jackwener/opencli@1.8.7`; existing external Chrome Browser Bridge path; `node:test`; zero package dependencies.

**Spec:** `docs/superpowers/specs/2026-08-28-m006-deep-async-lifecycle-design.md`

## Global Constraints

- Issues: #15, #16, and #17; parent #1; milestone M006.
- Exactly one operation may submit a provider prompt; status/collect/wait may never call `chatgpt ask`.
- Preserve ambiguous-effect and no-automatic-retry semantics.
- Preserve existing standard and Web behavior and receipt schemas.
- Keep exact OpenCLI v1.8.7 identity, no-shell execution, persistent external-Chrome session, zero dependencies, and closed source/import authority.
- Patch only a private temporary OpenCLI copy; never modify `.runtime/opencli` or `~/.opencli`.
- Do not add generalized browser scripting, authenticated request forwarding, a background daemon, or host-specific wake-up code.
- A read-only recovery of the existing completed conversation is allowed; a new provider submission remains a separate final qualification gate.
- Keep changed implementation + test lines below the existing 1,200-line hard PR limit; split if necessary.

---

### Task 0: Repair the deterministic macOS real-path baseline

**Files:**
- Modify: `test/opencli-transport.test.js`

**Interfaces:**
- Consumes: `preflightOpenCli()` identity with `supplied_path` and `real_path`.
- Produces: a platform-stable assertion that the spawned executable is the verified real path.

- [x] Preserve the existing failing test as RED and record its `/var` versus `/private/var` failure.
- [x] Change only the expected executable from the temporary alias `path` to `identity.real_path`.
- [x] Run `node --test test/opencli-transport.test.js` and require zero failures.
- [x] Commit only this test correction.

### Task 1: Let the pinned Deep reader reach existing fallback probes

**Files:**
- Modify: `src/opencli-transport.js`
- Create: `test/opencli-deep-result-compat.test.js`
- Modify: `package.json` only for the refreshed production source digest.

**Interfaces:**
- Consumes: `withPatchedOpenCli()`, exact v1.8.7 `clis/chatgpt/utils.js` source anchors, and `runOpenCliDeepResearchResult()`.
- Produces: `withDeepResearchCompatibleOpenCli()` and unchanged strict completed-row output to callers.

- [ ] RED: build a disposable exact-shape v1.8.7 package whose conversation fetch returns a matching conversation ID without `mapping`, while a later existing fallback returns a completed report and sources. Assert the current adapter exits before fallback.
- [ ] RED: add drift and mismatch fixtures proving an unknown extractor source or mismatched conversation remains a typed failure before child execution.
- [ ] Implement an exact source transformer that changes only the matching-ID/no-`mapping` branch from an immediate throw to a non-candidate, leaving malformed/no-ID and mismatched-ID failures intact.
- [ ] Execute only `deep-research-result` through the private compatibility copy; preserve persistent session routing, executable hash/size identity, exact argv, cleanup, and strict one-row completed contract.
- [ ] GREEN: run the focused compatibility and transport tests.
- [ ] Run a zero-submission read-only recovery probe against conversation `6a911bab-2eb4-83e9-81df-022439363d58`. If an existing fallback returns the completed report and source set, persist a sanitized qualification receipt. If it returns no usable report, treat that as a falsifier and capture only sanitized diagnostics before revising this task; do not add speculative recursive extraction.
- [ ] Refresh the authority SHA-256 pin for `src/opencli-transport.js` and commit the coherent slice.

### Task 2: Split Deep submission from resumable collection

**Files:**
- Modify: `src/direct-ask.js`
- Modify: `src/opencli-transport.js`
- Modify: `src/cli.js`
- Modify: `test/direct-ask.test.js`
- Modify: `test/opencli-transport.test.js`
- Modify: `test/ask-cli.test.js`
- Modify: `package.json` only for refreshed production source digests.

**Interfaces:**
- Produces:
  - `submitDeepPreparedJob({ outputRoot, jobId, jobPath, openCliPath, ... })`
  - `getDeepPreparedJobStatus({ outputRoot, jobId })`
  - `collectDeepPreparedJob({ outputRoot, jobId, openCliPath, ... })`
  - `waitDeepPreparedJob({ outputRoot, jobId, openCliPath, ... })`
  - `runOpenCliDeepResearchStatus({ executablePath, identity, conversationId, ... })`
- CLI:
  - `status --output-root <absolute> --job-id <id>`
  - `collect --output-root <absolute> --job-id <id> --opencli <absolute>`
  - `wait --output-root <absolute> --job-id <id> --opencli <absolute>`

- [ ] RED: Deep `ask` writes intent and accepted handoff, returns `accepted/running`, invokes exactly one ask, and never invokes a result reader.
- [ ] RED: status derives the highest valid durable state without an OpenCLI argument or child process.
- [ ] RED: collect invokes only `deep-research-result --wait false`; wait invokes only `--wait true`; neither grammar accepts a prompt or mode.
- [ ] RED: collector timeout/error after accepted handoff stays collectable and cannot create `ambiguous_effect` or resubmit.
- [ ] RED: duplicate/concurrent submit fails before process spawn; repeated/concurrent collectors return the existing valid terminal result and cannot overwrite artifacts.
- [ ] Implement immutable `running.json` plus report/result idempotent publication. Keep `result.json` terminal and immutable; an intent without handoff remains attention-required and never auto-resubmits.
- [ ] Preserve the existing standard/Web branch byte-for-byte except for mode dispatch selection.
- [ ] GREEN: run focused CLI, direct-ask, and transport tests; refresh source pins; commit.

### Task 3: Publish one host-neutral completion event

**Files:**
- Modify: `src/direct-ask.js`
- Modify: `test/direct-ask.test.js`
- Modify: `package.json` only for the refreshed source digest.

**Interfaces:**
- Produces: `<job>/response/events/research.completed.v1.json` with schema, event type, job/turn/conversation identity, result path/hash, report path/hash, source count, and completion time.

- [ ] RED: completion event is absent before report and terminal result are durable.
- [ ] RED: interrupted event publication is recoverable by a later read-only collector without another provider operation.
- [ ] RED: repeated or concurrent collectors publish at most one byte-identical event and return the existing completed result.
- [ ] Implement canonical exclusive/idempotent event publication after completed result persistence.
- [ ] Keep attention/failure states typed but do not add external delivery callbacks.
- [ ] GREEN: run focused tests; refresh the source pin; commit.

### Task 4: Propagate contracts, requirements, and milestone evidence

**Files:**
- Modify: `verification/requirements.json`
- Modify: `README.md`
- Modify: `docs/M006-PLAN.md`
- Modify: `docs/PROJECT-BOUNDARY.md`
- Modify: `docs/EVALUATION.md`
- Modify: `docs/superpowers/specs/2026-08-26-m006-production-usability-design.md`

**Interfaces:**
- Produces: current CLI/runbook documentation and deterministic requirement bindings for split submission, read-only collection, completed extraction, and event ordering.

- [ ] Add hard deterministic requirements for no-submit collectors, resumable accepted state, completed report extraction, and result-before-event ordering.
- [ ] Replace stale claims that Web/Deep remain selector-blocked with dated current observations.
- [ ] Link #15–#17 beneath #1 and record that adaptive multi-wave orchestration is deferred to the next milestone.
- [ ] Run requirements and reference checks; commit documentation and requirement bindings.

### Task 5: Exact-head review, qualification, and disposition

**Files:**
- No production changes unless a review finding enters the bounded fix loop.

- [ ] Run focused tests, full `npm test` with `TMPDIR=/private/tmp`, authority, requirements, syntax, `git diff --check`, and `npm pack --dry-run`.
- [ ] Count implementation + test changes and enforce the PR limit.
- [ ] Request an independent exact-head whole-branch review; fix every Critical/Important finding and re-review the fix delta.
- [ ] Push the feature branch and open a review PR linked to #15–#17 without merging.
- [ ] Use the already-completed conversation for a zero-submission extraction qualification where possible.
- [ ] If all deterministic criteria and existing-conversation qualification are satisfied, post evidence and close #15–#17 as their actual criteria permit. Keep #3 open if its exact end-to-end live criterion still requires a new provider turn.
- [ ] Surface one precise approval gate for at most one new Deep provider submission only if it remains necessary to close #3/M006 after review.

## Dependency and conflict scan

| Tasks | Shared surface | Ruling |
| --- | --- | --- |
| 0 → 1/2 | `test/opencli-transport.test.js` | Baseline correction lands first; later tasks preserve the real-path assertion. |
| 1 → 2 | Deep transport reader | Extraction compatibility lands before status/wait split so lifecycle tests target the real reader contract. |
| 2 → 3 | `src/direct-ask.js`, terminal result | Lifecycle defines durable ordering; event task consumes the completed result and adds no submission path. |
| 2/3 → 4 | Schemas and CLI | Documentation follows exact implemented names and bytes, not projections. |
| 1–4 → 5 | Whole branch | No task claims live usability until exact-head review and bounded qualification. |

No task may implement the adaptive multi-wave controller. That work starts only after M006 disposition.
