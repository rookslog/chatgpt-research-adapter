# M006 ChatGPT/GitHub-Connector Handoff

## Objective

Use ChatGPT's connected GitHub surface to implement the M006 issues against the
actual recovered adapter, beginning with issue #4. This is an experiment in
whether the ChatGPT session can inspect and modify the repository through its
GitHub connection; it is not a request to redesign or recreate the adapter.

## Repository state

- Repository: `rookslog/chatgpt-research-adapter`
- Baseline branch/PR: `m006/baseline-recovery`, PR #6
- Milestone: `M006 — Production usability`
- Parent: #1
- Executable issues: #2–#5
- First implementation target: #4, GFM tables and readable claim IDs

The implementation was recovered from the original uncommitted local working
tree. Treat `docs/recovery/M006-BASELINE-MANIFEST.md` as the exact component
map and `docs/recovery/M006-BASELINE-RECOVERY.md` as the provenance receipt.
Do not bootstrap a replacement from issue prose.

## Required opening checks

1. Read `README.md`, `docs/PROJECT-BOUNDARY.md`, `docs/M004-PLAN.md`,
   `docs/M005-PLAN.md`, `docs/M006-PLAN.md`, the M006 design, and both recovery
   documents.
2. Inspect the actual source and tests named in the manifest.
3. Run `npm test` and `npm run check:authority` before changing behavior.
4. Confirm whether the connected GitHub surface can create a branch and commit
   file changes. If it cannot, report the exact exposed operations and return a
   complete patch instead of claiming implementation.

## First slice: issue #4

Preserve the existing full-message extraction boundary. Start with a failing
deterministic fixture covering a GFM table, visible claim IDs, list, link, and
fenced code. Make the smallest conversion-seam change that preserves those
structures without dropping or duplicating content. Do not modify Web Search
or Deep Research selection in this slice.

Before opening a PR, run the focused tests, `npm test`,
`npm run check:authority`, JavaScript syntax checks, and `git diff --check`.
Record exact results and link the PR to #4 and milestone M006.

## Authority boundary

Local/offline implementation commits and a review PR for #4 are authorized.
Do not run a live ChatGPT/provider smoke, manipulate a signed-in browser, merge,
publish, deploy, or close milestone issues without a separate owner decision.
