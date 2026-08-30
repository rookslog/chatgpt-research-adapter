# Development orchestration

## Claim authority and wave capacity

Exactly one root orchestrator owns frontier selection, claims, shared decisions,
integration, and closure. Workers receive already-claimed tickets and never
self-select or self-assign.

The default maximum is three active lanes, including root-owned work. Increase
it only through an explicit repository decision after verifying disjoint output
ownership and available integration capacity.

## Ticket execution contract

Before any lane starts, record its closure target; start revision or evidence
cutoff and blockers; owned write/output set and non-goals; deterministic checks;
external/live boundary; review declaration; root integration; and route fit.
Missing fields keep the ticket out of the runnable frontier.

## Delegated lifecycle

Root serializes `frontier read -> contract check -> pre-dispatch record ->
assignment and verification -> one dispatch -> task locator`. Reconcile every
assigned child and every pre-dispatch record before selecting new work,
including assigned claims with no locator.

A validated completed result remains assigned and moves directly into a
root-owned closure queue. Root reconciles the finding, publishes the answer,
updates dependencies and the parent map, and closes the child last. Process
that queue before selecting new work; never return a completed result to the
frontier or resubmit it. Keep confirmed in-progress work claimed, return only a
proven known-unsent claim after recording its disposition, and hold any
possibly-dispatched claim for investigation without resubmission.

## Verification and review

Root validates delegated evidence, inspects the integrated artifact or diff,
runs the repository's declared deterministic gate, and dispositions every
required review finding. Live or external behavior requires separate authority
and evidence. A worker success status alone never closes a ticket.
