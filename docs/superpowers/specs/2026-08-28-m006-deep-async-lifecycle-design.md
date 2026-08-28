# M006 Deep Research Async Lifecycle — Design

**Date:** 2026-08-28
**Status:** Approved design; PR #21 correction merged, with later CI follow-up recorded in the repair report
**Milestone:** M006 — Production usability
**Parent issue:** #1

**Post-merge correction:** The asynchronous reviews for PRs #18–#20 completed
after merge and identified credible lifecycle, durability, event, and pinned
reader gaps. Issues #15 and #17 were reopened. The reconciled evidence and
bounded correction merged through PR #21; issues #15 and #17 are closed. The
reconciled repair and subsequent CI follow-up are recorded in
[`docs/M006-POST-MERGE-REVIEW-REPAIR.md`](../../M006-POST-MERGE-REVIEW-REPAIR.md).
This correction adds no provider submission and does not establish live Deep
usability.

## Objective

Make a Deep Research turn behave like delegated work: submit exactly once,
return a durable running handle, collect the completed native report later
without another prompt submission, and publish one host-neutral completion
event. Close the remaining Deep live-qualification gap without expanding the
adapter into a general browser controller.

## Observed failure

The accepted live turn for job
`job_b2273e984efb46c780869d7e0473b6bc` produced conversation
`6a911bab-2eb4-83e9-81df-022439363d58`. The adapter persisted its handoff,
then synchronously called OpenCLI v1.8.7 `deep-research-result`. OpenCLI treated
an in-progress payload without `mapping` as malformed, so the wrapper persisted
`recovery_required` and exited. The same native Deep application continued,
entered synthesis, and completed after 11 minutes with 25 sources and 269
searches. A read after completion still returned `missing mapping`.

This establishes two separate defects:

1. submission and collection are coupled into one synchronous operation;
2. the pinned Deep reader cannot extract the current completed Deep app.

## Chosen architecture

Use a split-phase, monotonic state machine:

```text
prepared -> dispatching -> accepted/running -> completed
                   |              |
                   |              +-> attention/recovery_required
                   +-> ambiguous_effect
```

- `submit` is the only operation allowed to create a provider prompt. For Deep
  mode it stops after the accepted handoff and publishes a durable `running`
  result.
- `status`, `poll`, and `wait` consume the job and conversation receipts. They
  are structurally unable to invoke the provider submission command.
- A collector may be restarted and repeated. A pending observation keeps the
  job nonterminal; it does not rewrite durable provider history.
- Completion writes report and source bytes first, then one immutable completed
  result, then one immutable completion event. Repeated collectors return the
  existing terminal state.
- Ambiguous submission is never converted into a retry. Reconciliation remains
  a separate owner-visible action.

Standard and Web modes retain their current synchronous one-command behavior in
M006. A later milestone may expose the same split-phase API uniformly if that
has practical value.

## Deep extraction boundary

Keep the exact OpenCLI v1.8.7 executable identity and Browser Bridge route. Use
the existing private compatibility-copy seam for a narrowly pinned Deep reader
compatibility change. The supported reader must:

- return a typed pending observation for an active current Deep app;
- extract the full completed report and source set from the current supported
  Deep surface;
- bind the result to the expected conversation ID;
- fail closed on unrecognized pinned source or malformed completed output;
- perform zero provider prompt submissions and expose no arbitrary script or
  browser command surface.

The deterministic fixture must represent only sanitized Deep report structure,
not cookies, storage, account data, unrelated conversations, or authentication
material.

## Completion event

After the completed result is durable, publish
`events/research.completed.v1.json` beneath the job response directory. The
event includes the schema, job ID, turn ID, conversation ID, result path/hash,
report path/hash, source count, and completion time. Exclusive publication and
canonical bytes make replay and duplicate collectors harmless.

The adapter owns this event contract. Codex heartbeat/task wake-up and
delegate-ops delivery are consumers in their owning repositories; they are not
dependencies of this package.

## Verification

Each behavior begins with a deterministic RED test. Required cases include:

- submit returns `running` after exactly one Deep handoff;
- status/poll/wait cannot submit;
- pending, running, completed, malformed, and attention outcomes;
- restart from persisted job/conversation receipts;
- concurrent and repeated collector publication;
- completed current-UI report and source extraction;
- completion event ordering, replay, and interrupted publication;
- unchanged standard/Web behavior and the full authority/requirements suite.

One bounded recovery of the already-completed live conversation may test
collection without creating a provider prompt. A new Deep prompt requires a
separate live-submission decision only if recovery cannot satisfy #3.

## Non-goals

- dynamic multi-wave research orchestration;
- automatic topology or agent-count selection;
- a background service or distributed workflow runtime;
- Codex-specific wake-up code in this repository;
- dependency installation or OpenCLI version uplift;
- generalized authenticated browser automation;
- automatic retry after an ambiguous provider effect.

The adaptive controller, wave decomposition, contradiction lane, and synthesis
workflow are deferred to the milestone after M006, informed by the completed
Deep report and the operational evidence from #15–#17.
