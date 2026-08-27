# M006 — Production Usability

- Status: #4/#5 live qualification executed and both issues closed completed after acceptance review; #2/#3 selector investigation active with no production selector change yet
- Date: 2026-08-26
- Closure target: a readable, dependable research adapter with the explicitly supported research modes and remaining rigor variants exercised
- Integrated implementation baseline: `adf8d6c4c682a5c23fc54965920d2f862878f51e`
- Remote visibility: temporarily public during the current GitHub qualification/review work; intended to return to private when that need ends
- Commit/push authority: granted for the bounded M006 implementation and qualification work; live provider operations remain evidence-bearing and must preserve the existing no-retry/receipt discipline

## Owner decision

`[OWNER DECISION — 2026-08-25]` Track the remaining bounded work in the M006 milestone using one parent issue and executable sub-issues. Issue acceptance criteria are authoritative; deterministic completion does not substitute for a required live observation.

`[OWNER APPROVAL — 2026-08-26]` Use a minimal two-turn standard-mode bundle to finish #4's remaining live regression while exercising #5: one expanded-citation turn that also checks GFM/claim-ID/full-message fidelity and exactly-one submission, then one independent audit-appendix turn. Preserve formatting/conformance and citation correctness as separate findings.

## Milestone hierarchy

- [M006 milestone](https://github.com/rookslog/chatgpt-research-adapter/milestone/1)
- [Parent #1 — Close production-usability gaps](https://github.com/rookslog/chatgpt-research-adapter/issues/1)
  - [#2 — Restore Web Search selector compatibility](https://github.com/rookslog/chatgpt-research-adapter/issues/2) — open
  - [#3 — Restore Deep Research selector compatibility](https://github.com/rookslog/chatgpt-research-adapter/issues/3) — open
  - [#4 — Preserve GFM tables and claim IDs](https://github.com/rookslog/chatgpt-research-adapter/issues/4) — closed completed
  - [#5 — Live-test expanded citations and audit appendix](https://github.com/rookslog/chatgpt-research-adapter/issues/5) — closed completed

All five issues remain milestone-scoped; #2–#5 are direct sub-issues of #1. Child closure is based on the issue body's actual acceptance criteria, with negative qualification findings preserved rather than rewritten as success.

## Current integrated state

### Baseline and hardening

PR #6 is merged. The recovered pre-existing adapter is now the repository baseline rather than an unavailable local-only source tree. The provenance, component mapping, exact OpenCLI pin, requirements, and recovery evidence remain under `docs/recovery/`.

### Markdown fidelity

PR #7 is merged on top of the recovered baseline. The deterministic implementation preserves GFM tables and readable prose claim IDs through a temporary Markdown-compatible copy of the pinned OpenCLI detail reader while preserving full-message extraction and leaving the installed OpenCLI package unchanged.

The exact integrated `main` commit after #6/#7 is `adf8d6c4c682a5c23fc54965920d2f862878f51e`. Its push CI completed successfully with 125/125 tests, `M002_AUTHORITY_OK`, `REQUIREMENTS_OK`, syntax verification, and package dry-run.

Issue #4 is closed completed. Turn A of the bounded live qualification preserved the valid GFM table, readable claim IDs, requested code-block literal, material content through the terminal rendered marker, and exactly-one-submission evidence. The raw saved sentinel escaped underscores, which is rendered-equivalent Turndown serialization rather than truncation; the requested `text` fence info string was absent, but the code block and exact literal were present and language-info-string preservation was not a #4 acceptance criterion.

### Rigor qualification

Issue #5 is closed completed as a qualification/observation task. Both bounded standard-mode variants completed once without transport ambiguity or retry, with full job/turn/conversation/profile/output receipts. Claim IDs, citation coverage, audit fields, contrary evidence/limits, revision triggers, formatting conformance, and citation correctness were checked and recorded separately, with no reliability estimate inferred.

The live observations include negative conformance findings: Turn B omitted principal citations for repository workflow/run claims, and both raw saved terminal sentinels escaped underscores. Those findings remain material evidence; closure of #5 means the requested empirical qualification was performed and characterized, not that every sampled model output conformed.

The approved operator bundle is [M006-LIVE-QUALIFICATION.md](M006-LIVE-QUALIFICATION.md). The contemporaneous result is [M006-LIVE-QUALIFICATION-RECEIPT.md](M006-LIVE-QUALIFICATION-RECEIPT.md), and the subsequent issue-acceptance review is [M006-LIVE-QUALIFICATION-DISPOSITION.md](M006-LIVE-QUALIFICATION-DISPOSITION.md).

### Selector compatibility

Issues #2 and #3 remain open. Released OpenCLI remains pinned at v1.8.7 for this adapter, and current upstream `main` has no newer `clis/chatgpt/*` change relative to that release.

A sanitized no-submission current-UI capture is recorded in [M006-SELECTOR-DIAGNOSTIC.md](M006-SELECTOR-DIAGNOSTIC.md). Both options were manually discoverable/selectable in the Codex in-app browser as same-level `div[tabindex=0]` options under a `role=group` surface, with inline `span[contenteditable=false]` selected chips. Those structures are already covered by the pinned selector logic, so the current capture does not reproduce the historical failures and does not justify a speculative selector patch.

The exact external Chrome/Browser Bridge path that produced the historical errors remains the root-cause boundary. In particular, investigate whether unrelated visible preferred menu/popover roots suppress the selector's document fallback, whether Web Search's broad `Search` alias false-matches outside the real tool surface, and whether raw coordinate `nativeClick` targeting differs from manual/current-UI clicks. These are falsifiable hypotheses, not established fixes.

Web Search and Deep Research must remain explicit, mutually exclusive, and fail closed if selection cannot be proven before submission.

## Execution order

1. Preserve PR #9's completed #4/#5 live receipt and post-run disposition; do not resubmit those completed jobs.
2. Continue #2/#3 systematic debugging from the exact external Chrome/Browser Bridge selector boundary. Do not fabricate a failing fixture from a current UI capture that does not reproduce the bug.
3. If the historical failures reproduce, capture the minimum sanitized root/candidate/click/postcondition evidence, write causal red tests, and make the smallest selector compatibility change.
4. If the exact pinned selector no longer fails on current external Chrome, record the issue premise as currently unreproducible and decide disposition from fresh capability evidence rather than forcing a code change.
5. Refresh parent/status documentation as M006 evidence changes and keep issue/PR cross-links auditable.
6. Return the repository to private visibility after the temporary public-review/qualification need ends.

## Residual risks and follow-up

- **OpenCLI executable identity TOCTOU:** the wrapper preflights and pins executable identity, but a remaining time-of-check/time-of-use limitation exists around execution. Keep this as an explicit residual risk; do not describe it as fixed without a new verified design and implementation.
- **Native Windows CI:** deterministic Windows path/profile handling is covered by tests, but the current GitHub Actions workflow runs on Ubuntu. Native Windows CI remains a useful follow-up and must not be inferred from Linux CI success.
- **Repository visibility:** current public visibility is operationally temporary, not a product decision to publish the project permanently.
- **Live evidence scope:** one successful turn is an observation in that configuration, not a reliability estimate.
- **Rigor conformance:** one audit turn omitted principal citations for repository/run claims. Treat that as sampled model-output evidence, not a semantic-verification feature or a reliability estimate.

## Connector capability observation

`[ROOT LIVE OBSERVATION — 2026-08-25]` Standard-mode job `job_f9710a3eb59f4f4a8a7f080e6231ba94`, conversation `6a8e28f2-1d4c-83ea-a95a-a28960b87be9`, was instructed to create exactly one Markdown child issue or make no write. The returned answer accurately named parent #1 and milestone #1 and reported that its GitHub surface exposed issue creation with milestone assignment but no parent/sub-issue operation. It therefore reported no write. A direct GitHub issue listing immediately afterward showed only parent #1, corroborating the no-write outcome. The connector-operation count and schema are provider-reported rather than captured directly.

Because correct hierarchy was part of the acceptance contract, root created #2–#5 with authenticated GitHub administration rather than asking ChatGPT to create partial standalone issues and repairing them afterward.

## Verification policy

For implementation changes, begin with a failing deterministic test representing the observed/acceptance failure, make the minimum change, then run the focused and full repository verification. For qualification-only changes, do not manufacture tests merely to create activity: bind claims to existing deterministic CI plus explicit live receipts.

Before opening an implementation PR:

1. run focused tests;
2. run the full suite;
3. run authority, requirements, syntax/type/lint/build checks supplied by the project;
4. inspect the diff;
5. calculate implementation + test changed lines and enforce the M006 PR-size limits;
6. record the commands/results in the PR.

For a docs/qualification PR, the full repository CI on the exact branch head is the verification gate before review.

## Completion criteria

M006 is complete only when:

- the recovered real adapter baseline remains reproducible;
- Web Search is dispositioned from current evidence: either #2 satisfies deterministic/live compatibility criteria after a causal fix, or the historical failure is shown to be currently unreproducible and #2 is closed with that evidence rather than a fabricated patch;
- Deep Research is dispositioned on the same evidence standard for #3;
- #4 remains closed with its live GFM/readable-claim-ID/full-message/no-duplicate evidence preserved;
- #5 remains closed with both required live observations and their positive/negative qualification findings preserved;
- citation correctness and formatting conformance remain reported separately;
- applicable deterministic tests and repository verification checks pass;
- milestone issues/PRs are cross-linked with evidence sufficient for later audit;
- residual risks are stated rather than silently promoted to resolved.
