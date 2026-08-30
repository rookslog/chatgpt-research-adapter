# Triage Metadata

The skills speak in terms of two category roles and five workflow-state roles. This file records how each is represented in this repo's issue tracker.

## Category representation

By default, category is a durable field in the latest triage comment or agent brief rather than a label:

| Canonical category | Durable representation |
| ------------------ | ---------------------- |
| `bug` | `**Category:** bug` |
| `enhancement` | `**Category:** enhancement` |

Record exactly one category. If this tracker uses Issue Types or another durable category field, replace the right-hand mapping with that confirmed representation.

## Workflow-state labels

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a workflow role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Wayfinder maps and child decision tickets are planning artifacts managed by their `wayfinder:*` type, dependency, assignment, contract, and closure state. Exclude them from general triage attention unless the repository explicitly opts them into the five-state request workflow.

Edit the category mapping and workflow-label column to match the confirmed tracker vocabulary.
