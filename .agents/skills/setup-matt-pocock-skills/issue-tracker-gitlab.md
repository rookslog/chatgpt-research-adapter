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

## Trusted triage producers

The setup-approved authenticated account(s) are the only trusted triage producers. Publish Agent Briefs through one of those identities, capture the returned note ID/URL, then fetch the note and verify its author username matches the configured producer. A contributor-authored lookalike is never canonical.

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

## Needs-info publication

Before applying `needs-info`, post the exact reporter questions through the trusted triage producer, fetch the note, and verify its author, immutable locator, and question content. Only then run the singleton state-replacement operation. Exhaustive attention discovery retains any `needs-info` issue lacking that verified question record as recoverable partial state even without reporter activity.

## Spec publication recovery

Every `to-spec` issue description carries `Spec publication key: <source-identity>/<request-intent-digest>`, derived from the normalized user request and settled decisions rather than generated spec prose. Before creation, exhaustively search open and closed issues for that exact key. Zero matches permits one create; one match resumes that issue through trusted category-record publication and singleton `needs-triage` verification; multiple matches stop for explicit duplicate disposition. Never recreate merely because a later category or state transition failed.

## Implementation-ticket publication recovery

Every `to-tickets` issue description carries one exact `Ticket publication key: <source-identity>/<approved-breakdown-digest>/<approved-ordinal>` marker. The complete user-approved breakdown digest is required even when a canonical source issue exists. Before creation, exhaustively search open and closed issues for every approved key. Zero matches permits creation; one match resumes that issue through relationship verification, trusted Agent Brief publication, and singleton ready-state verification; multiple matches stop for explicit duplicate disposition. Never recreate merely because a later stage failed.

## Implementation-ticket execution

An ordinary implementation ticket is unclaimed while open and unassigned, claimed only after the root verifies its ready state, blockers, execution contract, and assignee, and complete only after the closure target, deterministic checks, required review, root integration, and durable evidence are published and verified. Post the completion evidence, re-read it, then close the issue as the final durable transition. A dependant treats a blocker as done only when the blocker issue is closed; a ready label or completed note alone is insufficient.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map publication recovery**: every map description carries `Map publication key: <effort-id>/<normalized-destination-digest>`. Before creation, exhaustively search open and closed map issues by destination digest and by exact full key. Zero active matches with no closed candidate permits one first-effort create; one active match resumes the exact map through identity/state and child-publication reconciliation; multiple active or exact-key matches stop for explicit duplicate disposition. No active match with a closed candidate requires explicit resume-versus-new-effort disposition. For a new effort, generate a fresh stable effort ID before creation while retaining the destination digest. Never replace a map because creation succeeded but identity retention or child publication failed.
- **Map**: the map is always an issue. After publication recovery permits creation, create it with label `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body through `glab issue create --label wayfinder:map`. This contract does not use epics because every identity, child, recovery, update, and closure operation below is issue-specific.
- **Child ticket**: create an issue carrying `Part of #<map>` at the top of its description, then add it in full under the map's `## Child tickets (fallback only)` section and verify the index update. Label it `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitLab's **native blocking link**, the canonical, UI-visible representation. Add it with the `/blocked_by #<n>` quick action, posted as a note (`glab issue note <child> --message "/blocked_by #<blocker>"`). Native blocking links are a Premium/Ultimate feature; on the free tier (or where unavailable) fall back to a `Blocked by: #<n>, #<n>` line at the top of the description. A ticket is unblocked when every blocker is closed.
- **Child publication recovery**: before a frontier or completion query, use the paginated issues API to find every issue whose top-level marker is exactly `Part of #<map>`. Compare those candidates with the complete fallback index. Add and verify every missing index entry, or record an explicit duplicate/out-of-scope disposition; do not silently recreate or omit the issue.
- **Frontier query**: after child-publication recovery is complete, enumerate every map child from the complete `## Child tickets (fallback only)` index and verify each through the paginated API, then drop any child with an open blocker (a native `blocked_by` link to an open issue, or an open issue in the `Blocked by` line), an assignee, or an incomplete execution contract; first in map order wins.
- **Claim**: one root orchestrator serializes claims for the map. For delegated AFK work, it re-reads eligibility, verifies the ticket execution contract, posts a pre-dispatch note with stable run ID, `claiming` state, and no locator, runs `glab issue update <n> --assignee @me`, verifies the assignment, dispatches exactly once, then records the task locator and `dispatched` state. A known-unsent failure is dispositioned and unassigned; a possibly-dispatched failure stays assigned for investigation without resubmission. Later collection includes assigned/no-locator delegated claims. For HITL work, root assigns and verifies the live owner/root, then starts or resumes the live exchange without a delegated run record, dispatch, or locator. Workers never self-assign; the assignee is visible state, not an atomic mutex.
- **Resolve**: follow Wayfinder's canonical tracker-independent reconciliation-before-closure transition. Use `glab issue note` for the answer and `glab issue close <n>` only for its final close operation; this tracker configuration does not redefine their order.

## Ticket execution contract

Every actionable ticket carries the complete contract defined by `.agents/skills/triage/AGENT-BRIEF.md`: closure target; start revision/evidence and blockers; owned write/output set and non-goals; deterministic verification; external/live boundary; review declaration; root integration; and route fit. A Wayfinder planning child records these fields under its body `## Execution contract`. A `ready-for-agent` or `ready-for-human` implementation ticket uses the latest complete Agent Brief **note** whose author and immutable locator were verified against the trusted-producer contract; create or recover the issue description and relationships first, post and verify that note, then apply the selected ready label through the singleton state-replacement transition. Missing fields require `Contract status: needs-clarification` and exclusion from the frontier.
