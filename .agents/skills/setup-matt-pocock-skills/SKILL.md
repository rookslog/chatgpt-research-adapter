---
name: setup-matt-pocock-skills
description: "Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills."
---

# Setup Matt Pocock's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker**: where issues live (GitHub by default; local markdown is also supported out of the box)
- **Triage metadata**: representation for two category roles plus label strings for five workflow-state roles
- **Domain docs**: where `CONTEXT.md` and ADRs live, and the consumer rules for reading them

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config`: is this a GitHub repo? Which one?
- `AGENTS.md` and `CLAUDE.md` at the repo root: does either exist? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/`: does this skill's prior output already exist?
- `.scratch/`: a sign that a local-markdown issue tracker convention is already in use
- Is any triage-state consumer or producer installed? Check at least `triage`, `to-spec`, and `to-tickets`, and inspect other installed skills (excluding this setup skill itself) for the canonical workflow states. This decides whether Section B runs at all.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. These are present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order. One section, one answer, then the next.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip the section entirely when exploration already settled it (Section B when no installed skill consumes or produces triage state, Section C when there's no monorepo).

**Section A: Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `to-tickets`, `triage`, and `to-spec` read from and write to it. They need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: these skills were designed for GitHub. If a `git remote` points at GitHub, propose that. If a `git remote` points at GitLab (`gitlab.com` or a self-hosted host), propose GitLab. Otherwise (or if the user prefers), offer:

- **GitHub**: issues live in the repo's GitHub Issues (uses the `gh` CLI)
- **GitLab**: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- **Local markdown**: issues live as files under `.scratch/<feature>/` in this repo (good for solo projects or repos without a remote)
- **Other** (Jira, Linear, etc.): elicit and confirm the complete tracker operation contract below; a one-paragraph product description is not sufficient

Before accepting a real issue tracker, verify that it can host issues. For GitHub, read the repository REST field `.has_issues`; for GitLab, read `.issues_enabled`. If issues are disabled or capability cannot be established, do not treat label access as proof that the tracker is usable: report setup incomplete and ask the user to enable issues or choose another tracker.

For an **Other** tracker, require concrete commands or API operations for issue create/read/comment/category/state mutation plus every Wayfinder operation: map creation; child creation with a durable parent marker or canonical placement; attachment to that map or fallback-index update; recovery and reconciliation when creation succeeds but attachment/indexing fails; complete child enumeration; blocker add/read; frontier derivation; delegated and HITL claims; known-unsent and possibly-dispatched recovery; child resolution; and terminal map closure. Record authentication and mutation authority boundaries without secrets. Verify the issue capability and at least one read-only inventory operation before completion; if any required operation or capability is unknown, keep setup incomplete.

Record the choice in `docs/agents/issue-tracker.md`. The GitHub and GitLab templates carry a "PRs as a request surface" flag, defaulted **off**. Leave it off and don't raise it: a user who wants external PRs in the triage queue can flip the flag in the file later.

**Section B: Triage metadata.** Run this section whenever any installed skill consumes or produces triage state, including `triage`, `to-spec`, or `to-tickets`. Skip it only when exploration established that no installed skill uses the category or workflow-state contract.

If it is installed, ask exactly one question:

> Do you want to keep the default triage metadata? (recommended: **yes**)

The default category representation is one durable field in the latest triage record or agent brief: `**Category:** bug` or `**Category:** enhancement`. The five workflow-state labels each use their canonical name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write both mappings as-is. Only if the user says no, collect the category representation and state-label overrides together so `triage` can record exactly one category and apply existing workflow labels without creating duplicates.

**Section C: Domain docs.** Default to **single-context** (one `CONTEXT.md` + `docs/adr/` at the repo root). This fits almost every repo; write it without asking.

Offer **multi-context** (a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files) only when exploration found monorepo signals. Then confirm which layout they want.

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to each confirmed active-agent instruction file (see step 4 for selection rules)
- The contents of `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and `docs/agents/triage-labels.md`, including category and workflow-state mappings (the last only when `triage` is installed)

Let them edit before writing.

For a real tracker, include a tracker-mutation preview: every required triage and Wayfinder label, whether it already exists, and the proposed name, description, and color for each missing label. The user's approval of this preview is the authority to create only those missing labels. Preserve matching existing labels; do not silently rename or recolor them.

### 4. Write

**Pick the file or files to edit:**

- If only one of `CLAUDE.md` or `AGENTS.md` exists, edit that file.
- If both exist, identify which agent surface is active in the current harness, recommend updating its instruction file, and ask the user whether setup should update that file only or both existing files. Never silently prefer `CLAUDE.md` over `AGENTS.md`.
- If neither exists, ask the user which one to create; don't pick for them.

Do not create a missing counterpart when one instruction file already exists. When both exist and the user approves both, merge the same setup-owned subsections into each while preserving their distinct custom content.

If an `## Agent skills` block already exists in a chosen file, update only the setup-owned `### Issue tracker`, `### Triage labels`, and `### Domain docs` subsections in place. Preserve every unknown or custom subsection, including orchestration, routing, verification, or repository-specific additions, and never replace the whole block from the fixed template. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout: "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Include the `### Triage labels` sub-block, and write `docs/agents/triage-labels.md`, whenever Section B ran for any state-consuming or state-producing skill. When it did not run, both are omitted.

Then write the docs files using the seed templates in this skill folder as a starting point. For a missing file, create it from the selected seed. For an existing `docs/agents/*.md`, merge only the setup-owned tracker choice, triage mapping, or domain-layout sections approved in step 3. Preserve unknown headings, backend-neutral boundaries, execution contracts, run records, required context sources, and other custom content. When the tracker changes, replace the old backend-specific commands, endpoints, relationship operations, and query fields with the selected seed's backend; do not preserve commands that still target the previous tracker. Never replace an existing document wholesale from a seed template.

When multi-context is selected and `CONTEXT-MAP.md` does not exist, create a root skeleton immediately so the chosen layout is durable before first domain-modeling use. Include `# Context Map`, empty `## Contexts` and `## Relationships` sections with comments describing the expected links, and do not invent context names. Single-context setup still creates no glossary eagerly.

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [triage-labels.md](./triage-labels.md): label mapping (only if `triage` is installed)
- [domain.md](./domain.md): domain doc consumer rules + layout

For "other" issue trackers, write `docs/agents/issue-tracker.md` from the confirmed complete operation and capability contract. Do not declare setup complete from a generic tracker description.

**Provision and verify tracker capability and labels before declaring setup complete.** Re-read that the selected real tracker has issues enabled. On GitHub or GitLab, create the approved missing triage labels plus `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, and `wayfinder:task`, then fetch the label inventory again and verify every configured label exists. If issues are disabled or unknown, the user did not authorize the preview, the tracker is read-only, or any required label remains absent, report setup as incomplete and do not claim downstream ticket publication is ready.

### 5. Done

Tell the user setup is complete only after the configured files and required tracker labels are verified, and say which engineering skills will now read from them. Mention they can edit `docs/agents/*.md` directly later; re-running this skill is only necessary if they want to switch issue trackers or restart from scratch.
