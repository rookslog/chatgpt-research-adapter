# Development orchestration

## Claim authority and wave capacity

Exactly one root orchestrator owns frontier selection, claims, shared decisions,
integration, and closure. Workers receive already-claimed tickets and never
self-select or self-assign.

The repository's explicit maximum is three active lanes, including root-owned
work. Do not increase it ad hoc. Any change requires owner approval and a
durable repository decision that replaces this exact maximum after verifying
disjoint output ownership and available integration capacity.

## Ticket execution contract

Before any lane starts, record its closure target; start revision or evidence
cutoff and blockers; owned write/output set and non-goals; deterministic checks;
external/live boundary; review declaration; root integration including durable
primary-artifact publication; and route fit.
Missing fields keep the ticket out of the runnable frontier.

## Direct delegated research run record

A ticketless direct research invocation may run in root without a claim record.
If root delegates it, root first creates
`docs/research/runs/<run-id>.md` with a stable run ID, exact owned output path,
validation oracle, selected route, `claiming` state, and no task locator before
dispatch. Root dispatches exactly once, then records the locator and
`dispatched` state or a known-unsent/possibly-dispatched disposition. Later
sessions reconcile every nonterminal direct run record before new delegation;
a possibly-dispatched run remains held for investigation without resubmission.
The record stores no prompt, transcript, credential, or account data.

## Delegated lifecycle

Root serializes `frontier read -> contract check -> pre-dispatch record ->
assignment and verification -> one dispatch -> task locator`. Reconcile every
assigned child and every pre-dispatch record before selecting new work,
including assigned claims with no locator.

A validated completed result remains assigned, is published to its authorized
durable destination and verified there, then moves directly into a root-owned
closure queue. Missing publication authority or an incomplete publication
keeps the ticket assigned and open. Root reconciles the finding, publishes the
answer, updates dependencies and the parent map, and closes the child last.
Process that queue before selecting new work; never return a completed result
to the frontier or resubmit it. Keep confirmed in-progress work claimed, return only a
proven known-unsent claim after recording its disposition, and hold any
possibly-dispatched claim for investigation without resubmission.

## Verification and review

Root validates delegated evidence, inspects the integrated artifact or diff,
runs the repository's declared deterministic gate, and dispositions every
required review finding. Live or external behavior requires separate authority
and evidence. A worker success status alone never closes a ticket.
