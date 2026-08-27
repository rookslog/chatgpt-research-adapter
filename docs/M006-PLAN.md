# M006 — Production Usability

- Status: baseline/hardening and Markdown fidelity merged; bounded #4/#5 live qualification is next; selector issues #2/#3 remain open
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
  - [#2 — Restore Web Search selector compatibility](https://github.com/rookslog/chatgpt-research-adapter/issues/2)
  - [#3 — Restore Deep Research selector compatibility](https://github.com/rookslog/chatgpt-research-adapter/issues/3)
  - [#4 — Preserve GFM tables and claim IDs](https://github.com/rookslog/chatgpt-research-adapter/issues/4)
  - [#5 — Live-test expanded citations and audit appendix](https://github.com/rookslog/chatgpt-research-adapter/issues/5)

All five issues remain milestone-scoped; #2–#5 are direct sub-issues of #1. Do not close a child issue until its actual acceptance criteria are satisfied.

## Current integrated state

### Baseline and hardening

PR #6 is merged. The recovered pre-existing adapter is now the repository baseline rather than an unavailable local-only source tree. The provenance, component mapping, exact OpenCLI pin, requirements, and recovery evidence remain under `docs/recovery/`.

### Markdown fidelity

PR #7 is merged on top of the recovered baseline. The deterministic implementation preserves GFM tables and readable prose claim IDs through a temporary Markdown-compatible copy of the pinned OpenCLI detail reader while preserving full-message extraction and leaving the installed OpenCLI package unchanged.

The exact integrated `main` commit after #6/#7 is `adf8d6c4c682a5c23fc54965920d2f862878f51e`. Its push CI completed successfully with 125/125 tests, `M002_AUTHORITY_OK`, `REQUIREMENTS_OK`, syntax verification, and package dry-run.

Issue #4 nevertheless remains open because its final acceptance criterion is live: a bounded standard-mode regression must still confirm no content loss and no duplicate submission.

### Rigor qualification

Issue #5 remains open. Expanded-citation and audit-appendix prompt compilation are deterministic and receipted, but their required bounded live observations and citation-correctness checks have not yet been recorded.

The approved operator bundle is [M006-LIVE-QUALIFICATION.md](M006-LIVE-QUALIFICATION.md). It deliberately uses two standard-mode provider turns only and prohibits automatic retries.

### Selector compatibility

Issues #2 and #3 remain open. Released OpenCLI remains pinned at v1.8.7 for this adapter. Do not assume a dependency upgrade repairs the selectors: qualification must begin from the wrapper's actual failure and current UI contract. Web Search and Deep Research must remain explicit, mutually exclusive, and fail closed if selection cannot be proven before submission.

## Execution order

1. Run the bounded two-turn standard-mode qualification bundle for #4/#5 when the local signed-in Chrome/OpenCLI runtime is available.
2. Record job, turn, conversation, profile, output, formatting, citation-correctness, and exactly-one-submission evidence. Close #4 and/or #5 only if their complete acceptance criteria are satisfied.
3. Investigate #2 and #3 from current source/UI evidence. Reproduce each selector failure with a current-UI deterministic fixture before any implementation change; prefer the minimum compatible upstream-derived change over a broad local browser fork.
4. Refresh parent/status documentation as M006 evidence changes and keep issue/PR cross-links auditable.
5. Return the repository to private visibility after the temporary public-review/qualification need ends.

## Residual risks and follow-up

- **OpenCLI executable identity TOCTOU:** the wrapper preflights and pins executable identity, but a remaining time-of-check/time-of-use limitation exists around execution. Keep this as an explicit residual risk; do not describe it as fixed without a new verified design and implementation.
- **Native Windows CI:** deterministic Windows path/profile handling is covered by tests, but the current GitHub Actions workflow runs on Ubuntu. Native Windows CI remains a useful follow-up and must not be inferred from Linux CI success.
- **Repository visibility:** current public visibility is operationally temporary, not a product decision to publish the project permanently.
- **Live evidence scope:** one successful turn is an observation in that configuration, not a reliability estimate.

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
- Web Search satisfies #2 deterministically and in its bounded live smoke;
- Deep Research satisfies #3 deterministically and in its bounded live smoke;
- #4's live standard-mode regression corroborates the merged Markdown/full-message behavior without duplicate submission;
- #5 has both required standard-mode live observations with receipt evidence;
- citation correctness and formatting conformance are reported separately;
- applicable deterministic tests and repository verification checks pass;
- milestone issues/PRs are cross-linked with evidence sufficient for later audit;
- residual risks are stated rather than silently promoted to resolved.
