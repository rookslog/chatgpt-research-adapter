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

The asynchronous review of PR #21 at `83242bee5a8d9185335f13d33c4d9277b80288c7`
then identified seven additional P2 instances. Each was confirmed against that
exact source and received a discriminating regression:

| PR #21 finding | Correction in the follow-up cycle |
| --- | --- |
| Process-local release abandonment | Publish an immutable, owner-hash-bound `N.abandoned.json` record before relying on the in-process fallback; a separate Node process proves takeover and no-provider-read completion repair. |
| Child termination grace outside the wait deadline | Divide each remaining absolute wait budget between child execution and bounded termination grace. |
| Permission-based event error test | Inject the exact event `lstat` failure deterministically, so root and non-root runners exercise the same branch. |
| No wrapper metadata headroom | Keep the OpenCLI transport envelope at 256 KiB and allow 64 KiB of wrapper-owned terminal-result metadata above it. |
| Caller pins satisfiable outside executable code | Extract the exact OpenCLI v1.8.7 `getChatGPTDeepResearchResult` implementation and require its complete raw SHA-256, so comments, helpers, and unreachable in-caller copies cannot satisfy the authority check. |
| Non-durable commit-marker rollback | Treat the published result-plus-marker pair as the commit point. A later staging cleanup failure cannot trigger rollback; a post-link marker-directory sync failure is surfaced as uncertain durability while preserving the pair in the live namespace. |
| Unbounded journal rescan | Publish an atomically replaced, owner-hash-bound `collector-head.json` on successful owner acquisition. Current jobs validate the checkpoint and only its terminal/successor tail; pre-checkpoint journals receive one full compatibility scan before the next owner creates the checkpoint. |

The checkpoint is an index, not a replacement for the immutable owner,
release, and abandonment records. Only owner acquisition advances it; release
and successor acquisition therefore cannot race to regress the checkpoint.
If a successor owner was linked after its predecessor was already provably dead
but the successor publisher crashed before replacing the checkpoint, readers
validate and advance across that one-generation tail rather than retrying the
occupied generation forever. The validated contiguous successor is the durable
takeover decision; readers do not re-evaluate its historical predecessor PID,
which may since have been reused by the operating system. Liveness is checked
only for the latest owner before another successor is created.
If a release failure also prevents the abandonment receipt from being written,
the process-local fallback remains fail-closed and another process must wait for
the owner PID to become provably dead. No storage protocol can durably advertise
abandonment when the storage itself cannot accept the record.

The exact-head review at `a2efe9b88a84ffe4d6a78c120dd44d764dba1b58`
identified two further P2 boundary cases. Shared direct transport validation now
rejects a supplied termination grace unless it is a nonnegative safe integer,
preventing negative values from algebraically expanding the absolute deadline.
Checkpoint-tail validation also treats a valid contiguous successor record as
the immutable takeover authority instead of rechecking its predecessor PID.
Deterministic REDs cover both invalid grace before preflight and simulated PID
reuse after successor publication.

The exact-head review at `3b9fbddd0f7bb5e02eb9ea55442966674d491ee8`
identified five more durability and timing cases, all reproduced:

| PR #21 exact-head finding | Correction |
| --- | --- |
| Compatibility setup uses a stale child budget | Thread the absolute deadline into the Deep transport, recompute timeout and termination grace immediately before child spawn, prohibit an expired spawn, and reject results that finish cleanup after the deadline. |
| Checkpoint publication races the legacy scan | If `collector-head.json` appears after the initial miss, require a regular file and restart through exact checkpoint validation. |
| Existing event accepted before directory durability repair | Validate its exact bytes, then sync `events/` before treating the event as finalized. |
| Existing result marker accepted before directory durability repair | Validate the hash-bound marker, then sync `response/` before exposing terminal state. |
| Recovered release accepted before directory durability repair | Validate the release, then sync `collector-locks/` before treating the owner as terminal, including the matching-`EEXIST` path. |

Node's recursive `cp`, `chmod`, and `rm` promises are not cancelable. The
deadline contract therefore prevents a child from starting or running beyond
its freshly recomputed budget and rejects a late post-cleanup result, while
still awaiting mandatory private-workspace cleanup. Strict wall-clock promise
settlement would require a larger killable helper-process architecture and is
not claimed by this repair.

The final independent working-tree sweep found the same stale-budget mechanism
in the preceding OpenCLI identity preflight. The absolute deadline now reaches
that preflight too: timing is recomputed after executable identity work and
immediately before `--version` spawn, and a preflight or second identity check
that completes after the deadline is rejected. Deterministic REDs cover both
the expired-before-spawn and late-completion cases.

A later push CI run exposed one scheduler-dependent sibling after PR #21
merged: when a wait deadline expired while another collector still appeared
live, the follower returned the durable `running` receipt without a typed
timeout disposition. A deterministic live-owner RED now fixes that scheduling
choice, and every expired wait return behind an active or concurrently acquired
collector adds `collection_disposition: ERR_OPENCLI_TIMEOUT` without stealing
ownership or starting a reader. The related release/reacquire race is also
covered: if a successor collector wins while the follower still has time, the
follower continues tracking that owner under its original absolute deadline
instead of returning `running` early.

`[PROCESS FINDING — 2026-08-28]` PR #21's first-parent implementation/test diff
contained 1,373 changed lines (1,264 additions and 109 deletions), exceeding the
design's hard fewer-than-1,200-line review limit. It should have been split
before review. The PR was already merged when this was identified; this record
does not recast the automated checks as satisfying that separate policy.

## Verification contract

The repair is acceptable only when the focused RED scenarios pass, the complete
deterministic suite passes, authority digests are refreshed for the reviewed
source bytes, syntax and requirement checks pass, the package dry run succeeds,
and the exact pushed head receives completed review before merge. One successful
deterministic run is not a live Deep reliability estimate.
