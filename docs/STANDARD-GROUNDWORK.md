# Standard intent and preparation groundwork

Status: development groundwork, not a live-qualified Standard driver. Tracks [Standard submission #60](https://github.com/rookslog/chatgpt-research-adapter/issues/60); recovery #61 and packaging #62 remain separate delivery requirements.

## User-visible behavior

Standard preparation now requires explicit `model_family` and `effort`, including when Standard is the default mode. Current input vocabulary is exactly `gpt-5.6-pro` with `standard` or `extended`. These are intent values, not an attestation of current ChatGPT availability, provider routing or quota. GPT-6/Astra intent and live selection remain unqualified. No defaults are inferred from a generic Pro label.

```json
{"question":"Explain tidal locking.","mode":"standard","template_id":"research-question","template_version":"1.0.0","model_family":"gpt-5.6-pro","effort":"standard"}
```

Save the request to a file, choose an existing absolute output directory and run offline preparation:

```text
node bin/chatgpt-research.js prepare --request /absolute/request.json --output-root /absolute/existing-directory
```

Preparation creates a new job under `jobs/<job_id>/` with compiled prompt and canonical receipts. `standard.prepared.v2` binds the same intent in both events and current job state. The prompt itself does not supply or alter model selection. The exact historical v1 decoder remains available without inventing missing intent.

| Entry point | Current outcome before provider effects |
| --- | --- |
| Standard ask without required intent | `ERR_STANDARD_INTENT_REQUIRED` |
| Unsupported family/effort | `ERR_STANDARD_INTENT_UNSUPPORTED` |
| Standard ask with recognized intent | `ERR_STANDARD_DRIVER_UNQUALIFIED` |
| Evidence-free prepared v2 submission | `ERR_STANDARD_DRIVER_UNQUALIFIED` |
| Evidence-free historical v1 Standard submission | `ERR_STANDARD_LEGACY_INTENT_REQUIRED` |
| Prepared Standard with any dispatch/response/standard sibling evidence | `ERR_STANDARD_PRIOR_DISPATCH`; preserve evidence |
| Raw Standard transport | `ERR_STANDARD_DRIVER_UNQUALIFIED` |

Malformed CLI syntax retains usage errors. Prepared-bundle and input validation retain their existing precedence. Raw Standard transport refuses before validating the transport executable identity. Prior evidence includes incomplete entries and symlinks: presence must not be relabelled known-unsent, deleted, or used to authorize retry. Prepared submitters inspect evidence before executable preflight. Direct Standard asks refuse before creating output or invoking OpenCLI. Web/Deep retain their existing inputs and paths; Standard intent flags do not select their models.

## Why this is a separate change

The old Standard route could submit without the newly required explicit-intent and controlled-driver contract. This slice closes those routes while retaining useful offline preparation and historical evidence. It intentionally reduces Standard submission availability until the replacement is qualified; it is not advertised as a usable live release.

The original tested preparation/refusal work is extracted as a coherent final state. Intermediate preparation states that permitted omitted intent are not shipped. Diagnostic observation and the questioned output-root reservation mechanism are excluded. A storage path is not adopted here as browser identity or a universal lock. Existing Web/Deep semantics are preserved, without claiming their live qualification or account-wide coordination.

## Test and source provenance

Independent test authors and separate implementation authors developed the existing behavioral tests before this extraction. This branch carries their final tests and code, not new tests manufactured to fail for packaging. Original replaced test bodies remain inspectable in Git at base `b36a21629c3afc1d7b864ed306cb603b65415e0a`; local research archives remain retained by the maintainer.

Some former Standard-success tests now exercise the surviving shared transport/storage behavior through Web or low-level legacy helpers. Those tests no longer establish a working Standard send path. Dedicated cutover and raw-transport tests check refusals, zero invocation, historical evidence preservation and exact Web/Deep mode admission. No regression claim extends to an excluded diagnostic or reservation implementation.

Relevant tests: `standard-intent-cli`, `standard-intent-flags-cli`, `standard-prepared`, `standard-cutover`, `raw-standard-transport`, plus the migrated shared lifecycle regressions. Source hashes and capability restrictions remain enforced by the authority checker; requirement bindings are traceability, not runtime qualification.

Run `npm test`, `npm run check:authority`, `npm run check:requirements`, `npm run check:syntax` and `npm pack --dry-run --json --ignore-scripts`. These local fixture checks need no browser, login or OpenCLI installation. Documentation links describe the repository checkout; the unchanged development package file list excludes docs and does not provide a standalone installed-documentation experience. Check the PR for exact results on its branch revision; this document does not assert a current pass merely by listing commands.

## Remaining implementation and qualification

A real Standard driver still needs source-qualified command loading, observed model/effort matching, participating browser-resource control, durable input/acceptance evidence and a conversation-bound result. Unknown effects must prohibit resubmission. Collection must recover only the accepted conversation/turn without submission authority. Prepared Standard public status remains unimplemented; a successful prepare does not establish a working status/collect path.

Live qualification requires an explicitly bounded test with useful evidence and a named provider budget. No live provider request, automatic retry, browser change, controller fork, dependency addition, queue, storage-default choice or release is part of this groundwork.
