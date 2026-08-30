# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- A ticket's canonical reference is its full path or `local:<feature-slug>/<NN>`; numbers are reused across feature directories and are never globally resolvable
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Require the full path or an effort-qualified `local:<feature-slug>/<NN>` reference and resolve it inside that feature directory. Reject a bare number as ambiguous.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` with `Status: open` near the top, followed by the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); every new child starts with `Status: open`, then transitions explicitly to `claimed` or `resolved`.
- **Child publication recovery**: placement inside `.scratch/<effort>/issues/` is the canonical parent relationship, so there is no second attachment transition. Frontier and completion scans enumerate the complete directory and stop on malformed or duplicate-numbered child files until they are explicitly repaired or dispositioned.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, unclaimed, and contract-complete; exclude `Contract status: needs-clarification`; first by number wins.
- **Claim**: one root orchestrator serializes claims for the map. For delegated AFK work, re-read that the child is `open`, unblocked, and contract-complete; persist a pre-dispatch record with stable run ID, `claiming` state, and no locator; set `Status: claimed` and verify it; dispatch exactly once; then add the task locator and `dispatched` state. A known-unsent failure is dispositioned and returned to `Status: open`; a possibly-dispatched failure stays claimed for investigation without resubmission. Later collection includes claimed/no-locator delegated files. For HITL work, set and verify `Status: claimed` for the live owner/root, then start or resume the exchange without a delegated run record, dispatch, or locator. Workers never self-claim.
- **Resolve**: follow Wayfinder's canonical tracker-independent reconciliation-before-closure transition. Append the answer under `## Answer` and use `Status: resolved` only for its final close operation; this tracker configuration does not redefine their order.
- **Complete map**: after Wayfinder verifies no open child and no fog remain, append the destination outcome and implementation-breakdown owner gate, then set the map's own `Status: resolved` as the final close operation.

## Ticket execution contract

Every runnable ticket file carries the complete contract defined by `.agents/skills/triage/AGENT-BRIEF.md`: closure target; start revision/evidence and blockers; owned write/output set and non-goals; deterministic verification; external/live boundary; review declaration; root integration; and route fit. A Wayfinder planning child records these fields under `## Execution contract`. A `ready-for-agent` implementation ticket embeds the complete canonical Agent Brief in the file below its plain `Status:` field. Missing fields require `Contract status: needs-clarification` and exclusion from the frontier.
