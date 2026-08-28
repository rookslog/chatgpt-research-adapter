# M006 Production Usability — Design

## Lifecycle amendment — 2026-08-28

The accepted lifecycle was subsequently corrected after post-merge review.
Current repair evidence and the one non-reproduced lexical-alias claim are in
[`docs/M006-POST-MERGE-REVIEW-REPAIR.md`](../../M006-POST-MERGE-REVIEW-REPAIR.md).
Issues #15 and #17 remain reopened until that correction is reviewed and
merged.

The original selector and live-qualification plan below remains historical planning. Its Deep-specific implementation projection is superseded by the accepted deterministic lifecycle at `07d7a0dcb2c49998d353a308c5b28adcd80c06f0`: Deep `ask` alone writes intent, performs one pinned OpenCLI v1.8.7 submission, validates and persists its handoff, writes `running`, and returns without a result read. `status` is process-free/read-only; `collect` is nonwaiting (`deep-research-result --wait false`); `wait` is bounded waiting (`--wait true`); neither collector accepts a prompt/mode or can submit.

Accepted Deep state is restartable. Immutable append-only collector generations serialize observation without stealing a live owner. Completion publication is report → terminal result → `response/events/research.completed.v1.json`. The event uses schema `m006.research-completion-event.v1`, type `research.completed.v1`, and fields `schema`, `type`, `job_id`, `turn_id`, `conversation_id`, `conversation_url`, `result_path`, `result_sha256`, `report_path`, `report_sha256`, `source_count`, and `completed_at`. Interrupted event publication is recoverable through later non-submitting collection; no callback, delivery mechanism, or new provider submission was added.

This is deterministic implementation evidence, not a live Deep success claim. The current completed Deep iframe report/source extraction remains blocked on the separately approval-gated Browser Bridge diagnostic, so #16 and live Deep usability remain open. Adaptive multi-wave orchestration is deferred to the next milestone.

**Date:** 2026-08-26  
**Status:** Approved historical design; the lifecycle amendment above records accepted deterministic implementation
**Milestone:** M006 — Production usability  
**Parent issue:** #1

## 1. Objective

Close the smallest remaining gaps between the working ChatGPT research adapter and a dependable, readable, auditable research workflow without expanding the adapter into a general browser-control system.

The milestone consists of four executable issue outcomes:

- #2 — restore explicit Web Search selection;
- #3 — restore explicit Deep Research selection;
- #4 — preserve GFM tables and readable claim IDs in extracted Markdown;
- #5 — live-qualify the expanded-citation and audit-appendix rigor variants.

The implementation should preserve the existing standard-mode behavior, typed `standard | web | deep` exclusivity, exactly-once prompt submission expectations, and receipt/audit semantics.

## 2. Current-state findings

### 2.1 Repository baseline recovered

At design time, `rookslog/chatgpt-research-adapter` contained milestone issues but no committed implementation tree. The exact implementation was subsequently recovered from `/Users/rookslog/Development/chatgpt-research-adapter` and corroborated by local Git tree `d7c0014bdd99c0b9e078015aa5f12922367803ff`. The recovered source/test bytes, 82-test baseline, OpenCLI pin, prompt profiles, receipt schemas, and runtime observations are recorded under `docs/recovery/` and published through PR #6.

**Gate B0 — baseline provenance:** satisfied by PR #6. Later implementation PRs must modify the recovered wrapper rather than replace it from inference.

### 2.2 Selector issues share an upstream failure class

OpenCLI upstream has already addressed the ChatGPT tools-menu drift in which current tool rows are custom tabbable elements rather than only legacy role-based menu items. Current upstream also contains post-selection verification, selected-tool-pill recognition, prompt-text false-positive protection, and composer handling that preserves selected tool pills.

This makes upstream consumption the preferred selector strategy, but not an assumed fix: milestone issues #2/#3 were opened after the relevant upstream work existed. The recovered wrapper's exact pin and invocation path must be tested before deciding whether a dependency uplift alone closes the defect.

### 2.3 Markdown fidelity belongs at the conversion seam

Full-message extraction already preserves the assistant response boundary. The observed degradation occurs when rendered assistant HTML is converted to Markdown: tables are linearized and visible claim-label punctuation can be escaped. The fix should therefore preserve extraction and change only the minimum conversion behavior needed for research output fidelity.

## 3. Chosen architecture

Use a **thin adapter that owns the research contract while consuming upstream browser mechanics whenever they are sufficient**.

The adapter owns:

- typed research modes and exclusivity;
- prompt-profile compilation;
- dependency pinning and compatibility qualification;
- research-output Markdown fidelity;
- conversation/job/turn/output receipts;
- deterministic compatibility fixtures;
- bounded live qualification evidence.

OpenCLI (or the existing browser dependency recovered with the baseline) should continue to own generic ChatGPT browser mechanics such as locating the composer, selecting visible product tools, submitting, waiting, and extracting product state, except where a wrapper-specific incompatibility is demonstrated.

Do not vendor or fork the full ChatGPT browser adapter for M006 unless the recovered baseline proves that consuming upstream cannot satisfy the milestone within the security and compatibility boundaries.

## 4. PR decomposition

Implementation PRs are constrained by **changed implementation + test lines**, counted as additions plus deletions.

- **Soft requirement:** under 800 changed lines per PR, including tests.
- **Hard constraint:** under 1,200 changed lines per PR, including tests.
- At 800–1,199 lines, the PR description must explain why a further split would worsen coherence or verification.
- At 1,200 or more lines, the PR must be split before review.
- Generated lockfile churn and qualification receipts are reported separately and may not be used to disguise an oversized hand-authored implementation diff.

### PR 0 — Recover and pin the adapter baseline

**Purpose:** establish the actual existing wrapper as the repository baseline with provenance intact.

Required contents:

- existing wrapper source, not a guessed replacement;
- dependency and exact OpenCLI/browser pin;
- prompt-profile definitions;
- receipt/job/turn/output data structures already in use;
- deterministic test entrypoint;
- minimal repository documentation needed to reproduce tests;
- a mechanical PR-size check or documented command used on every subsequent PR.

The recovered baseline contains 2,223 implementation/test lines. The owner authorized one intact provenance import through PR #6 so the ChatGPT/GitHub-connector experiment can inspect the complete working system. This is a one-time PR 0 exception; do not refactor while importing, and retain the 1,200-line hard limit for all feature PRs.

**Target:** <800 lines per import slice; hard maximum 1,199.

### PR 1 — Restore explicit research-tool selection

**Issues:** #2 and #3.

Treat Web Search and Deep Research as one selector-contract change unless the recovered implementation makes the combined diff exceed the soft size requirement.

Workflow:

1. Reproduce the wrapper's current Web Search failure with a deterministic current-UI fixture.
2. Reproduce the wrapper's current Deep Research failure with a deterministic current-UI fixture.
3. Determine whether the recovered pin predates the upstream-compatible behavior.
4. Prefer a dependency uplift or minimum upstream-compatible change over a wrapper-local selector fork.
5. Preserve the typed mode contract:
   - `standard` activates neither Web Search nor Deep Research;
   - `web` activates Web Search and not Deep Research;
   - `deep` activates Deep Research and not Web Search.
6. Prove selection before prompt submission.
7. Preserve exactly-once submission behavior.

Deterministic tests must include current custom tool-row markup, selected-tool-pill detection, and false-positive resistance when prompt text merely names a tool.

**Target:** 350–650 changed source/test lines.

**Fallback split:** if the combined selector PR would exceed ~800 lines, split into Web Search and Deep Research PRs while sharing a previously introduced fixture/helper seam rather than duplicating selector infrastructure.

### PR 2 — Preserve research Markdown fidelity

**Issue:** #4.

Keep the existing full-message extraction boundary unchanged. Change only the Markdown conversion behavior needed to preserve research structure.

Required behaviors:

- HTML tables emitted by ChatGPT become valid GitHub Flavored Markdown tables;
- visible claim IDs such as `[C-001]` remain readable without unnecessary escaping;
- lists remain lists;
- links remain links;
- fenced code blocks remain fenced code blocks;
- no content is dropped or duplicated;
- full assistant-message extraction remains unchanged.

Prefer the existing GFM-capable conversion machinery already present in the dependency ecosystem over a new table serializer. Claim-ID de-escaping must be narrowly targeted so that legitimate Markdown escaping is not globally removed.

Use one high-value integration fixture containing a table, claim IDs, lists, links, and fenced code in the same assistant message, plus focused unit cases for edge behavior.

**Target:** 250–450 changed source/test lines.

### PR 3 — Production qualification and receipts

**Issue:** #5, plus live acceptance gates from #2–#4.

This PR is primarily evidence/qualification, not another browser feature expansion.

Run bounded approval-gated live checks for:

- Web Search mode;
- Deep Research mode;
- standard-mode Markdown regression;
- expanded-citation rigor profile;
- audit-appendix rigor profile.

For each relevant live run record the existing receipt fields, including where available:

- job identifier;
- turn identifier;
- native conversation identifier/URL;
- requested mode;
- prompt-profile/version;
- output/result receipt;
- relevant sources/report metadata.

Qualification must distinguish:

1. **format/conformance** — required fields, claim identifiers, appendix structure, source-bearing shape;
2. **citation correctness** — whether the citations actually support the claims they are attached to.

One successful run is an observation, not a reliability estimate. Do not generalize beyond the bounded live evidence.

**Target:** 150–400 changed source/test lines, excluding explicit evidence/receipt artifacts.

## 5. Dependency ordering

```text
PR 0 baseline recovery
   |\
   | +--> PR 1 selector compatibility (#2, #3)
   |
   +----> PR 2 Markdown fidelity (#4)
             \
PR 1 ---------+--> PR 3 bounded live qualification (#5 + live gates)
```

PRs 1 and 2 may be developed independently after PR 0. PR 3 requires both.

## 6. TDD and verification policy

Every implementation behavior starts from a failing deterministic test that represents the observed or acceptance-criteria failure. The smallest implementation change is then made to pass it, followed by the relevant focused suite and the full repository suite.

For selector work, fixtures must test the wrapper contract, not merely duplicate upstream implementation tests. For Markdown work, compare semantic output and important exact syntax rather than snapshotting unrelated product HTML.

Before opening any PR:

1. run the focused tests;
2. run the full suite;
3. run syntax/type/lint/build checks provided by the recovered project;
4. inspect `git diff --check` or equivalent;
5. calculate additions + deletions for source and tests;
6. split if the hard 1,200-line constraint would be violated;
7. record verification commands/results in the PR description.

## 7. Error and ambiguity handling

Fail closed when the requested research tool cannot be proven selected before submission. Do not silently downgrade `web` or `deep` to standard mode.

Preserve ambiguity where the product state cannot establish whether a submit occurred. Live regression work must check recipient-side conversation state before retrying so a selector or renderer failure cannot cause duplicate research submissions.

Do not expose arbitrary browser scripting, arbitrary authenticated request forwarding, or generalized browser-control authority as part of these fixes.

## 8. Non-goals

M006 does not:

- redesign the whole Bridgewright/native-ChatGPT architecture;
- add semantic truth verification to the wrapper;
- make Deep Research the default;
- generalize Web Search/Deep Research selection into arbitrary browser control;
- vendor the entire OpenCLI ChatGPT adapter without demonstrated need;
- infer production reliability from one live turn;
- merge unrelated refactors into milestone PRs.

## 9. Completion criteria

M006 is complete only when:

- the real adapter baseline is committed and reproducible;
- Web Search mode satisfies #2 deterministically and in its bounded live smoke;
- Deep Research mode satisfies #3 deterministically and in its bounded live smoke;
- extracted research Markdown satisfies #4 without changing full-message extraction;
- expanded citations and audit appendix receive the bounded live observations required by #5;
- citation correctness and formatting conformance are reported separately;
- no implementation PR violates the 1,200-line hard constraint;
- all applicable deterministic tests and repository verification checks pass;
- milestone issues and PRs are cross-linked with receipts/evidence sufficient for later audit.

## 10. Revision triggers

Revise this design rather than forcing it if any of the following occurs:

- baseline recovery shows the wrapper architecture materially differs from the assumptions above;
- the recovered dependency already contains the upstream selector behavior yet the deterministic failure still reproduces;
- a dependency uplift creates unrelated incompatibilities large enough to exceed the PR-size policy;
- ChatGPT changes the UI again during qualification;
- the Markdown problem originates before the conversion seam;
- live evidence shows retry or submission semantics differ from the current exactly-once assumptions.
