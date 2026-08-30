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

The latest triage record plus the current state label form the issue's triage
classification. Do not retroactively classify historical M006 issues merely to
populate this scheme.
