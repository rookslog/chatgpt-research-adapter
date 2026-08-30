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
- **Frontier:** open map children with no open blocker and no assignee.
- **Claim:** assign the selected frontier issue before working it.
- **Resolve:** post the decision or finding, close the child, and append a
  one-line context pointer to the map's `Decisions so far` section.

When an authorized operation is not expressible through `gh issue`, use the
documented `gh api` REST endpoint and inspect the resulting relationship.

## Ticket execution contract

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
