# Runtime integration candidate

Status: pre-release internal implementation. The first public release remains gated on actual model selection and installed research/authentication journeys. Passing offline tests and synthetic reports do not establish provider behavior.

## What this slice supplies

- Runtime-scoped durable admission and four slots, priority/FIFO order, shared pacing and conservative unresolved-effect handling.
- Pinned generic OpenCLI commands with durable one-shot command intent, target/draft checks and exact-turn observation. The current v2 preparation path inspects and holds; it does not select a model, insert a draft or send.
- Completed-result continuation and immutable report/content identity in the local runtime API. Provider-side follow-ups remain unqualified.
- Foreground or detached CLI service, finite operation-specific observer leases, durable NDJSON events, explicit result retrieval and non-replacing export.
- A user-local package installation plan, owned launcher inventory, explicit browser-host configuration and separate human-authentication control.

## Installed entrypoints

`chatgpt-research runtime --help`, `research --help`, `setup --help` and `auth --help` show the exact flags for this version. New commands use readable labels by default and explicit `--json` for structured output. Existing legacy commands retain their earlier contracts.

Follow the packaged [setup reference](../skills/chatgpt-research/references/setup.md) and [active delivery reference](../skills/chatgpt-research/references/active-delivery.md). Create selected preparation/content directories before use. Use absolute canonical paths: runtime ancestors must not be symlinks; on macOS, resolve the system temporary-directory alias before selecting a temporary runtime.

Submitting returns a job and operation reference while the job remains queued. The required active observer must exist before dispatch. Keep stable request keys across a lost acknowledgement; a new key is not a recovery mechanism. An unresolved command or send is never replayed automatically.

The CLI reads the runtime's exact result reference and can export it to a new explicitly selected file. An SSH-host path is not a local delivery path. Retrieve permitted content over the configured SSH route, compare its declared SHA-256/size, and create the local destination without replacing existing bytes.

## Observed checks and limits

During the authorized 2026-09-10 qualification, a packaged snapshot installed into new private prefixes on macOS/Node26 and Linux/Node22 over SSH. The installed CLI's help, empty-runtime configure/start/inspect/stop and retirement worked against existing pinned OpenCLI1.8.7/Bridge1.0.23. Synthetic installed events reached the active Codex code-mode cell; catch-up suppressed already-seen event IDs. Synthetic result retrieval/export and remote-to-local hash comparison worked.

These checks used existing dependencies and no provider sends. Their private receipts identify exact package/source hashes. Later code changes need the relevant checks repeated; this dated paragraph is not a claim about an arbitrary HEAD. Setup still reports missing prerequisites explicitly. It does not silently install system packages or establish fresh-account authentication.

Open gates: UI-native model/effort intent decision, positive send preparation, actual four-conversation/follow-up acceptance, full fresh/adopted browser/auth journeys, notification behavior on route loss, and release packaging/review. No remote-Mac, idle-task wake-up, general MCP gateway, or attachment support is claimed here.
