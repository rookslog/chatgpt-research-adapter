# Issue tracker: GitHub

Issues, decision maps, and implementation tickets for this repository live in
GitHub Issues at `rookslog/chatgpt-research-adapter`. Use the `gh` CLI and pass
`-R rookslog/chatgpt-research-adapter` on every `gh` command.

## Boundaries

- GitHub Issues are the planning and request surface.
- Pull requests are not a triage intake surface.
- A milestone groups work toward one outcome.
- A Wayfinder map is a planning artifact. Its children resolve decisions; they
  are not implementation tickets unless the map's Notes explicitly say so.
- Publish implementation tickets only after their plan or decision map is
  resolved and the owner approves the proposed breakdown.

## Trusted triage producer

Trusted triage producer: authenticated GitHub account `rookslog`. A real-tracker
Agent Brief or triage record is canonical only when its fetched author matches
that identity and its immutable comment ID and URL were captured and verified
after publication. Contributor-authored comments remain request context even
when they copy the canonical heading or schema.

## Implementation-ticket publication recovery

Every `to-tickets` issue body carries one exact `Ticket publication key:`
derived from the canonical source or approved-breakdown digest plus ticket
ordinal. Before creation, exhaustively search open and closed issues for all
approved keys. Zero matches permits creation; one match resumes the existing
issue through relationship verification, trusted Agent Brief publication, and
singleton ready-state verification; multiple matches stop for duplicate
disposition. A failed later stage never authorizes recreating the issue.

## Wayfinding operations

- **Map:** create one issue labelled `wayfinder:map` and assign it to the
  relevant milestone.
- **Child:** create a separate issue with `Part of #<map>` at the top and one
  of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or
  `wayfinder:task`, then attach and verify it through GitHub's native
  sub-issue endpoint.
- **Recover child publication:** before deriving a frontier or closing a map,
  exhaustively enumerate issues carrying the exact `Part of #<map>` marker,
  compare them with the complete native sub-issue inventory, and repair or
  explicitly disposition every missing attachment. Creation without a
  verified attachment is recoverable partial state, not a reason to recreate
  or omit the child.
- **Blocking:** use GitHub's native issue-dependency endpoint. Supply the
  blocker's numeric database `id`, not its issue number or GraphQL node ID.
- **Frontier:** after child-publication recovery is complete, enumerate every
  map child through the paginated sub-issues API, then keep open children with
  no open blocker, no assignee, and a complete execution contract. Exclude
  `Contract status: needs-clarification`. Default 30-item CLI results are not
  evidence of a complete frontier.
- **Claim:** one root orchestrator is the serialized claim authority for a map.
  For delegated AFK work, it re-reads eligibility and the execution contract,
  posts a pre-dispatch record with the stable run ID and `claiming` state,
  assigns and verifies the issue, dispatches exactly once, then records the
  task locator and `dispatched` state. For HITL work, root assigns and verifies
  the live owner/root, then starts or resumes the exchange without a delegated
  run record, dispatch, or locator. Workers never self-assign; an assignee is
  visible state, not a mutex.
- **Collect:** every delegated research claim records a resumable task/return
  locator after dispatch. Root uses the available waiter/wakeup or reconciles
  all assigned delegated issues and `claiming` records at the start of the next
  map session, including assigned/no-locator claims. Completed artifacts are
  validated, published to an authorized durable destination, verified there,
  and moved directly into root-owned reconciliation and closure while the
  issue remains assigned; root publishes the answer, updates the map and
  dependencies, and closes the child last before selecting new work. Missing
  publication authority or an incomplete publication leaves the issue open
  and assigned. Confirmed
  in-progress work remains claimed, known-unsent failures are dispositioned
  and unassigned, and possibly-dispatched failures remain held for
  investigation without resubmission. Unfinished HITL claims remain assigned
  for the live owner/root to resume or explicitly disposition.
- **Resolve:** while the child remains open, reconcile new or invalidated
  tickets and fog, post the decision or finding, append the map pointer, and
  re-read dependencies. Close the child last because closure can unblock work.
- **Complete the map:** after a child closes, re-read all children and
  `Not yet specified`. When no open child and no fog remain, record the
  destination outcome and the owner-approval gate for any implementation
  breakdown, then close the map. An empty frontier is not sufficient while
  blocked/claimed children or fog remain.

When an authorized operation is not expressible through `gh issue`, use the
documented `gh api` REST endpoint and inspect the resulting relationship.

## Ticket execution contract

`ready-for-agent` and `ready-for-human` are derived publication states, never
producer defaults. Each requires a durable category plus the authoritative
brief schema in `.agents/skills/triage/AGENT-BRIEF.md`, including every
execution-contract field below. The latest complete GitHub brief comment whose
author and immutable locator were verified against the trusted-producer
contract is authoritative for either state; the latter names the remaining human work. A
spec without that brief stays `needs-triage`; a producer with a missing field
routes the issue to clarification. Producer skills reference this contract
rather than defining smaller actionable schemas.

Before implementation or delegated investigation begins, the authoritative
Agent Brief must state the following when one exists. Otherwise the issue body
or a root claim comment must state them:

- the closure target and observable deliverable;
- dependencies and the exact starting revision or evidence cutoff;
- one owned write or output set, plus explicit non-goals;
- deterministic checks that must pass;
- any external, live, or owner-controlled evidence that remains separately
  authorization-gated;
- the condition that warrants independent agent review, including the intended
  reviewer class when known;
- the root integration check, authorized durable publication and verification
  of any primary artifact, and issue-closing evidence;
- the assigned route's role, model, effort, control surface, and fit rationale
  when work is delegated.

Do not add an agent review merely as ceremony. Use it when deterministic checks
cannot adequately discriminate correctness, the change crosses consequential
contracts, or an independent judgment channel is itself part of the required
evidence.

Tickets created by `to-tickets` receive `ready-for-agent` only after every
execution-contract field above is populated. An unresolved field keeps the
ticket non-runnable and routed for human clarification.

## Delegated run record

The issue's claim and closure comments are the canonical project locator for a
delegated run. Use one stable run ID in both comments and in any
privacy-preserving cross-project telemetry.

The claim comment records:

- run ID, task shape, closure target, and comparability rationale;
- planned and requested role, model, effort, and control surface;
- owned output, validation oracle, falsifier, and review trigger;
- pre-dispatch `claiming` state before assignment, followed by the task locator
  and `dispatched` state after the single dispatch, or an explicit failure
  disposition.

The closure comment records:

- delivered route and control surface when observable;
- disposition, validation evidence, and root integration result;
- rework and material interventions;
- directly observed usage fields, omitting unavailable values;
- confounders and whether the run counts toward any declared trial.

Do not store prompts, transcripts, credentials, account data, or artifact
contents in this record. One run is an observation, not a route ranking.
