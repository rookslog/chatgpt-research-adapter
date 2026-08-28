# M006 — Production Usability

- Status: lifecycle/event review repair merged and #15/#17 closed; live Deep extraction qualification remains open in #16
- Date: 2026-08-28
- Closure target: a readable, dependable research adapter with the explicitly supported research modes and remaining rigor variants exercised
- Remote: public `rookslog/chatgpt-research-adapter`; recovered baseline in `m006/baseline-recovery`
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
  - [#15 — Deep Research resumable lifecycle](https://github.com/rookslog/chatgpt-research-adapter/issues/15)
  - [#16 — Deep Research completed report/source extraction](https://github.com/rookslog/chatgpt-research-adapter/issues/16)
  - [#17 — Deep Research completion event](https://github.com/rookslog/chatgpt-research-adapter/issues/17)

Issues #2–#5 and #15–#17 are tracked beneath #1 in `M006 — Production usability`. The deterministic implementation at `07d7a0dcb2c49998d353a308c5b28adcd80c06f0` establishes #15's split lifecycle and #17's local completion-event contract; it does not establish #16 or live Deep usability.

`[REVIEW CORRECTION — 2026-08-28]` PRs #18–#20 were merged before their asynchronous Codex Connector reviews completed. Ten post-merge comments were reconciled in [M006-POST-MERGE-REVIEW-REPAIR.md](M006-POST-MERGE-REVIEW-REPAIR.md). Nine mechanisms reproduced; the reported lexical `..` output-root alias did not because `node:path.join()` normalizes that form. The complete repair merged through PR #21 as main `465f255fb91d6ca1b0756b5903a42dc0fa8afc29` after an exact-head connector review, and #15/#17 were closed again. No new provider submission was part of the repair.

## Connector capability observation

`[ROOT LIVE OBSERVATION — 2026-08-25]` Standard-mode job `job_f9710a3eb59f4f4a8a7f080e6231ba94`, conversation `6a8e28f2-1d4c-83ea-a95a-a28960b87be9`, was instructed to create exactly one Markdown child issue or make no write. The returned answer accurately named private parent #1 and milestone #1 and reported that its 89-operation GitHub surface exposed issue creation with milestone assignment but no parent/sub-issue operation. It therefore reported no write. A direct GitHub issue listing immediately afterward showed only parent #1, corroborating the no-write outcome. The connector-operation count and schema are provider-reported rather than captured directly.

Because correct hierarchy was part of the acceptance contract, root created #2–#5 with authenticated `gh --parent 1 --milestone ...` rather than asking ChatGPT to create partial standalone issues and repairing them afterward.

## Execution order

1. #4 Markdown/GFM preservation — smallest user-visible QoL fix for the working standard mode.
2. #2 Web Search selector compatibility — restore the lighter current-information path.
3. #15/#17 Deep lifecycle and completion event — implemented deterministically without a new provider submission.
4. #16 Deep completed report/source extraction — remains blocked on the separately approval-gated Bridge diagnostic.
5. #3 Deep Research selector compatibility retains its live qualification criterion. #5 is closed after its bounded qualification, including preserved negative citation-coverage findings.

The post-merge review repair merged through PR #21. Its first asynchronous exact-head
review produced seven additional lifecycle/authority P2 findings; the follow-up
cycle adds durable cross-process abandonment, deadline-inclusive termination
grace, deterministic event-error injection, result-envelope headroom,
caller-scoped OpenCLI pins, durable commit rollback, and a bounded journal
checkpoint. The next exact-head review found two more bounded cases: invalid
negative termination grace and stale-predecessor PID reuse after a durable
successor. A subsequent exact-head review added five confirmed cases covering
compatibility-copy deadline refresh, checkpoint/legacy-scan publication races,
and directory durability repair for existing event, commit-marker, and release
records. A final independent working-tree sweep extended the same absolute
deadline through OpenCLI preflight identity work, including a fresh pre-spawn
budget and rejection of late preflight completion. The exact head passed 232
deterministic tests, the repository gates, independent review, connector review,
and CI with every actionable thread resolved before merge. This correction
cycle performed no provider submission. A later duplicate push CI run exposed
one scheduler-dependent sibling: an expired follower behind a still-live
collector omitted its timeout disposition. The deterministic correction keeps
the durable `running` state and adds `ERR_OPENCLI_TIMEOUT` without takeover or
provider access. A sibling interleaving also keeps a nonexpired follower
blocked when a successor collector wins the release/reacquire race, under the
same original deadline.

Issue acceptance criteria are authoritative for their slices. The owner subsequently authorized publication of the recovered baseline and local/offline implementation commits and PRs for the ChatGPT/GitHub-connector experiment. Dependency changes, live provider turns, merge, publication, and deployment retain their applicable separate gates. Adaptive multi-wave orchestration is deferred to the next milestone; no new provider submission is part of this implementation phase.
