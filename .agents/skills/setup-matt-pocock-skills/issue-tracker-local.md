# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file. Each carries one `Ticket publication key:` and one `Execution status:` field.
- A ticket's canonical reference is its full path or `local:<feature-slug>/<NN>`; numbers are reused across feature directories and are never globally resolvable
- Every general-triage request file carries `Created: <RFC 3339 timestamp>` and a plain `Status:` line near the top; a missing legacy timestamp never removes it from discovery
- Every claimed file carries `Claimant: <configured stable claimant identity>` and `Claimed at: <RFC 3339 timestamp>` beside its state. Setup records the non-secret stable claimant identity; unclaimed files omit both fields.
- Before a canonical Agent Brief exists, the canonical pre-brief category is exactly one standalone `**Category:** bug | enhancement` line immediately after the plain `Status:` field. The spec body does not repeat it. When triage embeds a canonical Agent Brief, remove the standalone pre-brief field because the brief's category becomes authoritative; never retain both category slots.
- Triage state is recorded as exactly one `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings). A state transition replaces the plain `Status:` field atomically enough for the filesystem, then re-reads it and verifies exactly one field with the selected value; it never runs label operations.
- Comments and conversation history append to the bottom under `## Comments`. Each entry records `At: <RFC 3339 timestamp>` and `By: reporter | triage` before its body so `needs-info` activity is recoverable.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed) only after the applicable publication-recovery operation proves that no matching artifact exists. Never truncate or replace an existing path implicitly.

## When a skill says "fetch the relevant ticket"

Require the full path or an effort-qualified `local:<feature-slug>/<NN>` reference and resolve it inside that feature directory. Reject a bare number as ambiguous.

## General triage operations

- **Complete inventory**: scan every `.scratch/<feature>/spec.md` and `.scratch/<feature>/issues/*.md`. Exclude `.scratch/<effort>/map.md` and any child file whose `Type:` is `research`, `prototype`, `grilling`, or `task`; Wayfinder owns those planning artifacts. Include every remaining request whose `Status:` is absent or is one of the configured five triage states. Do not use a bounded directory sample or infer absence from one feature directory.
- **Oldest-first order**: sort by the explicit `Created:` timestamp, then canonical path. Put legacy files with no valid `Created:` first, ordered by canonical path, and report the missing metadata instead of omitting them.
- **Reporter activity after `needs-info`**: compare structured comment entries and include the request when the newest `By: reporter` timestamp is later than the newest `By: triage` timestamp. Conservatively include a legacy `needs-info` file with unstructured or invalid comment metadata as activity-unknown; never classify it as inactive from missing evidence.

## Spec publication recovery

The spec body carries `Spec publication key: <source-identity>/<request-intent-digest>`, derived from the normalized user request and settled decisions rather than generated spec prose. Before writing `.scratch/<feature-slug>/spec.md`, absence permits one exclusive create; one existing file with the exact key resumes from its observed category/state stage; a mismatched key stops for explicit reuse or supersession disposition. Never overwrite the path implicitly because a later category or state transition failed.

## Implementation-ticket operations

- **Publication recovery**: before any write, inventory every `.scratch/<feature-slug>/issues/*.md`, reject malformed or duplicate numbers and keys, and compare the complete approved key set. Each ticket has `Ticket publication key: <source-identity>/<approved-breakdown-digest>/<approved-ordinal>`. Zero matches permits creation at one unused number with an exclusive new path; one match resumes that exact file from its observed stage; multiple matches stop for explicit duplicate disposition. Existing unmatched tickets require explicit reuse or supersession disposition. Never implicitly overwrite or replace a ticket, and wire `Blocked by` references only after the approved keys have been reconciled to actual local numbers.
- **Execution state**: ordinary implementation tickets keep triage `Status:` separate from the exact field `Execution status: unclaimed | claimed | completed`. A newly published runnable ticket starts `unclaimed`.
- **Implementation-ticket claim**: re-read that the triage status is runnable, `Execution status: unclaimed`, every blocker is complete, and the execution contract is complete. Replace the execution status with `claimed`, add `Claimant: <configured stable claimant identity>` and `Claimed at: <RFC 3339 timestamp>`, then re-read and verify all three fields before work begins.
- **Implementation-ticket completion**: after the closure target, deterministic verification, review declaration, root integration, and required durable artifact publication are satisfied, append a `## Completion evidence` record with `Completed by:` and `Completed at:`. Replace the execution status with `completed` as the final durable transition, remove the active claimant fields, and re-read both the evidence and exact singleton execution state. A blocker is done only when its referenced ticket verifies `Execution status: completed`; triage `Status:` alone never unblocks a dependant.
- **Canonical brief replacement**: before a local ready-state transition, find the embedded `## Agent Brief` below `Status:`. Insert it when absent, replace the complete existing embedded `## Agent Brief` section in place when one exists, and stop for repair when more than one exists. Re-read the file and verify exactly one complete embedded brief, one category source, and one review declaration before applying the ready state.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map publication recovery**: the map carries `Map publication key: <normalized-destination-digest>`. Before writing `.scratch/<effort>/map.md`, absence permits one exclusive create; one existing file with the exact key resumes through body/state and child-publication reconciliation; a mismatched key stops for explicit reuse or new-effort disposition. Never overwrite the path implicitly.
- **Map**: after publication recovery permits creation, write `.scratch/<effort>/map.md` with its key and `Status: open` near the top, followed by the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); every new child starts with `Status: open`, then transitions explicitly to `claimed` or `resolved`.
- **Child publication recovery**: placement inside `.scratch/<effort>/issues/` is the canonical parent relationship, so there is no second attachment transition. Frontier and completion scans enumerate the complete directory and stop on malformed or duplicate-numbered child files until they are explicitly repaired or dispositioned.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, unclaimed, and contract-complete; exclude `Contract status: needs-clarification`; first by number wins.
- **Claim**: one root orchestrator serializes claims for the map. For delegated AFK work, re-read that the child is `open`, unblocked, and contract-complete; persist a pre-dispatch record with stable run ID, `claiming` state, and no locator; set `Status: claimed`, `Claimant: <configured stable claimant identity>`, and `Claimed at: <RFC 3339 timestamp>`, then verify them; dispatch exactly once; then add the task locator and `dispatched` state. A known-unsent failure is dispositioned and returned to `Status: open` with claimant fields removed; a possibly-dispatched failure stays claimed for investigation without resubmission. Later collection includes claimed/no-locator delegated files. For HITL work, set and verify the same claimed state and claimant fields for the live owner/root, then start or resume the exchange without a delegated run record, dispatch, or locator. On a later session, verify the same claimant before HITL resume; a different or missing identity requires explicit disposition. Workers never self-claim.
- **Resolve**: follow Wayfinder's canonical tracker-independent reconciliation-before-closure transition. Append the answer under `## Answer` and use `Status: resolved` only for its final close operation; this tracker configuration does not redefine their order.
- **Complete map**: after Wayfinder verifies no open child and no fog remain, append the destination outcome and implementation-breakdown owner gate, then set the map's own `Status: resolved` as the final close operation.

## Ticket execution contract

Every actionable ticket file carries the complete contract defined by `.agents/skills/triage/AGENT-BRIEF.md`: closure target; start revision/evidence and blockers; owned write/output set and non-goals; deterministic verification; external/live boundary; review declaration; root integration; and route fit. A Wayfinder planning child records these fields under `## Execution contract`. A `ready-for-agent` or `ready-for-human` implementation ticket embeds the complete canonical Agent Brief in the file below its plain `Status:` field and removes the standalone pre-brief category field. Missing fields require `Contract status: needs-clarification` and exclusion from the frontier.
