# M007 ordinary-conversation file attachments

- Issue: [#26](https://github.com/rookslog/chatgpt-research-adapter/issues/26)
- Evidence cutoff: 2026-08-30
- Adapter baseline: `38e02068b7fd02613e557f3aabf63eeb90606926`
- Installed dependency: `@jackwener/opencli@1.8.7`
- Status: research recommendation; no file was opened, attached, or uploaded

## Question and answer

The current signed-in ChatGPT UI visibly offers ordinary-conversation file
input, and OpenCLI's Browser Bridge already has a local-path file-input
primitive. However, neither the wrapper nor OpenCLI's `chatgpt ask` command
exposes general conversation attachments.

The smallest maintainable route is a wrapper-owned conversation-file contract
implemented through a narrow, exact-source-checked patch to the ChatGPT `ask`
transaction. It should use Browser Bridge `Page.setFileInput()` against the
**composer-scoped** file input, verify one attachment representation for every
requested file, then send the prompt in the same page transaction.

Do not substitute either existing OpenCLI file path:

- `project-file-add` changes project knowledge, not the current conversation;
- `chatgpt image --image` is image-only and uses media-preview heuristics rather
  than a general file-attachment contract.

No OpenCLI fork is justified by current evidence. The required primitives and
most validation patterns already exist in exact v1.8.7; the missing seam is
ChatGPT-adapter-specific.

This is a recommendation for M007 approval issues #29/#30, not an approved
implementation contract.

## Evidence

### Confirmed current wrapper facts

- `ask` and prepared request schemas accept no file list, attachment purpose, or
  project target.
- job/turn/dispatch/result receipts contain no input-file identities or
  attachment-state hash.
- `runAsk()` sends only a prompt plus mode/tool options to a new conversation.
- no wrapper code invokes a file input, reads an attachment chip, or separates
  upload effect from prompt-submission effect.

### Confirmed exact OpenCLI v1.8.7 facts

The complete ChatGPT command registry has no general conversation-file command
or `ask --file` option.

The Browser Bridge `Page` interface nevertheless exposes:

```text
setFileInput(files, selector)
```

It sends local paths through the Bridge's `set-file-input` command, backed by
CDP `DOM.setFileInputFiles`. Chrome reads the local files directly; the normal
path does not serialize their bytes into an evaluated script.

OpenCLI contains two narrower ChatGPT consumers:

| Existing path | Scope | Useful evidence | Why it is not the general contract |
|---|---|---|---|
| `uploadChatGPTImages()` | current conversation, images only | validates image paths, sets multiple files, waits for preview | extension allowlist, 25 MiB limit, MIME mapping, and media-preview fallback are image-specific |
| `uploadChatGPTProjectFiles()` | project knowledge | validates general paths, scopes project selectors, sets multiple files, waits for project-source confirmation | intentionally navigates to project Sources and excludes the composer input |

The project helper's source explicitly warns that an arbitrary page file input
may be the composer attachment input and would upload to the conversation
instead of project knowledge. That distinction corroborates the two separate
provider effects.

The image helper first tries `setFileInput(paths, 'input[type="file"]')`. Its
fallback reads the complete files, embeds base64 in evaluated JavaScript,
constructs browser `File` objects, and dispatches React/change events. That
fallback is not suitable as the default general-file path: it expands memory,
crosses the evaluate payload boundary, and uses a broad selector.

The generic project path validator follows paths with `statSync` and permits up
to 512 MiB because it is modelling project limits. Those are not safe or
evidenced defaults for the wrapper's ordinary-conversation contract.

### Current zero-submit UI observation

The merged [capability inventory](M007-CAPABILITY-INVENTORY.md) records one
current blank-composer observation. The plus menu showed:

- `Add photos & files — Upload from computer`;
- `Add from library — Browse and search your files`.

No picker was opened and no file was attached. This establishes current UI
discoverability, not accepted file types, count/size limits, upload completion,
or OpenCLI selector compatibility.

## Capability distinctions

| Capability | Destination/effect | M007 owner |
|---|---|---|
| conversation file | one new or continuing conversation; available to that turn/conversation | issue #26 |
| image input | one image generation/edit turn plus image-output handling | separate image capability |
| project knowledge | persistent project Sources/knowledge state | separate project capability |
| provider-generated result file | assistant output that must be enumerated/downloaded | issue #27 |
| local wrapper materialization | wrapper writes Markdown/JSON/report from returned bytes | existing result pipeline / issue #27 |

The request must state `purpose=conversation`; no selector may infer project
knowledge from the current URL, and no fallback may target an unscoped file
input.

## Proposed request contract

Use an ordered list of wrapper-inspected local files:

```json
{
  "input_files": [
    {
      "path": "/absolute/path/report.pdf",
      "purpose": "conversation"
    }
  ]
}
```

The caller supplies only the absolute path and fixed purpose. Before creating a
prepared job, the wrapper derives and freezes:

```text
ordinal
basename
byte_count
sha256
media_type
```

Required preparation rules:

- path is absolute and identifies a regular non-symlink file;
- open with no-follow behavior where supported and hash the opened descriptor,
  not a later pathname read;
- reject duplicates by opened-file identity and content hash;
- enforce an explicit allowed-type, per-file-size, total-size, and file-count
  capability profile before browser mutation;
- do not copy file contents into the prepared job unless a later retention
  decision explicitly chooses snapshot semantics;
- re-open and verify the same file identity/hash immediately before upload;
- omission preserves the current file-free request and exact transport path.

The evidence cutoff does not justify numerical general-file limits. #30 should
choose conservative initial values after the bounded probe reports the current
accepted surface; project knowledge's 512 MiB and image input's 25 MiB are not
transferable facts.

## Required upload/send transaction

```text
validate and hash every input file
  -> acquire conversation tab/send lease
  -> open blank target conversation
  -> resolve the active composer
  -> resolve exactly its conversation file input
  -> revalidate every local file
  -> set all ordered file paths once
  -> poll for exact attachment state for every requested file
  -> atomically recheck attachment set + blank/expected composer
  -> publish attachment receipt
  -> publish dispatch intent bound to attachment receipt
  -> submit prompt once
  -> persist conversation handoff/result
```

The file input must be scoped from the active composer/container and exclude
project Sources/dialog inputs. The implementation must not click a macOS file
picker or type paths into an OS dialog.

The postcondition must identify each requested attachment independently. A
generic media preview count or one filename anywhere in `document.body` is not
enough. At minimum it needs a composer-scoped chip/preview with exact basename
and a stable ready/not-uploading state; if the UI omits names for a qualified
type, a separate exact structural identity must be established by the probe.

## Effect and ambiguity model

Attachment upload is a provider-side mutation even when no prompt is sent. It
therefore needs its own effect dimension:

```text
upload_effect:
  known_none | attached_verified | partial_verified | unknown

provider_submission:
  false | accepted | unknown
```

Examples:

- local validation or missing composer input: `known_none`, prompt known unsent;
- all chips appear exactly: `attached_verified`, prompt still unsent;
- one of two files appears: `partial_verified`, prompt unsent, no automatic
  re-upload;
- Bridge timeout after `setFileInput`: `unknown`, prompt unsent, inspect the
  native composer before any retry;
- send timeout after verified attachments: preserve the existing
  `ambiguous_effect`/no-retry provider rule.

The wrapper may remove verified attachment chips only if an independently
tested cleanup contract proves that exact requested chips were removed. It must
not claim rollback merely because the managed tab was closed.

## Receipt contract

Publish an immutable `attachments.json` before dispatch intent, containing:

```text
schema
job_id
turn_id
input_files[]:
  ordinal
  basename
  byte_count
  sha256
  media_type
  purpose
selector_strategy
requested_count
verified_count
upload_effect
provider_submission
verified_at
finished_at
```

The prepared bundle binds the ordered input-file identity set. Dispatch intent,
handoff, result, and Deep completion event bind the attachment-receipt SHA-256.
No raw file bytes, file content excerpt, browser storage, upload URL, token,
account identifier, or unrelated DOM is retained.

The result must distinguish “prompt completed using verified attachments” from
“prompt completed with no attachment contract.” A response that merely mentions
the filename is not proof the provider ingested the file.

## Implementation routes

### A. Reuse `project-file-add`

Rejected. It changes persistent project knowledge and has different navigation,
selectors, limits, confirmation, and cleanup semantics.

### B. Call `uploadChatGPTImages()` for every file

Rejected. It validates only image extensions, treats preview media as the
postcondition, uses a broad input selector, and may embed base64 bytes in page
evaluation.

### C. Exact-source compatibility patch to `chatgpt ask` — recommended

Add typed file paths to the private ChatGPT `ask` transaction and reuse
`Page.setFileInput()` with a new composer-scoped general-file helper. Return a
sanitized attachment-state row with the conversation handoff. The wrapper owns
path hardening, receipts, ambiguity, and capability limits.

The patch stays in a temporary exact-version copy and fails before file/browser
mutation if pinned source drifts. An upstream contribution can later move the
generic ChatGPT attachment helper into OpenCLI.

### D. New wrapper-owned browser controller or OpenCLI fork

Not justified. A second controller would duplicate login/navigation/send logic;
a fork is unnecessary while the Bridge primitive and ChatGPT adapter seam are
patchable in isolation. If this work can no longer stay isolated to the
ChatGPT-adapter seam, apply the architecture re-evaluation gate from #25/#29.
Crossing it pauses expansion and compares wrapper+patches, a maintained fork,
and another controller; it does not automatically choose the fork.

## Smallest discriminating probe sequence

Each stage requires separate owner authorization because even an unsent file
attachment may upload bytes to the provider.

1. **One-file attach/remove, no prompt:** a generated non-sensitive small text
   fixture with a unique filename; record exact input selector and ready chip,
   then test exact removal. One upload attempt total.
2. **Two-file atomic set, no prompt:** two generated non-sensitive fixtures;
   verify distinct ordered chips and observe whether `setFileInput()` accepts
   both in one action. One upload attempt total.
3. **One attachment provider turn:** only after deterministic implementation;
   ask for a short fact uniquely present in the fixture and retain one
   conversation/attachment/result receipt. One prompt submission total.
4. **One supported binary type:** only if the product contract needs it; do not
   extrapolate text-file qualification to PDF/Office files.

No real user document, project source, connector, or unrelated conversation is
needed for qualification.

## Smallest justified RED set

1. regular non-symlink descriptor validation and hash binding before mutation;
2. default request produces the exact current file-free bundle and argv;
3. composer input scoping excludes project/dialog and hidden stale inputs;
4. multiple files are set once and require one exact ready state per identity;
5. partial/unknown upload never calls send and never auto-retries;
6. attachment receipt hashes are required by intent, handoff, result, and Deep
   event validation;
7. changed file identity between prepare and upload fails known-unsent;
8. unsupported Bridge file-input capability fails without the base64-evaluate
   fallback;
9. pinned-source drift fails before any file or browser mutation.

These tests address distinct mechanisms. File-type/count Cartesian expansion is
not justified before the capability probes establish current limits.

## Present recommendation

- **Contract and receipt owner:** wrapper.
- **Upload primitive:** Browser Bridge `Page.setFileInput()`.
- **Immediate integration seam:** exact-source-checked ChatGPT `ask`
  compatibility patch.
- **Project/image helpers:** evidence and reusable patterns only, not substitutes.
- **Architecture:** continue wrapper plus a narrow patch; defer a fork and
  re-evaluate all three routes if the patch premise is falsified.
- **Next gate:** #29/#30 approval, then deterministic implementation followed by
  separately authorized generated-fixture probes.
