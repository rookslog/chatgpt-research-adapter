# Issue tracker: GitLab

Issues and specs for this repo live as GitLab issues. Use the [`glab`](https://gitlab.com/gitlab-org/cli) CLI for all operations.

## Conventions

- **Create an issue**: `glab issue create --title "..." --description "..."`. Use a heredoc for multi-line descriptions. Pass `--description -` to open an editor.
- **Read an issue**: `glab issue view <number> --comments`. Use `-F json` for machine-readable output.
- **List issues**: use GitLab API pagination for an exhaustive inventory, with appropriate state and label filters. A bounded `glab issue list` is acceptable only when its explicit limit exceeds a proven upper bound. Never infer absence or a complete frontier from one default page.
- **Comment on an issue**: `glab issue note <number> --message "..."`. GitLab calls comments "notes".
- **Apply / remove labels**: `glab issue update <number> --label "..."` / `--unlabel "..."`. Multiple labels can be comma-separated or by repeating the flag.
- **Close**: `glab issue close <number>`. `glab issue close` does not accept a closing comment, so post the explanation first with `glab issue note <number> --message "..."`, then close.
- **Merge requests**: GitLab calls PRs "merge requests". Use `glab mr create`, `glab mr view`, `glab mr note`, etc., the same shape as `gh pr ...` with `mr` in place of `pr` and `note`/`--message` in place of `comment`/`--body`.

Infer the repo from `git remote -v`; `glab` does this automatically when run inside a clone.

## Merge requests as a triage surface

**MRs as a request surface: no.** _(Set to `yes` if this repo treats external merge requests as feature requests; `/triage` reads this flag.)_

When set to `yes`, MRs run through the same labels and states as issues, using the `glab mr` equivalents:

- **Read an MR**: `glab mr view <number> --comments` and `glab mr diff <number>` for the diff.
- **List external MRs for triage**: use a paginated API inventory, then keep only MRs whose author is not a project member/owner (a contributor's MR, not a maintainer's in-flight work). Do not use one default page for an exhaustive triage claim.
- **Comment / label / close**: `glab mr note`, `glab mr update --label`/`--unlabel`, `glab mr close`.

Unlike GitHub, GitLab numbers issues and MRs separately, so `#42` is unambiguous once you know which surface the maintainer means.

## When a skill says "publish to the issue tracker"

Create a GitLab issue.

## When a skill says "fetch the relevant ticket"

Run `glab issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `glab issue create --label wayfinder:map`. (On GitLab tiers with native epics, an epic may hold the map instead; a labelled issue works everywhere.)
- **Child ticket**: an issue carrying `Part of #<map>` at the top of its description, listed in full under the map's `## Child tickets (fallback only)` section, and labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitLab's **native blocking link**, the canonical, UI-visible representation. Add it with the `/blocked_by #<n>` quick action, posted as a note (`glab issue note <child> --message "/blocked_by #<blocker>"`). Native blocking links are a Premium/Ultimate feature; on the free tier (or where unavailable) fall back to a `Blocked by: #<n>, #<n>` line at the top of the description. A ticket is unblocked when every blocker is closed.
- **Frontier query**: enumerate every map child from the complete `## Child tickets (fallback only)` index and verify each through the paginated API, then drop any child with an open blocker (a native `blocked_by` link to an open issue, or an open issue in the `Blocked by` line), an assignee, or an incomplete execution contract; first in map order wins.
- **Claim**: one root orchestrator serializes claims for the map. It re-reads eligibility, verifies the ticket execution contract, posts a pre-dispatch note with stable run ID, `claiming` state, and no locator, runs `glab issue update <n> --assignee @me`, verifies the assignment, dispatches exactly once, then records the task locator and `dispatched` state. A known-unsent failure is dispositioned and unassigned; a possibly-dispatched failure stays assigned for investigation without resubmission. Later collection includes assigned/no-locator claims. Workers never self-assign; the assignee is visible state, not an atomic mutex.
- **Resolve**: follow Wayfinder's canonical tracker-independent reconciliation-before-closure transition. Use `glab issue note` for the answer and `glab issue close <n>` only for its final close operation; this tracker configuration does not redefine their order.
