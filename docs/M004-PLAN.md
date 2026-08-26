# M004 — Minimal Local Production Path

- Status: standard mode complete and live-verified; web/deep blocked by upstream selectors
- Date: 2026-08-24
- Closure target: a locally usable `chatgpt-research ask` command
- Commit authority: not granted

## Owner direction

Build the minimum code needed to send prompts through the owner's signed-in
ChatGPT session and collect responses or research reports. Do not add a new
security, redaction, queue, retry, attachment, hosting, or deployment system.

## Command contract

```text
chatgpt-research ask <prompt> \
  --mode standard|web|deep \
  --output-root <directory> \
  --opencli <absolute-path>
```

`standard` is the default. `web` maps to OpenCLI `--web-search`; `deep` maps to
`--deep-research` and, when necessary, the read-only
`chatgpt deep-research-result` command. Each invocation starts one new ChatGPT
conversation, writes the returned response or report under the output root,
and prints a machine-readable summary.

## Minimal implementation

1. Generalize the existing OpenCLI transport to accept the three modes and a
   practical caller-selected timeout.
2. Add one direct orchestration function that prepares a request, performs one
   prompt submission, and returns the saved job/result location.
3. Add the `ask` CLI syntax without removing `prepare` or `submit-once`.
4. Keep only focused deterministic tests for argv mapping, output parsing,
   persistence, and one-dispatch behavior.
5. Establish the local OpenCLI/Browser Bridge runtime and run live standard,
   then web/deep only after the preceding mode succeeds.

## Deliberate deferrals

Attachments, images, generated non-text files, conversation continuation,
queueing, retry/recovery, multi-user service operation, remote deployment, and
new security infrastructure are outside M004.

## Success

M004 is usable when the actual wrapper command completes a live standard-mode
prompt and saves the returned answer. Web and deep are additional verified
capabilities, not blockers for the first usable standard path.

## Execution receipt

`[OWNER DECISION — 2026-08-24]` The owner approved M004 execution, selected a
persistent installation in normal Chrome, accepted the extension's disclosed
permissions, and authorized live testing. This supersedes the earlier M003-only
temporary-browser gate for subsequent local operation. It does not authorize a
remote service, publication, deployment, or commit.

`[ROOT VERIFICATION — 2026-08-24]` Exact OpenCLI v1.8.7 was installed beneath
`.runtime/opencli` with lifecycle scripts disabled. The official Browser Bridge
1.0.23 release asset was verified at SHA-256
`e3399db1e9dd626519a8719d638d3c3813494d1f030c1e96799e05ebe7ba5340`
and installed persistently in Chrome. `opencli doctor --verbose` reported the
v1.8.7 daemon, v1.0.23 extension, connected profile, and successful immediate
connectivity; `chatgpt status` reported connected and logged in.

The first M004 standard call exposed an upstream waiting defect: submission
succeeded and ChatGPT completed the conversation, but `chatgpt ask` did not
detect the response before the wrapper deadline. Read-only recovery of that
specific conversation returned `CHATGPT_RESEARCH_PRODUCTION_OK`. The minimal
wrapper correction now submits with `--wait false`, obtains the new conversation
reference, and reads that exact conversation with `chatgpt detail --wait true`.

The corrected live standard call completed in about 27 seconds:

- job: `job_8196b12a795b4f1b8dc2aa4d0bd372e3`
- conversation: `6a8c9a0a-19a4-83ea-9efa-4eb4eb591ad1`
- saved answer: exact bytes `CHATGPT_RESEARCH_PRODUCTION_OK`
- result: schema `m004.direct-result.v1`, status `completed`, mode `standard`

Live mode checks then failed before prompt submission with actionable upstream
errors:

- `web`: `ChatGPT tool did not switch to Web Search.`
- `deep`: `Could not find the ChatGPT Deep Research tool option.`

These errors establish current selector incompatibility with the ChatGPT UI.
They do not invalidate the completed standard path. M004 deliberately stops at
that upstream boundary instead of growing a second browser controller.

## Full-message extraction correction

`[OBSERVATION — 2026-08-24]` An Extra High standard response rendered a complete
11-row capability table in the visible ChatGPT conversation, while repeated
`chatgpt detail` reads through the persistent site session returned only the
table header. Direct DOM inspection established that the visible `.markdown`
node contained all rows. The same OpenCLI detail command through an ephemeral
site session returned every row, establishing a stale persistent reader
container as the practical cause rather than a selector or wrapper parser bug.

`[OWNER DECISION — 2026-08-24]` Apply the fix inline. Standard/web response
collection now keeps persistent submission but reloads the returned conversation
through an ephemeral reader and requests Markdown. No provider resubmission,
new dependency, OpenCLI fork, or retry heuristic was added.

`[ROOT VERIFICATION — 2026-08-24]` The modified wrapper reader reread the exact
existing conversation without sending a prompt and returned 1,210 UTF-8 bytes,
including the GitHub row, Projects row, and final Projects reason, with one
assistant row stable for three seconds. OpenCLI already includes
`turndown-plugin-gfm@1.0.2`; preserving tables as GFM instead of linearized
Markdown is a separate two-line upstream converter change and is not carried as
an unpinned installed-package edit in this repository.

A fresh end-to-end standard turn then requested a two-row table followed by a
terminal sentinel. Job `job_9cfc08b4d2964047a6aea91455d9ea1d` completed and
saved all table cell values (`alpha`, `one`, `beta`, `two`) plus the final
sentinel. The current upstream converter emitted the table as linearized
Markdown and escaped the sentinel underscores, confirming full content recovery
while retaining the separately documented GFM-formatting limitation.

## M005 follow-on

`[OWNER DECISION — 2026-08-25]` Every prompt should receive epistemic-quality instructions by default, with substantive-claim coverage and optional expanded citations or an audit appendix. The adapter now compiles a wrapper-owned versioned rigor profile before the unchanged M004 mode appendix and records its exact identity in durable artifacts. Built-in `light`, `standard`, and `strict` profiles plus a versioned custom JSON profile are local prompt controls; they do not change OpenCLI transport or repair the blocked web/deep selectors. The owner-provided AHR-C document was a design example and is not adopted or packaged unchanged.
