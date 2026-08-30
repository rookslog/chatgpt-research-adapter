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

## Wayfinding operations

- **Map:** create one issue labelled `wayfinder:map` and assign it to the
  relevant milestone.
- **Child:** create a separate issue with one of `wayfinder:research`,
  `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`, then attach
  it through GitHub's native sub-issue endpoint.
- **Blocking:** use GitHub's native issue-dependency endpoint. Supply the
  blocker's numeric database `id`, not its issue number or GraphQL node ID.
- **Frontier:** enumerate every map child through the paginated sub-issues API,
  then keep open children with no open blocker, no assignee, and a complete
  execution contract. Exclude `Contract status: needs-clarification`. Default
  30-item CLI results are not evidence of a complete frontier.
- **Claim:** one root orchestrator is the serialized claim authority for a map.
  It re-reads eligibility and the execution contract, assigns the issue,
  verifies the assignment, records the stable run ID, and only then dispatches.
  Workers never self-assign; an assignee is visible state, not a mutex.
- **Collect:** every delegated research claim records a resumable task/return
  locator. Root uses the available waiter/wakeup or collects it at the start of
  the next map session; completed artifacts are validated, in-progress work
  remains claimed, and failed runs receive an explicit disposition.
- **Resolve:** while the child remains open, reconcile new or invalidated
  tickets and fog, post the decision or finding, append the map pointer, and
  re-read dependencies. Close the child last because closure can unblock work.

When an authorized operation is not expressible through `gh issue`, use the
documented `gh api` REST endpoint and inspect the resulting relationship.

## Ticket execution contract

`ready-for-agent` is a derived publication state, never a producer default. It
requires a durable category plus the authoritative Agent Brief in
`.agents/skills/triage/AGENT-BRIEF.md`, including every execution-contract
field below. A spec without that brief stays `needs-triage`; a producer with a
missing field routes the issue to clarification. Producer skills reference
this contract rather than defining smaller runnable schemas.

Before implementation or delegated investigation begins, the issue body or a
claim comment must state:

- the closure target and observable deliverable;
- dependencies and the exact starting revision or evidence cutoff;
- one owned write or output set, plus explicit non-goals;
- deterministic checks that must pass;
- any external, live, or owner-controlled evidence that remains separately
  authorization-gated;
- the condition that warrants independent agent review, including the intended
  reviewer class when known;
- the root integration check and issue-closing evidence;
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
- owned output, validation oracle, falsifier, and review trigger.

The closure comment records:

- delivered route and control surface when observable;
- disposition, validation evidence, and root integration result;
- rework and material interventions;
- directly observed usage fields, omitting unavailable values;
- confounders and whether the run counts toward any declared trial.

Do not store prompts, transcripts, credentials, account data, or artifact
contents in this record. One run is an observation, not a route ranking.
