# Repository agent instructions

## Agent skills

### Issue tracker

Track planning and implementation work in GitHub Issues. Read
`docs/agents/issue-tracker.md` before creating or changing issues, milestones,
sub-issues, or dependency edges.

### Triage metadata

Represent triage categories in the durable triage record and workflow state
with labels. Read `docs/agents/triage-labels.md` before triaging an issue.

### Domain docs

This is a single-context repository. Read `docs/agents/domain.md` before
changing product concepts, boundaries, or architectural decisions.

### Orchestration

Read `docs/agents/orchestration.md` before claiming work, delegating a task,
launching parallel lanes, or defining a verification/review gate. Apply the
project routing overlay at `.claude/skill-overlays/delegate-triage.md` when
selecting a delegated route.
