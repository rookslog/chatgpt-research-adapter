# M006 Post-Merge Review Repair

- Date: 2026-08-28
- Base `main`: `8abfa2ad447a1d475c305a4ddbe530f81d1319a7`
- Repair branch: `codex/m006-post-merge-review-repair`
- Scope: post-merge Codex Connector findings from PRs #18–#20
- Provider submissions: zero

## Why this repair exists

PRs #18–#20 were merged before their asynchronous Codex Connector reviews
finished. Ten unresolved comments arrived after merge. Issues #15 and #17 were
reopened because the credible findings invalidated parts of their deterministic
completion evidence; #16 remained open and received the reader-compatibility
finding.

## Reconciled findings

| Review finding | Deterministic disposition | Repair |
| --- | --- | --- |
| Pin expected-conversation-ID caller sites | Reproduced | Fail closed unless the pinned OpenCLI v1.8.7 network call, requested/current ID derivation, payload fetch call, and payload extraction call each occur exactly once. |
| Recover after a failed collector release | Reproduced | Mark the failed same-process invocation abandoned; keep any unreleased generation nonterminal; require a later invocation to publish a successor owner/release before exposing completion or emitting an event. |
| Keep concurrent `wait` blocked | Reproduced | Carry one absolute Deep deadline through owner following, takeover, preflight, and result reading; nonwaiting `collect` may return the running receipt. |
| Avoid generation 1024 exhaustion | Reproduced | Accept contiguous safe-integer generations and validate the observed sorted journal instead of imposing a lifecycle-ending constant. |
| Align terminal-result bounds | Reproduced | Read and persist terminal results through the 256 KiB transport range. |
| Hide a result before durable publication | Reproduced | Require `result.committed.json`, gate readers on the publisher journal, and recover validated completed or ambiguous orphan results without another provider read. |
| Canonicalize lexical output-root aliases | Not reproduced | `node:path.join()` normalized the reported `..` alias before persistence and comparison; a regression test records this already-protected case. |
| Propagate non-`ENOENT` event lookup errors | Reproduced | Treat only `ENOENT` as absence and fail closed for other lookup failures. |
| Do not emit an event before publisher release | Reproduced | Release the collector before completion-event publication; concurrent nonwaiting collectors return the running receipt. |
| Validate an existing event before staging | Reproduced | Validate and return the immutable event before creating any staging bytes. |

The lexical-alias disposition is limited to the exact mechanism reported. It
does not claim that every possible filesystem alias is supported.

Independent exact-diff review caught a hole in the first release-recovery
correction: a durable result could become visible after an in-memory owner was
marked abandoned but before the immutable journal recorded a successor. The
final RED scenario requires read-only status to remain `running`, forbids the
completion event, and then proves a no-provider-read successor generation
closes the journal before completion becomes visible.

The same review also found that a takeover reset the wait budget, that the
payload fetch call itself was not pinned, and that an orphan ambiguous result
had no commit-recovery path. The final correction carries one deadline through
the whole wait operation, pins all four identity-bearing caller expressions,
and recovers both completed and ambiguous orphan receipts without provider
access. Shared direct transport validation preserves the OpenCLI 1–7200
safe-integer timeout contract before any preflight, so deadline accounting does
not coerce invalid inputs.

## Verification contract

The repair is acceptable only when the focused RED scenarios pass, the complete
deterministic suite passes, authority digests are refreshed for the reviewed
source bytes, syntax and requirement checks pass, the package dry run succeeds,
and the exact pushed head receives completed review before merge. One successful
deterministic run is not a live Deep reliability estimate.
