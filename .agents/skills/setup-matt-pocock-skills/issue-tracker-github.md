# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: for an exhaustive inventory, use a paginated API query such as `gh api --paginate 'repos/<owner>/<repo>/issues?state=open&per_page=100'` and exclude entries containing `pull_request`; fetch full comments only for selected issues. A bounded `gh issue list --limit <N>` is acceptable only when the scope has a proven upper bound below `N`. Never infer absence or a complete frontier from the default 30-item result.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: use a paginated REST API query and keep only `.author_association` values `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`). If using GraphQL instead, use its camelCase `authorAssociation` field explicitly. Do not mix the two schemas or use the default 30-item `gh pr list` result for an exhaustive triage claim.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, maintain a complete task list under the map's `## Child tickets (fallback only)` section and put `Part of #<map>` at the top of every child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: enumerate all map children through the paginated sub-issues endpoint (or the complete task-list fallback), then keep only open children with no open blocker, no assignee, and a complete execution contract. Exclude any child marked `Contract status: needs-clarification`. Preserve map order. Never treat the default first 30 repository issues as the map frontier.
- **Claim**: one root orchestrator serializes claims for the map. It re-reads eligibility, verifies the ticket execution contract, posts a pre-dispatch claim record with stable run ID, `claiming` state, and no locator, runs `gh issue edit <n> --add-assignee @me`, verifies the assignment, dispatches exactly once, then records the task locator and `dispatched` state. A known-unsent failure is dispositioned and unassigned; a possibly-dispatched failure stays assigned for investigation without resubmission. Later collection includes assigned/no-locator claims. Workers never self-assign; the assignee is visible state, not an atomic mutex.
- **Resolve**: follow Wayfinder's canonical tracker-independent reconciliation-before-closure transition. Use `gh issue comment` for the answer and `gh issue close <n>` only for its final close operation; this tracker configuration does not redefine their order.
