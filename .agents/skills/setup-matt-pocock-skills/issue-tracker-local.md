# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); every new child starts with `Status: open`, then transitions explicitly to `claimed` or `resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, unclaimed, and contract-complete; exclude `Contract status: needs-clarification`; first by number wins.
- **Claim**: one root orchestrator serializes claims for the map. Re-read that the child is `open`, unblocked, and contract-complete; persist a pre-dispatch record with stable run ID, `claiming` state, and no locator; set `Status: claimed` and verify it; dispatch exactly once; then add the task locator and `dispatched` state. A known-unsent failure is dispositioned and returned to `Status: open`; a possibly-dispatched failure stays claimed for investigation without resubmission. Later collection includes claimed/no-locator files. Workers never self-claim.
- **Resolve**: follow Wayfinder's canonical tracker-independent reconciliation-before-closure transition. Append the answer under `## Answer` and use `Status: resolved` only for its final close operation; this tracker configuration does not redefine their order.
