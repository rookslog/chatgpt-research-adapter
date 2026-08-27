# M006 — Production Usability

- Status: baseline publication in PR #6; M006 feature implementation not started
- Date: 2026-08-25
- Closure target: a readable, dependable research adapter with the explicitly supported research modes and remaining rigor variants exercised
- Remote: private `rookslog/chatgpt-research-adapter`; recovered baseline in `m006/baseline-recovery`
- Commit and push authority: granted 2026-08-26 for baseline publication and the bounded ChatGPT/GitHub-connector implementation experiment

## Owner decision

`[OWNER DECISION — 2026-08-25]` Track the remaining bounded work in a private GitHub milestone using one parent issue and executable sub-issues. Set up the repository and milestone first, then test whether a standard ChatGPT session can create a properly parented issue through its connected GitHub surface. Use direct authenticated GitHub administration as the fallback.

## Milestone hierarchy

- [M006 milestone](https://github.com/rookslog/chatgpt-research-adapter/milestone/1)
- [Parent #1 — Close production-usability gaps](https://github.com/rookslog/chatgpt-research-adapter/issues/1)
  - [#2 — Restore Web Search selector compatibility](https://github.com/rookslog/chatgpt-research-adapter/issues/2)
  - [#3 — Restore Deep Research selector compatibility](https://github.com/rookslog/chatgpt-research-adapter/issues/3)
  - [#4 — Preserve GFM tables and claim IDs](https://github.com/rookslog/chatgpt-research-adapter/issues/4)
  - [#5 — Live-test expanded citations and audit appendix](https://github.com/rookslog/chatgpt-research-adapter/issues/5)

All five issues are open and assigned to `M006 — Production usability`; #2–#5 are direct sub-issues of #1.

## Connector capability observation

`[ROOT LIVE OBSERVATION — 2026-08-25]` Standard-mode job `job_f9710a3eb59f4f4a8a7f080e6231ba94`, conversation `6a8e28f2-1d4c-83ea-a95a-a28960b87be9`, was instructed to create exactly one Markdown child issue or make no write. The returned answer accurately named private parent #1 and milestone #1 and reported that its 89-operation GitHub surface exposed issue creation with milestone assignment but no parent/sub-issue operation. It therefore reported no write. A direct GitHub issue listing immediately afterward showed only parent #1, corroborating the no-write outcome. The connector-operation count and schema are provider-reported rather than captured directly.

Because correct hierarchy was part of the acceptance contract, root created #2–#5 with authenticated `gh --parent 1 --milestone ...` rather than asking ChatGPT to create partial standalone issues and repairing them afterward.

## Execution order

1. #4 Markdown/GFM preservation — smallest user-visible QoL fix for the working standard mode.
2. #2 Web Search selector compatibility — restore the lighter current-information path.
3. #3 Deep Research selector compatibility — restore the explicit long-form path.
4. #5 Expanded-citation and audit-appendix live conformance — exercise the remaining rigor variants after output formatting is stable.

Issue acceptance criteria are authoritative for their slices. The owner subsequently authorized publication of the recovered baseline and local/offline implementation commits and PRs for the ChatGPT/GitHub-connector experiment. Dependency changes, live provider turns, merge, publication, and deployment retain their applicable separate gates.
