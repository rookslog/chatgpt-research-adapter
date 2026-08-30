# Development orchestration

## Purpose

This contract is for the root orchestrator and contributors executing tracked
repository work. After reading it, an orchestrator should be able to select an
unblocked issue, form a bounded wave, route each lane, preserve independent
evidence, and integrate the result without relying on prior chat history.

It governs development delivery. It does not define adaptive multi-session
research as a product feature, authorize provider operations, or replace the
acceptance criteria of an issue or milestone.

## Sources of truth

- GitHub issues hold planning questions, dependencies, assignments, and current
  workflow state.
- Repository policies hold stable review, verification, authority, and product
  boundaries.
- The root orchestrator owns shared decisions, integration, exact-head
  verification, and final disposition.
- A delegated result is reported evidence until the root validates its
  load-bearing claims.

When sources conflict, stop the affected lane, preserve the conflict, and
resolve the more specific contract before continuing.

Exactly one root orchestrator is active as claim authority for a map or wave.
GitHub assignment is a visibility mechanism, not an atomic ownership lock:
workers never select or claim their own tickets. For delegated AFK work, root
serializes the final frontier read, contract check, pre-dispatch run-record
write, assignment and verification, single dispatch, and task-locator write.
For HITL work, root serializes the frontier read, contract check, live
owner/root assignment and verification, then begins or resumes the exchange
without a delegated run record, dispatch, or task locator. If a single claim
authority cannot be established, do not launch the wave.

The pre-dispatch record contains the stable run ID, `claiming` state, and no
task locator. If the transition fails, root unassigns only a claim proven not
dispatched after recording its disposition. A possibly-dispatched claim stays
assigned for investigation without resubmission. Every session reconciles
delegated assigned/no-locator claims as well as runs with locators. HITL claims
remain assigned for the live owner/root to resume or explicitly disposition.

## Before a wave

Record a compact execution snapshot:

1. closure target;
2. exact branch and revision;
3. worktree status and known active worktrees;
4. issue frontier and dependency evidence;
5. production and documentation files already being edited;
6. available deterministic verification commands;
7. authorization boundaries for live, account-affecting, publishing, merging,
   or other external actions.

Do not treat an unassigned issue as independent merely because it is open. It
must have no open blocker and must carry the ticket execution contract.

## Ticket done contract

Every claimed lane declares, before launch:

- **Outcome:** the observable deliverable and closure target.
- **Start:** revision, evidence cutoff, and dependency state.
- **Ownership:** one write or output set; shared integration files remain with
  root unless explicitly transferred.
- **Non-goals:** adjacent changes and operations the lane must not perform.
- **Deterministic evidence:** focused checks and the affected/full repository
  gate.
- **External evidence:** separately authorized live or manual observations,
  with deterministic and live claims kept distinct.
- **Review trigger:** the concrete uncertainty or consequence that requires an
  independent reviewer, or `none` with a reason.
- **Integration:** how root will inspect, reconcile, and verify the result.
- **Route fit:** role, model, effort, control surface, reason, and falsifier.

If a lane discovers a contract-bearing decision, overlapping ownership, or a
new authorization requirement, it returns that fact rather than silently
expanding scope.

## Forming parallel waves

Parallelize only independent information channels or disjoint implementation
slices. Fixed transformations and deterministic checks remain scripts or root
commands.

The initial operating cap is three active lanes, including root-owned work.
Increase it only when outputs are disjoint, integration capacity is available,
and the wider wave has a stated benefit. A later wave begins only after root
has reconciled the prior wave's artifacts and refreshed the dependency
frontier.

Delegated research must expose a resumable task/return locator after dispatch.
Root uses a supported waiter/wakeup when available or reconciles every assigned
and pre-dispatch record before selecting new work in the next session. A ticket
remains claimed while its run is confirmed in progress; completed output is
validated and moved directly into a root-owned closure queue while it remains
assigned. Root reconciles the finding, publishes the ticket answer, updates the
map and dependencies, and closes the child last before selecting new work. A
completed result never returns to selection or resubmission. A known-unsent
failure is dispositioned and unassigned, and a possibly-dispatched or lost run
remains held for explicit investigation without automatic resubmission.

For the current decision maps, the intended topology is:

1. run the M007 capability inventory and M008 failure-taxonomy research as
   independent investigation lanes while root conducts the M008 domain-model
   grilling;
2. after those blockers resolve, fan out the now-independent capability and
   epistemic decision tickets;
3. synthesize and obtain owner decisions before publishing implementation
   tickets;
4. parallelize code only across approved vertical slices with disjoint write
   ownership.

## Routing

Routing is a reversible prior, not a model ranking or source of authority.
Scripts handle deterministic work. Agents earn a lane through an independent
information channel, useful parallelism, context isolation, or a narrower
permission boundary.

The owner has selected Terra X-High as the provisional default for the next
three comparable broad M007/M008 investigation lanes. Each run must record its
task shape, requested and delivered route, directly observed usage data when
available, validation result, rework, interventions, and confounders. Three
runs provide a review point, not proof of universal superiority.

This trial does not force Terra X-High onto mechanical work, tightly bounded
implementation with a direct oracle, hostile browser interaction, or a task
whose required tools are unavailable on that surface. Any exception states its
fit before launch.

Independent Sol advice or review is reserved for consequential ambiguity,
weak deterministic oracles, difficult state-machine/concurrency reasoning, or
an explicitly declared high-risk gate. A model supplies another judgment
channel; root and owner decisions remain authoritative.

## Verification and review

The stable deterministic gate is:

1. `npm test`;
2. `npm run check:authority`;
3. `npm run check:requirements`;
4. `npm run check:syntax`;
5. `npm pack --dry-run --json --ignore-scripts`.

Run focused checks during a slice and the complete gate on the integrated
head. Live provider behavior is never inferred from mocks or fixtures and
requires its own bounded qualification authority.

Request independent review when the ticket's declared trigger fires. The
reviewer receives the exact diff or artifact, requirements, known constraints,
and verification evidence rather than the root's desired conclusion. Root
assigns a technical disposition to every finding against current source and
tests before changing work or closing the issue.

## Integration and closure

Root inspects the actual diff or durable artifact, reconciles overlaps,
validates load-bearing claims, and runs the declared gate. A successful worker
status is not completion evidence.

Close an issue only after its observable outcome, verification evidence,
review disposition where required, dependent-document propagation, and
remaining limitations are recorded. Refresh the issue frontier after each
closure.

## Learning and revision

Record orchestration observations without prompts, transcripts, secrets, or
artifact contents. Distinguish planned, requested, delivered, and observed
route identity. The issue's claim and closure comments are the canonical
project record; use their run ID to associate privacy-preserving cross-project
telemetry. Never estimate unavailable time, token, or monetary data.

The Terra X-High trial is reviewed after three comparable runs or earlier after
a scope violation, missing required tool, repeated unsupported claim, or
materially disproportionate validated yield. Changing the project default or
the global routing system remains an owner decision supported by the run
records and relevant benchmark evidence.

Before the first post-M006 implementation slice, explicitly decide whether a
general linter, formatter, type checker, or additional static analysis earns
the change to the repository's dependency and authority contract. Until then,
syntax, authority, requirements, tests, and package checks remain the enforced
deterministic baseline.
