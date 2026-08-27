# Review, Verification, and CI/CD Design

- Status: approved for implementation 2026-08-26
- Scope: PR #6 post-recovery hardening plus repository-wide verification and CI/CD policy
- Baseline provenance commit: `f183a500f6e9283af8ff42599bc470bc02d768a6`
- Merge/deploy/publish authority: not granted by this design

## 1. Purpose

Turn review feedback, hard requirements, and verification evidence into explicit repository contracts rather than relying on reviewer or agent memory.

The immediate forcing case is PR #6. Its recovered baseline is historically important, but its first post-draft review found one P1 and four P2 findings. Four of those findings concern the same failure domain: durable dispatch state across partial failure. The design therefore treats them as evidence about the state model, not as five unrelated patches.

The repository must preserve a clear distinction between:

1. the exact recovered baseline at `f183a500f6e9283af8ff42599bc470bc02d768a6`; and
2. later post-recovery review-hardening and repository-policy commits.

## 2. Review reception policy

External review findings are inputs, not instructions. For every finding:

1. read the complete finding and surrounding thread;
2. restate the claimed failure mode;
3. verify it against current source, tests, and documented contracts;
4. classify it as valid, obsolete, false positive, insufficient evidence, exact recurrence, sibling recurrence, or genuinely new;
5. for a valid finding, add a regression that fails for the claimed reason before production changes when the behavior is deterministically testable;
6. implement the smallest coherent fix;
7. rerun the focused regression and affected suite;
8. reply in the original review thread with the disposition and evidence;
9. resolve the thread only after the disposition is supported by code/evidence.

A finding must not be implemented merely because a reviewer proposed a solution. The fix follows the repository's actual architecture and owner constraints.

## 3. Severity loop and recurrence stop rule

PR #6 must receive repeated review rounds until it has no unresolved valid P1 findings.

After each implementation round:

1. run the full deterministic verification gate;
2. request a fresh Codex review of the current head;
3. triage every new finding independently;
4. resolve valid findings through the same test-first loop;
5. repeat while valid P1 findings remain.

### Recurring-P1 stop rule

If a new P1 is an exact or sibling recurrence of a previously addressed P1 category, stop the patch loop before implementation and reassess the underlying design.

A recurring category includes the same violated invariant appearing at a different call site, lifecycle phase, mode, or persistence artifact. Examples include losing durable remote identity after provider mutation, declaring terminal state before durable evidence, or leaving unrecoverable partial state after a known-no-remote-effect failure.

The stop condition exists to prevent symptom-by-symptom hardening of an incorrect state model.

## 4. Dispatch lifecycle contract

The durable model must distinguish preparation, dispatch intent, provider handoff, and terminal collection.

```text
prepared
  -> durable dispatch intent
  -> provider mutation
     -> no trustworthy provider reference -> ambiguous_effect
     -> valid provider reference
        -> durable handoff
        -> response/report collection
           -> completed
           -> recovery_required
```

### Hard invariants

- `REQ-DISPATCH-001`: No provider mutation may occur before a durable dispatch intent exists.
- `REQ-DISPATCH-002`: Once the provider returns a valid conversation reference, that reference MUST be made durable before any subsequent fallible response/report read or final-response filesystem write.
- `REQ-DISPATCH-003`: A collection or persistence failure after a durable provider handoff MUST preserve that handoff and MUST NOT authorize automatic resubmission.
- `REQ-DISPATCH-004`: A failure before provider mutation with known-absent remote effect MUST NOT permanently wedge the job through an incomplete dispatch artifact.
- `REQ-DISPATCH-005`: Terminal `completed` state MUST be published only after the answer/report bytes required by that state are durable.
- `REQ-DISPATCH-006`: An uncertain post-intent/post-mutation outcome MUST become a durable non-retry terminal or recovery state rather than escaping as an unclassified error.

The direct `ask` path and `submit-once` path may expose different user-facing result schemas, but they must share these lifecycle invariants instead of maintaining contradictory durability semantics.

### Dispatch publication

Dispatch intent publication should use the same crash-consistency pattern as prepared-job publication:

1. create a private staging directory;
2. write and sync required files;
3. sync the staging directory;
4. atomically rename it into the final `dispatch/` name;
5. sync the parent job directory;
6. only then permit provider mutation.

A failed pre-publication attempt may leave recognizable staging state for diagnosis, but it must not make a subsequent legitimate dispatch appear already submitted.

### Provider handoff

A provider handoff artifact binds at minimum:

- job and turn identity;
- dispatch-intent digest;
- conversation ID;
- canonical conversation URL;
- tool/mode identity when applicable;
- timestamp.

It is exclusive and immutable once written. Terminal result artifacts reference the durable handoff rather than being the first place the conversation identity appears.

## 5. Current PR #6 review findings

The first post-draft review round currently contains:

- P1: persist the conversation reference before awaiting/collecting the answer;
- P2: normalize or reject a relative output root before preparing a later-submittable job;
- P2: sync `jobsRoot` after publishing a prepared bundle;
- P2: classify a successful process with an invalid/blank completed answer inside the guarded post-intent path;
- P2: prevent an incomplete pre-intent dispatch directory from permanently wedging a job.

The first, fourth, and fifth directly exercise the dispatch lifecycle contract. The directory-sync finding exercises crash durability. The output-root finding is an independent CLI boundary inconsistency.

All five require explicit disposition before PR #6 is merge-eligible.

## 6. Hard requirements and verification traceability

Every hard `MUST`, security boundary, acceptance criterion, or release gate must have at least one explicit verification binding.

A requirement may map to multiple verification artifacts, and a test may cover multiple requirements. The contract is coverage, not one-test-per-requirement.

Supported verification classes:

- `test`: deterministic unit/property/regression test;
- `integration`: deterministic multi-component contract test;
- `static-check`: source/authority/dependency/path policy check;
- `live-qualification`: bounded external-system qualification that cannot truthfully be proven offline;
- `manual-gate`: explicit owner/operator decision that cannot be automated.

A machine-readable registry under `verification/requirements.json` records stable requirement IDs and bindings. A repository checker fails when a hard requirement lacks a binding, names a nonexistent deterministic verification artifact, or claims a live/manual requirement is satisfied by a deterministic mock alone.

Initial registry coverage should include the dispatch invariants above plus existing high-value authority, exactly-once, Markdown-fidelity, and live-qualification requirements. It is acceptable to add coverage incrementally, but newly introduced hard requirements must be registered in the same change that introduces them.

## 7. CI design

CI is offline, deterministic, and credential-free.

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` using Node 22. It MUST NOT receive ChatGPT/browser credentials and MUST NOT perform live provider/browser operations.

Required CI checks:

1. install the package in a lifecycle-script-safe way appropriate to this dependency-free/private package;
2. `npm test`;
3. `npm run check:authority`;
4. repository-wide JavaScript syntax check;
5. requirements/verification registry check;
6. `npm pack --dry-run --json --ignore-scripts`;
7. whitespace/diff-equivalent repository hygiene where feasible in CI.

The package scripts should expose stable command names for the syntax and requirements checks so local and CI verification use the same entry points.

### Review gate

The durable repository policy is:

- no unresolved valid P1 may remain at merge;
- review conversations must be resolved or explicitly dispositioned;
- substantive changes after a review round require a fresh review round;
- a recurring P1 category triggers architectural reassessment rather than automatic fixing.

GitHub branch protection/rulesets should require stable CI checks and resolved conversations where repository settings permit. Automated inspection of review-comment severity may supplement this, but it must not become the sole source of truth because reviewer formatting is external and mutable.

## 8. CD / release design

No automatic deployment or publication is introduced.

The current CD surface is release-readiness only:

- deterministic package dry-run;
- optional build/package artifact generation;
- explicit manual gate for any future publish/deploy action;
- no npm publication, deployment, browser manipulation, or provider mutation from CI.

A future deployment target requires a separate design and owner authorization.

## 9. Provenance handling for PR #6

PR #6 remains the baseline-recovery PR, but its final head will no longer be byte-identical to the recovered tree once review hardening is applied.

Therefore:

- `f183a500f6e9283af8ff42599bc470bc02d768a6` remains the immutable recovered-baseline provenance point;
- the recovery manifest continues to describe that commit/tree;
- the PR description must explicitly separate `Recovered baseline` from `Post-recovery review hardening`;
- review fixes and policy/CI commits must not rewrite or squash away the provenance distinction before review;
- any eventual merge method should preserve enough repository history to reconstruct that distinction.

## 10. TDD and verification workflow

For each deterministic review fix:

```text
requirement/finding
  -> failing regression for the observable contract
  -> confirm expected RED
  -> minimal coherent implementation
  -> focused GREEN
  -> affected-suite GREEN
  -> full verification GREEN
  -> thread reply + resolution
```

Tests should prefer externally meaningful behavior and durable artifacts over assertions about mocks. Fault-injection seams are appropriate for crash/persistence ordering where the real failure is otherwise nondeterministic.

A test added after production behavior already exists may still be valuable regression coverage, but it must not be represented as TDD RED evidence unless it was actually observed failing before the relevant implementation.

## 11. Merge-eligibility gate

PR #6 is merge-eligible only when all of the following are true:

- every current review finding has an explicit disposition;
- no unresolved valid P1 remains;
- no recurring-P1 stop condition is active;
- a fresh review round has been performed against the current substantive head;
- all valid blocking review findings from that round are resolved;
- deterministic CI is green;
- requirement-verification checking is green;
- baseline provenance remains explicit;
- no live ChatGPT/browser operation was required to establish the offline merge gate.

Merge itself remains a separate owner-authorized action.

## 12. Non-goals

This work does not:

- repair Web Search or Deep Research selectors;
- run a live ChatGPT smoke;
- authorize retries after uncertain provider mutation;
- add a general queue/reconciliation service;
- deploy or publish the package;
- turn review-bot output into unquestioned requirements;
- build a heavyweight requirements-management system.
