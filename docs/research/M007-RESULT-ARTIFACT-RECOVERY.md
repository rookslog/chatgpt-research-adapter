# M007 result artifacts and multi-file recovery

- Issue: [#27](https://github.com/rookslog/chatgpt-research-adapter/issues/27)
- Evidence cutoff: 2026-08-30
- Adapter baseline: `cd7a31b9f8859c3265fcd9acb19f38a6f8925107`
- Installed dependency: `@jackwener/opencli@1.8.7`
- OpenCLI release source: `87b60a36590c3e2a466c37266c3348d73d7f68fe`
- OpenCLI executable SHA-256:
  `246004200e381e5aecdfaef13e904953c0d18e0600ca66d02b956c4b1820ec02`
- Status: source-backed recommendation; no provider turn, browser operation, or
  download was performed

## Question and answer

The adapter currently recovers two durable text products:

1. Standard/Web assistant-message Markdown in `response/answer.md`;
2. a completed Deep report in `response/report.md` plus structured source rows
   in `response/result.json`—but only when the Deep reader can obtain a valid
   completed payload.

The first path has historical live evidence. The second has deterministic
coverage but remains live-blocked by [#16](https://github.com/rookslog/chatgpt-research-adapter/issues/16):
the retained native Deep conversation completed while the exact reader failed
to recover its report and sources.

OpenCLI v1.8.7 also contains two relevant upstream capabilities that the wrapper
does not expose:

- `chatgpt image` can save one or more generated images locally;
- Browser Bridge `Page.waitForDownload()` can wait for a browser download and
  report its ID, filename, URL, final URL, MIME type, total bytes, state,
  danger classification, error, and elapsed time.

There is no ChatGPT command that enumerates or downloads arbitrary
assistant-generated files. The complete installed ChatGPT registry contains
`ask`, `deep-research-result`, `detail`, `image`, and the other documented
conversation/project commands, but no general artifact command. Therefore:

- message Markdown is not proof that linked file bytes were recovered;
- a Markdown link is an artifact reference, not a durable artifact;
- generic browser-download support is a usable primitive, not a ChatGPT
  artifact contract;
- multiple generated files remain unqualified.

The smallest maintainable route is still wrapper plus a narrow,
source-identity-checked ChatGPT compatibility seam. That seam should enumerate
artifacts inside the exact assistant turn, activate and reconcile one download
at a time, and materialize verified bytes under the job output root. Current
evidence does not justify a maintained OpenCLI fork.

This is a recommendation for approval issues #29/#30, not an approved runtime
contract.

## Evidence classes

### Confirmed current adapter behavior

- The public `ask` CLI accepts only `standard | web | deep`. `image` remains in
  the preparation-layer mode list but is rejected by the executable ask parser.
- Standard/Web collection validates exactly one OpenCLI row containing
  `conversationId`, `conversationUrl`, `response`, and `tool`; it persists the
  response bytes as `answer.md`.
- Standard/Web `sources` remains an empty array even when `answer.md` contains
  source links. There is no separately validated Standard/Web source set.
- Completed Deep collection requires a nonblank `report` and an array of
  `sources`, writes `report.md`, records the source rows in `result.json`, and
  publishes a completion event with `source_count`.
- The direct text/report artifact limit is 256 KiB. The transport output limit
  is also 256 KiB; the terminal result receipt has 64 KiB of additional
  envelope headroom.
- No request, transport, receipt, result, or completion-event schema enumerates
  provider-generated files or binds their bytes.

### Confirmed exact OpenCLI v1.8.7 behavior

#### Assistant-message Markdown

`chatgpt detail --markdown` and `chatgpt read --markdown` pass assistant HTML
through `messageHtmlToMarkdown()`, which uses the shared Turndown converter.
Normal anchors can therefore survive as Markdown links. The adapter's M006
compatibility patch additionally preserves GFM tables and readable claim IDs.

This path reads rendered message HTML. It does not identify a provider file ID,
prove a link is downloadable, resolve multiple files with the same visible
name, or persist the linked bytes.

#### Deep report and sources

`deep-research-result` attempts to extract a report from Deep widget state and
derives source rows from content references, safe URLs, and search-result
groups. The adapter pins that reader and validates the expected conversation
identity before accepting its output.

The retained live Deep job
`job_b2273e984efb46c780869d7e0473b6bc` has a valid accepted handoff to
conversation `6a911bab-2eb4-83e9-81df-022439363d58`, but its terminal local
receipt is `recovery_required` with `report_path=null`, `report_bytes=null`,
and `sources=[]`. The browser-visible report is not equivalent to recovered
bytes.

#### Generated images

`chatgpt image` discovers visible generated image URLs, obtains each image as a
data URL through same-page fetch or canvas fallback, and writes one local file
per returned asset. Multiple assets receive numbered local names. Its result
rows contain local file and conversation-link fields.

This is upstream source capability only. The wrapper does not expose the
command, does not bind image bytes into its receipt chain, and has no live image
qualification. Image extraction also is not evidence for arbitrary documents,
archives, code files, or spreadsheets.

#### Browser downloads

The exact `Page` class implements:

```text
waitForDownload(pattern = "", timeoutMs = 30000)
  -> BrowserDownloadWaitResult
```

It sends the Bridge command `wait-download`. The returned type may include:

```text
downloaded
id
filename
url
finalUrl
mime
totalBytes
state
danger
error
elapsedMs
```

The generic CLI exposes this as `opencli browser <session> wait download
[pattern]`. Another installed adapter, Midjourney, demonstrates the intended
sequence: click one exact download control, wait for its browser download,
require `state=complete` and a filename, then inspect the local file.

The primitive does **not** choose a wrapper output directory, enumerate the
correct ChatGPT assistant-turn controls, establish provider artifact identity,
or make a returned browser path trustworthy. Those are the missing ChatGPT and
wrapper layers.

## Capability and evidence boundary

| Product | Current representation | Current status | What remains |
|---|---|---|---|
| Standard/Web answer | `answer.md` plus result receipt | supported; historical live evidence | structured source set is absent |
| Link inside answer | Markdown anchor in `answer.md` | reference only | classify target and recover/bind bytes |
| Deep report | `report.md` | deterministic contract only | #16 live extraction blocker |
| Deep sources | rows in `result.json` | deterministic contract only | #16 live extraction blocker and exact source completeness |
| Generated image(s) | upstream local files | OpenCLI source capability | wrapper mode, receipts, output-root discipline, live qualification |
| General generated file(s) | none | unsupported/unqualified | assistant-scoped enumeration, download, validation, receipts |
| Wrapper-created export | bytes written from validated text/result | supported for answer/report | keep distinct from provider-generated attachments |

An answer containing a code block is not a generated code file. A wrapper that
chooses to write that code block to disk has created a local derivative. It must
not label that derivative as the provider's original file.

Likewise, one provider-generated ZIP is one recovered artifact even if it
contains many logical files. The first contract should preserve and hash the ZIP
without extracting it. Archive inspection/extraction needs a separate path,
size, nesting, and collision policy.

## Proposed artifact contract

Make result-file handling opt-in and independent of prompt mode:

```json
{
  "result_artifacts": {
    "policy": "none | enumerate | download",
    "max_count": 4,
    "max_file_bytes": 10485760,
    "max_total_bytes": 20971520
  }
}
```

The numerical limits above are illustrative schema examples, not approved
defaults. #30 must choose initial limits after the bounded probe establishes the
current provider surface.

Omission must preserve the current byte-identical text-only path. `enumerate`
may observe artifact identities but may not activate a download. `download`
permits only exact assistant-turn controls and writes only beneath the job's
artifact directory.

Each enumerated artifact needs a stable wrapper identity before activation:

```text
ordinal
assistant_turn_identity
provider_artifact_identity_or_null
visible_basename
visible_media_type_or_null
discovery_strategy
```

Visible basename alone is insufficient because duplicate filenames are
possible. If the current UI exposes neither a provider identity nor a stable
turn-scoped structural identity, deterministic multi-file recovery is not yet
qualified.

## One-at-a-time multi-file transaction

```text
load immutable conversation handoff
  -> open exact conversation in an isolated reader
  -> resolve the exact completed assistant turn
  -> enumerate visible/current artifact controls in stable order
  -> publish enumeration receipt
  -> for each artifact, serially:
       refresh exact turn and artifact target
       atomically confirm it is still the intended undownloaded target
       activate exactly once
       wait for one matching download result
       reconcile browser result with the intended artifact
       open the downloaded file without following a symlink
       validate regular file, size, type, and byte identity
       copy through exclusive staging beneath response/artifacts/
       hash and durably publish one artifact receipt
  -> publish immutable aggregate artifact manifest
  -> bind the manifest hash into the terminal result/event
```

Trigger-all-then-wait is rejected. It creates a race between download events,
duplicate names, partial completion, and the artifact-to-file mapping. One
activation followed by one bounded wait makes each association falsifiable.

The browser-reported `filename` is evidence to inspect, not an authorized final
path. The wrapper must not persist outside its output root, trust the extension,
execute a downloaded file, or delete the browser's source download by default.
It should open and hash the source descriptor, write a separate exclusive local
copy, and publish only after syncing the file and artifact directory.

Raw signed URLs, authorization headers, cookies, browser storage, and unrelated
download history are not durable receipt fields. If URL correlation is needed,
retain a sanitized origin/path class or hash rather than a query-bearing URL.

## Dispositions and ambiguity

Each artifact has a local effect state independent of provider submission:

```text
enumeration_status:
  not_requested | completed | incomplete | ambiguous

download_status:
  not_requested | completed | rejected | interrupted | unknown

provider_submission:
  false | accepted | unknown
```

Post-hoc result collection performs `provider_submission=false`. An unknown
download does not authorize another prompt and does not require a new
conversation. Before another click, reconcile the Bridge download record and
the reported local path. Do not blindly click again merely because the wrapper
timed out.

Partial multi-file success remains durable: completed artifact receipts are
immutable, the aggregate result stays nonterminal or `attention_required`, and
resume targets only artifacts proven not to have been activated. A file with an
unknown activation/download state is not automatically retried.

## Durable artifact receipt

Publish one immutable receipt per successfully materialized file and one
aggregate manifest. A file receipt should contain:

```text
schema
job_id
turn_id
conversation_id
assistant_turn_identity
artifact_ordinal
provider_artifact_identity_or_null
visible_basename
browser_download_id
download_state
danger_state
media_type
byte_count
sha256
output_path
finished_at
```

The aggregate manifest records requested/enumerated/completed counts, stable
order, per-artifact receipt hashes, total bytes, and overall disposition. The
terminal result and completion event bind the aggregate manifest SHA-256.

The manifest must distinguish:

- message-only completion;
- report-only completion;
- artifact enumeration without download;
- all requested artifacts downloaded;
- partial or ambiguous artifact recovery.

## Implementation ownership options

### A. Treat Markdown links as recovered files

Rejected. Links are useful output content but do not prove durable bytes,
provider identity, completeness, or later accessibility.

### B. Wrapper-only generic browser commands

Useful for a bounded probe, but rejected as the product path. Separate ad-hoc
browser commands cannot atomically bind the assistant turn, clicked target,
download event, and wrapper receipt.

### C. Exact-source ChatGPT compatibility patch — recommended near term

Add a typed read-only artifact enumerator and download operation near the
ChatGPT detail/reader seam. Reuse `Page.waitForDownload()` rather than adding a
second download subsystem. Return structured artifact rows to the wrapper; let
the wrapper own limits, byte validation, output-root materialization, receipts,
ambiguity, and resume.

This can remain a temporary exact-version copy, just like the existing
Markdown/tool/Deep compatibility patches. The generic enumeration/download seam
is also a plausible upstream contribution once the live shape is known.

### D. Maintained fork or different controller

Not selected. The current Bridge already provides the missing download
lifecycle primitive, so the known gap remains within the ChatGPT adapter seam.

Apply the architecture re-evaluation gate from #29 if current ChatGPT artifacts
cannot be enumerated with stable assistant-turn identities, if correct recovery
requires a Bridge/daemon change rather than `waitForDownload()`, if raw
authentication-bearing fetches become the only viable byte path, or if the
combined model/file/artifact patches exceed the agreed narrow patch budget.
Crossing a gate pauses capability expansion and compares all three ownership
routes; it does not automatically choose a fork.

## Smallest discriminating probe sequence

Every stage requires separate owner authorization.

1. **Zero-download observation:** inspect only an owner-designated existing
   conversation known to contain generated files. Capture the minimum sanitized
   assistant-turn artifact structure and stable identities. No click, download,
   or provider submission.
2. **One bounded generation turn:** if no suitable existing conversation
   exists, submit one prompt requesting two tiny, uniquely named text files.
   Record one conversation handoff and exactly-one-submission evidence. Do not
   infer support merely from the model saying it created files.
3. **Post-hoc two-file recovery:** from that same conversation and with zero new
   provider submissions, activate and wait for each file serially. Preserve the
   first result for each; do not auto-click again after an uncertain event.
4. **Optional ZIP distinction:** only if needed, request or use one benign ZIP
   and prove it is retained as one artifact without automatic extraction.
5. **Image qualification:** keep separate because OpenCLI uses a distinct
   image-specific extraction path rather than browser download events.

No user document, connector, project knowledge, unrelated conversation, or
executable downloaded content is required.

## Smallest justified RED set

1. omitted artifact options preserve the exact current text-only request,
   transport arguments, and receipts;
2. enumeration is scoped to the expected completed assistant turn and excludes
   user uploads, hidden/stale turns, source links, and unrelated download UI;
3. duplicate visible filenames remain distinguishable or fail closed;
4. multiple artifacts use activate-one -> wait-one ordering and bind one Bridge
   download ID to one wrapper artifact identity;
5. timeout, interrupted, danger, missing filename, non-complete state, and
   mismatched download produce typed non-completion without a second click;
6. browser-reported paths are opened without symlink following, validated, and
   copied only beneath the job artifact root;
7. count, per-file, aggregate-byte, and media-type limits fail before durable
   publication;
8. collision-safe exclusive publication preserves byte identity and never
   overwrites an existing artifact;
9. partial completion is resumable without provider resubmission or re-clicking
   an unknown artifact;
10. aggregate manifest hash is required by terminal result and completion event;
11. one ZIP remains one opaque file and is never implicitly extracted;
12. exact pinned-source drift fails before browser activation or download.

These are distinct mechanisms. A Cartesian matrix of extensions, sizes, and
file counts is not justified before the live probe establishes the actual
surface.

## Present recommendation

- **Text products:** keep the current `answer.md` / `report.md` distinction.
- **Structured sources:** keep Deep-only until #16 is resolved; do not infer a
  Standard/Web source set from Markdown links.
- **Generated images:** treat the OpenCLI path as reusable evidence, not current
  wrapper support.
- **General files:** add a typed assistant-turn enumerator plus serial
  `waitForDownload()` recovery in a narrow exact-source ChatGPT seam.
- **Artifact bytes and receipts:** wrapper-owned under the job output root.
- **Upstream destination:** propose the generic ChatGPT artifact seam upstream
  after deterministic implementation and live shape qualification.
- **Architecture:** continue wrapper plus narrow patches; invoke #29 for an
  explicit three-way re-evaluation if a gate is crossed, never an automatic
  fork switch.
- **Next gate:** #29/#30 approval, then deterministic implementation and a
  separately authorized generated-fixture probe.
