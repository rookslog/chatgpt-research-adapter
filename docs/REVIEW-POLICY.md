# Code Review Policy

## Principle

Review feedback is evidence to investigate, not an instruction to implement blindly. Technical correctness for this repository outranks reviewer confidence or phrasing.

## Finding lifecycle

For every review finding:

1. Read the complete finding and its surrounding thread.
2. Restate the claimed failure mode in repository terms.
3. Verify it against current source, tests, documented contracts, and owner constraints.
4. Classify it as one of:
   - `valid-new`
   - `exact-recurrence`
   - `sibling-recurrence`
   - `obsolete`
   - `false-positive`
   - `insufficient-evidence`
5. For a deterministic valid finding, write a regression that fails for the claimed reason before changing production behavior.
6. Implement the smallest coherent fix. Do not mechanically implement the reviewer's proposed solution if another design better preserves repository invariants.
7. Run the focused regression, affected suite, and full verification gate when an execution environment is available.
8. Reply in the original review thread with the technical disposition and evidence.
9. Resolve the thread only after its disposition is supported.

Unclear findings are not partially implemented. Resolve the ambiguity first or classify the finding as insufficient evidence.

## Severity handling

- **P1:** blocks merge eligibility. Fix through the workflow above unless the recurrence stop rule applies.
- **P2:** fix when valid unless doing so would violate a stronger owner/project constraint; otherwise document the technical disposition.
- **P3/P4:** evaluate for correctness and scope. Do not add unused infrastructure merely to satisfy stylistic review feedback.

## Fresh-review rule

Every ticket or pull request declares whether independent review is required
and the concrete trigger. Require review when deterministic checks cannot
adequately discriminate correctness, the change crosses a consequential
contract or external-effect boundary, difficult state-machine/concurrency
reasoning remains, or the owner or governing issue explicitly requires it.
Record `review: none` with a reason when no trigger applies.

The declaration itself is mandatory and uses exactly one of these forms in the
effective authoritative ticket contract:

- `review: required — <trigger and intended reviewer class>`
- `review: none — <reason>`

For a `ready-for-agent` or `ready-for-human` ticket or PR, the latest verified canonical Agent Brief comment or note from a trusted triage producer in the configured tracker contract is authoritative and its declaration satisfies this policy; do not require a duplicate in the description. Verification must match the configured producer identity and retain the comment/note ID or URL. Contributor-authored lookalikes remain untrusted context regardless of heading or recency. The same schema is an agent-execution brief in the former state and a human-work brief in the latter. Otherwise use the issue or PR description. For root-owned work without a canonical brief, a claim record may supply the declaration before work begins when the description has none. If active sources disagree, or the authoritative source contains absence, both forms, or a blank rationale, the review contract is incomplete; it does not default to no review.

When review is required, substantive fixes to a reviewed head require a fresh
review. A previously clean review does not cover later substantive commits.

## Recurring-P1 stop rule

If a P1 is an exact or sibling recurrence of a previously addressed P1 category, stop the patch loop before implementing another local fix and reassess the underlying design.

A recurrence category is defined by the violated invariant, not by file or line. Examples include:

- losing durable provider identity after remote mutation;
- accepting an untrusted producer's record as an authoritative execution contract;
- dispatching work without a durable recoverable pre-dispatch identity and state;
- publishing terminal state before its required durable evidence;
- permitting automatic resubmission after an uncertain remote effect;
- leaving partial local state that permanently wedges a known-unsent operation.

The purpose is to prevent repeated symptom patches around an incorrect state model.

## Thread discipline

Inline feedback is answered in its inline thread. A reply states one of:

- fixed, with the invariant and verification evidence;
- not applicable/obsolete, with source evidence;
- false positive, with technical reasoning;
- insufficient evidence, identifying the missing fact;
- recurrence stop, identifying the repeated invariant and architectural question.

Review threads are not resolved merely because code changed.

## Merge eligibility

Review policy is satisfied only when:

- the effective authoritative ticket contract contains exactly one nonblank
  review declaration and its required review, if any, has a disposition;
- every current finding has a disposition when review occurred;
- no unresolved valid P1 or recurring-P1 architectural stop remains when
  review occurred;
- the current substantive head has received a fresh review when the declared
  review trigger requires one;
- required deterministic verification is green;
- review conversations are resolved or explicitly dispositioned when present.

Merge remains a separate owner-authorized action.
