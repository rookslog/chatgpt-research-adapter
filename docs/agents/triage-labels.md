# Triage metadata

The project uses two category roles and five workflow-state roles.

## Category

GitHub currently exposes no Issue Types for this personal repository. Record
exactly one category in the durable triage comment or agent brief:

- `bug`: existing behavior is broken;
- `enhancement`: new behavior or an improvement is requested.

Use a `**Category:** bug` or `**Category:** enhancement` field. Do not add or
remove `bug` or `enhancement` labels as part of triage. Existing labels with
those names are legacy repository metadata.

## Workflow state

Apply exactly one state label:

| Role | GitHub label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer evaluation is pending |
| `needs-info` | `needs-info` | Reporter information is required |
| `ready-for-agent` | `ready-for-agent` | An agent-ready brief exists |
| `ready-for-human` | `ready-for-human` | Human action or judgment is required |
| `wontfix` | `wontfix` | The request will not be actioned |

Every transition replaces workflow state: remove any of these five labels,
apply the selected target, then re-read the item and verify the target is the
only workflow-state label present. A partial or ambiguous mutation is not a
completed triage outcome.

For `needs-info`, publish and verify the exact reporter questions through the
trusted triage producer before applying the visible state. Attention discovery
retains any `needs-info` item without that verified durable question record as
recoverable partial state, even when the reporter has not replied.

For `wontfix`, the label transition precedes the terminal close. An open
`wontfix` item is recoverable partial terminal state, not a completed outcome;
maintainer-attention queries retain it in an oldest-first recovery bucket until
GitHub closure is verified.

The latest triage record plus the current state label form the issue's triage
classification. Do not retroactively classify historical M006 issues merely to
populate this scheme.

An issue with none of these five workflow-state labels is untriaged even when
it carries unrelated legacy labels such as `bug` or `enhancement`. Attention
queries must compute that missing-state set rather than relying on GitHub's
`no:label` filter.

Wayfinder maps and child decision tickets are explicit planning artifacts, not
triage intake. Exclude issues carrying `wayfinder:*` from the five-state
attention buckets; Wayfinder owns their type, dependency, assignment, contract,
and closure lifecycle. A later implementation ticket derived from a resolved
map re-enters the normal triage contract.

Applying `ready-for-agent` requires both the durable category field and an
agent-ready brief containing the complete execution contract. A maintainer
quick override skips the grilling interview, not those records; if either
remains unavailable, keep the issue non-runnable.

Applying `ready-for-human` requires the same canonical brief schema and
authoritative tracker location, with the remaining human work and review
declaration recorded explicitly. Maintainer-attention queries include these
items as their own oldest-first bucket until that work is dispositioned.
