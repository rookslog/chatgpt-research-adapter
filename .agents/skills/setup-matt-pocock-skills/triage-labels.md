# Triage Metadata

The skills speak in terms of two category roles and five workflow-state roles. This file records how each is represented in this repo's issue tracker.

## Category representation

By default, category is a durable field in the latest real-tracker triage comment or agent brief, or in the configured local ticket record, rather than a label:

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

Maintainer-attention discovery includes `ready-for-human` as its own oldest-first bucket; human-required work must not disappear from the queue.

Every workflow-state transition uses the configured replacement operation. A real tracker removes all currently applied labels from this five-role mapping, applies the selected target, and re-reads the record to verify exactly one mapped state label remains. Local Markdown replaces and verifies its single plain `Status:` field. A custom tracker must define and verify its equivalent.

For `needs-info`, publish and verify the exact reporter questions before applying the visible state. Discovery treats `needs-info` without that verified durable question record as recoverable partial state requiring maintainer attention, even when the reporter has not replied.

For Local Markdown, use one canonical pre-brief category field immediately after the plain `Status:` field. When a canonical Agent Brief is embedded for either ready state, remove that standalone field and use the brief's category instead; never retain both.

Wayfinder maps and child decision tickets are planning artifacts managed by their `wayfinder:*` type, dependency, assignment, contract, and closure state. Exclude them from general triage attention unless the repository explicitly opts them into the five-state request workflow.

Edit the category mapping and workflow-label column to match the confirmed tracker vocabulary.
