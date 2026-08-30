# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,author,createdAt,updatedAt,state,comments,labels,url --jq '.'`. Select JSON fields before any `--jq` filter; do not filter the human-formatted `--comments` view.
- **List issues**: for an exhaustive inventory, use a paginated API query such as `gh api --paginate 'repos/<owner>/<repo>/issues?state=open&per_page=100'` and exclude entries containing `pull_request`; fetch full comments only for selected issues. A bounded `gh issue list --limit <N>` is acceptable only when the scope has a proven upper bound below `N`. Never infer absence or a complete frontier from the default 30-item result.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Trusted triage producers

The setup-approved authenticated account(s) are the only trusted triage producers. Publish Agent Briefs through one of those identities, capture the returned comment ID/URL, then fetch the comment and verify its `user.login` matches the configured producer. A contributor-authored lookalike is never canonical.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --json number,title,body,author,createdAt,updatedAt,state,comments,labels,url --jq '.'` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: use a paginated REST API query and keep `.author_association` values `CONTRIBUTOR`, `FIRST_TIMER`, `FIRST_TIME_CONTRIBUTOR`, `MANNEQUIN`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`). If using GraphQL instead, use its camelCase `authorAssociation` field explicitly. Do not mix the two schemas or use the default 30-item `gh pr list` result for an exhaustive triage claim.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --json number,title,body,author,createdAt,updatedAt,state,comments,labels,url --jq '.'`.

## Needs-info publication

Before applying `needs-info`, post the exact reporter questions through the trusted triage producer, fetch the comment, and verify its author, immutable locator, and question content. Only then run the singleton state-replacement operation. Exhaustive attention discovery retains any `needs-info` issue lacking that verified question record as recoverable partial state even without reporter activity.

## Terminal triage recovery

After applying and verifying singleton `wontfix`, perform the branch-specific
comment/publication prerequisites and close the issue or PR. Re-read its state.
Any open `wontfix` item is recoverable partial terminal state and remains in
maintainer attention until closure is verified; do not hide it by removing the
label or claiming completion.

## Spec publication recovery

Every `to-spec` issue body carries `Spec publication key: <source-identity>/<request-intent-digest>`, derived from the normalized user request and settled decisions rather than generated spec prose. Before creation, exhaustively search open and closed issues for that exact key. Zero matches permits one create; one match resumes that issue through trusted category-record publication and singleton `needs-triage` verification; multiple matches stop for explicit duplicate disposition. Never recreate merely because a later category or state transition failed.

## Implementation-ticket publication recovery

Every `to-tickets` issue body carries one exact `Ticket publication key: <source-identity>/<approved-breakdown-digest>/<approved-ordinal>` marker. The complete user-approved breakdown digest is required even when a canonical source issue exists. Before creation, exhaustively search open and closed issues for every approved key. Zero matches permits creation; one match resumes that issue through relationship verification, trusted Agent Brief publication, and singleton ready-state verification; multiple matches stop for explicit duplicate disposition. Never recreate merely because a later stage failed.

## Implementation-ticket execution

An ordinary implementation ticket is unclaimed while open and unassigned, claimed only after the root verifies its ready state, blockers, execution contract, and assignee, and complete only after the closure target, deterministic checks, required review, root integration, and durable evidence are published and verified. Post the completion evidence, re-read it, then close the issue as the final durable transition. A dependant treats a blocker as done only when the blocker issue is closed; a ready label or completed comment alone is insufficient.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map publication recovery**: every map body carries `Map publication key: <effort-id>/<normalized-destination-digest>`. Before creation, exhaustively search open and closed map issues by destination digest and by exact full key. Zero active matches with no closed candidate permits one first-effort create; one active match resumes the exact map through identity/state and child-publication reconciliation; multiple active or exact-key matches stop for explicit duplicate disposition. No active match with a closed candidate requires explicit resume-versus-new-effort disposition. To resume the closed candidate, run `gh issue reopen <n>`, then fetch it with `gh issue view <n> --json state --jq .state` and verify the state is exactly `OPEN` before changing the map or any child. For a new effort, generate a fresh stable effort ID before creation while retaining the destination digest. Never replace a map because creation succeeded but identity retention or child publication failed.
- **Map**: after publication recovery permits creation, create one issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: create an issue with `Part of #<map>` at the top of its body, then link it to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint) and verify the relationship. Where sub-issues aren't enabled, add it to the complete task list under the map's `## Child tickets (fallback only)` section and verify that index update. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Child publication recovery**: before a frontier or completion query, use a paginated issue inventory to find every issue whose top-level marker is exactly `Part of #<map>`. Compare those candidates with the complete sub-issue relationship or fallback task list. Repair and verify every missing attachment/index entry, or record an explicit duplicate/out-of-scope disposition; do not silently recreate or omit the issue.
- **Frontier query**: after child-publication recovery is complete, enumerate all map children through the paginated sub-issues endpoint (or the complete task-list fallback), then keep only open children with no open blocker, no assignee, and a complete execution contract. Exclude any child marked `Contract status: needs-clarification`. Preserve map order. Never treat the default first 30 repository issues as the map frontier.
- **Claim**: one root orchestrator serializes claims for the map. For delegated AFK work, it re-reads eligibility, verifies the ticket execution contract, posts a pre-dispatch claim record with stable run ID, `claiming` state, and no locator, runs `gh issue edit <n> --add-assignee @me`, verifies the assignment, dispatches exactly once, then records the task locator and `dispatched` state. A known-unsent failure is dispositioned and unassigned; a possibly-dispatched failure stays assigned for investigation without resubmission. Later collection includes assigned/no-locator delegated claims. For HITL work, root assigns and verifies the live owner/root, then starts or resumes the live exchange without a delegated run record, dispatch, or locator. Workers never self-assign; the assignee is visible state, not an atomic mutex.
- **Resolve**: follow Wayfinder's canonical tracker-independent reconciliation-before-closure transition. Use `gh issue comment` for the answer and `gh issue close <n>` only for its final close operation; this tracker configuration does not redefine their order.

## Ticket execution contract

Every actionable ticket carries the complete contract defined by `.agents/skills/triage/AGENT-BRIEF.md`: closure target; start revision/evidence and blockers; owned write/output set and non-goals; deterministic verification; external/live boundary; review declaration; root integration; and route fit. A Wayfinder planning child records these fields under its body `## Execution contract`. A `ready-for-agent` or `ready-for-human` implementation ticket uses the latest complete Agent Brief **comment** whose author and immutable locator were verified against the trusted-producer contract; create or recover the issue body and relationships first, post and verify that comment, then apply the selected ready label through the singleton state-replacement transition. Missing fields require `Contract status: needs-clarification` and exclusion from the frontier.
