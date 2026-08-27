# M003 — One-Shot OpenCLI Transport and Live-Smoke Design

- Status: executed once; terminal `ambiguous_effect` without retry 2026-08-24
- Date: 2026-08-24
- Closure target: one end-to-end standard-mode smoke through the wrapper
- Commit authority: not granted

## Owner authority and policy interpretation

`[OWNER DECISION — 2026-08-24]` The owner directed the project to test live and stated that the individual-Terms restriction on automatic/programmatic Output extraction is intended to prevent mass distillation and that this bounded use is acceptable.

`[OBSERVATION — OpenAI Terms of Use effective 2026-01-01]` The published Terms list automatic/programmatic Output extraction and use of Output to develop competing models as separate prohibited examples. The project therefore records the owner's statement as explicit acceptance of the unresolved contract/account risk for one bounded smoke, not as a verified legal-compliance finding.

## Selected approach

`[OWNER DECISION — 2026-08-24]` Use a wrapper-first one-shot smoke. Do not substitute a direct OpenCLI or direct-browser smoke, because either would leave the wrapper transport untested.

M003 adds exactly one operation:

```text
chatgpt-research submit-once \
  --output-root <existing-directory> \
  --job-id <prepared-job-id> \
  --opencli <absolute-executable-path>
```

The operation consumes one validated M002 prepared bundle, records dispatch intent durably, invokes one pinned OpenCLI process without a shell, captures one answer, and records one terminal local outcome. It does not add retry, continuation, queueing, attachments, Web Search, Deep Research, image generation, history browsing, arbitrary OpenCLI commands, or generic browser control.

## Architecture

### Prepared-bundle validator

`src/prepared-bundle.js` reopens `events.jsonl`, `current.json`, and `prompt.txt` from `<outputRoot>/jobs/<job_id>/` through bounded no-follow paths. It requires the exact M002 two-event schema, `state: prepared`, `transport_status: not_dispatched`, matching job/turn/template/mode fields, and a prompt SHA-256 equal to both the receipt and exact prompt bytes. Any inconsistency fails before dispatch intent.

### OpenCLI transport

`src/opencli-transport.js` accepts only an absolute executable path whose real file identity and reported version were preflighted as `1.8.7`. It invokes an exact argv vector through `spawn` with `shell: false`; request JSON cannot influence the executable, command names, flags, timeout, environment keys, or working directory.

The production mapping is one standard-mode call equivalent to:

```text
opencli chatgpt ask <exact-compiled-prompt> \
  --new true \
  --site-session ephemeral \
  --timeout 120 \
  --format json
```

Pinned v1.8.7 source verification established that `--new` is an optional-value boolean option and explicit `--format json` renders the returned array as JSON. The wrapper therefore passes the literal pair `--new`, `true` and accepts exactly one result object containing `conversationId`, `conversationUrl`, `tool`, and `response`. A fake executable drives deterministic tests. No prompt is passed through a shell or temporary command file.

The child receives only the environment required for the pinned CLI and dedicated local profile connection. Arbitrary inherited secret-bearing variables are excluded. Standard output and error are byte-bounded. The wrapper sends one `SIGTERM` on local timeout and never retries.

### One-shot receipt extension

M002's three prepared-bundle files remain immutable. M003 creates a sibling `dispatch/` directory and publishes exclusive canonical artifacts:

1. `intent.json` — written and synced before process spawn; binds schema, job/turn/prompt hashes, exact OpenCLI version/path identity, argv contract hash, and start time.
2. `result.json` — written exclusively after a definitive local result; records `completed`, `attention_required`, or `ambiguous_effect`, timestamps, process disposition, conversation reference when validated, answer hash when present, and no retry decision.
3. `answer.md` — written only for a validated completed result; exact UTF-8 bytes must match `answer_sha256`.

An existing `intent.json` makes a second `submit-once` invocation fail closed. There is no automatic attach, inspect, resubmit, or overwrite behavior in M003.

### Outcome rules

- `completed`: the pinned adapter returns one nonblank assistant answer, a valid `https://chatgpt.com/c/<id>` reference, successful process exit, and no gating signal. The answer bytes and hash are persisted before the result declares completion.
- `attention_required`: a definitive pre-send condition is reported before provider mutation, such as missing Browser Bridge or unauthenticated status established by a separate preflight.
- `ambiguous_effect`: the write process starts but times out, loses transport, exits without a trustworthy result, returns malformed/oversize output, or exposes uncertainty about whether the prompt was submitted. No retry is permitted.
- Validation, pin, executable, or prepared-bundle failures before durable intent are local typed errors and create no dispatch artifacts.

Challenge, quota, policy, rate-limit, unexpected navigation, or consent signals stop the smoke. They are never bypassed or retried.

## Authority change

The exact-source SHA-256 manifest remains the primary drift oracle. M003 adds `node:child_process` only to `src/opencli-transport.js`; no other production file may spawn. The authority checker pins the new production files and rejects shell execution, non-absolute executables, mutable command/flag selection, additional child-process imports, network modules, dynamic loading/evaluation, and unlisted files.

This is an allowlisted subprocess boundary, not a sandbox around OpenCLI. Upstream retains its disclosed broader authority; the wrapper exposes only `submit-once`.

## Offline TDD gate

Before any installation or account operation, deterministic tests must prove:

- exact prepared-bundle acceptance and corruption/symlink rejection;
- executable path/version/identity rejection before intent;
- intent durability before the fake process observes the prompt;
- exact argv and byte-identical prompt transport;
- bounded stdout/stderr and stable output parsing;
- completed answer/reference/hash persistence ordering;
- timeout, malformed output, nonzero exit, and post-spawn loss become `ambiguous_effect` with no retry;
- duplicate invocation never spawns and never changes prior bytes;
- the authority mutation suite catches any unpinned source or process-boundary drift;
- the complete M002+M003 suite passes repeatedly without network or OpenCLI installation.

## Installation and live-smoke protocol

After the offline gate passes:

1. Inspect the published npm metadata/tarball and release assets for OpenCLI v1.8.7; record exact digests and lifecycle scripts before installation.
2. Install exactly `@jackwener/opencli@1.8.7`; do not install `latest`, OpenCLI skills, plugins, or unrelated adapters.
3. Load the matching Browser Bridge release only into a newly created temporary ChatGPT-only Chrome user-data directory. Do not attach to the owner's normal Chrome profile or tabs.
4. The owner signs into `chatgpt.com` manually in that dedicated profile. Credentials, cookies, storage, and unrelated conversations are never inspected or exported.
5. Run `opencli doctor`, profile selection, and `opencli chatgpt status` before dispatch. Any abnormal state stops the run.
6. Prepare and submit one standard-mode, no-file prompt: `Reply with exactly CHATGPT_RESEARCH_LIVE_SMOKE_OK`.
7. Success requires the exact answer token, a conversation reference, internally consistent wrapper receipts, and no second provider turn.
8. Stop the OpenCLI daemon, close the dedicated Chrome instance, remove the temporary extension/profile and smoke prompt/answer content according to the receipt policy, and retain only minimal hashes/status evidence.

## Success, falsifiers, and deferrals

The smoke succeeds only if the actual `chatgpt-research submit-once` path reaches `completed` and its durable artifacts agree with the observed answer/reference. A direct OpenCLI or browser success is diagnostic evidence only.

Stop before provider dispatch if v1.8.7 cannot be installed and identity-verified, its exact output cannot be parsed without guesswork, or a dedicated profile cannot be isolated. Stop after durable intent as `ambiguous_effect` if remote submission cannot be ruled in or out. Any required retry, generic browser command, history extraction, cookie access, stealth/evasion, challenge handling, or normal-profile binding falsifies this M003 design.

Web, Deep Research, image, attachments, connectors, generated files, answer retention policy, queueing, cancellation, restart reconciliation, and general V1 transport remain deferred.

## M003 execution outcome — 2026-08-24

`[OWNER DECISION / ROOT EVIDENCE]` The owner selected temporary official Chrome for Testing after branded Chrome ignored unpacked-extension launch. Exact OpenCLI, bridge, daemon connectivity, and ChatGPT login preflight passed in the isolated context. The one wrapper submit then ended as terminal `ambiguous_effect` with `ERR_OPENCLI_EXIT`, unknown remote effect, no accepted answer/reference, and no retry. The design's ordering and ambiguity rules operated as intended; successful provider answer return was not established. Future live work is a separate milestone after offline diagnostic-receipt design.
