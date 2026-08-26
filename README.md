# Ordinary ChatGPT Research Adapter

Status: OpenCLI remains the selected practical upstream behind the custom `chatgpt-research` wrapper protocol. M002 implemented offline preparation, M003 established the one-shot transport and ambiguity contract, M004 provides a locally usable `ask` command, and M005 adds wrapper-owned versioned epistemic-rigor profiles to every compiled prompt. Exact OpenCLI v1.8.7 and Browser Bridge 1.0.23 are installed locally with the owner's persistent Chrome choice. A live standard-mode wrapper call sent a prompt and saved the answer locally; a subsequent structured-response regression was corrected by reading the returned conversation through a fresh ephemeral container instead of the stale submission container. OpenCLI's current Web Search and Deep Research selectors failed before submission against the current ChatGPT UI, so those two explicit modes remain wired but not live-usable. A private, code-empty GitHub remote and the M006 issue milestone now exist; no commit, code push, public publication, or deployment exists.

This standalone project evaluates a narrow adapter through which Codex can submit bounded research questions and approved files to ordinary signed-in ChatGPT Chat, then receive answers and generated files. It is not a coding runtime, a general browser controller, ChatGPT Work, or a substitute using the OpenAI API. The owner-provided ChatGPT CLI and Bridgewright context was not inspected and is not a dependency.

## Decision

**Adopt a pinned OpenCLI release through a custom wrapper protocol. Do not fork merely to delete generic capabilities.**

OpenCLI is now the leading upstream because the expanded sweep corroborated both the strongest maintenance signal and the best mature transport/recovery primitives: 28,486 stars, 2,799 forks, same-day source activity, current core CI, a released extension, owned automation tabs, one-writer leases, command journaling, and explicit unknown-effect outcomes. `[CONFIRMED — https://github.com/jackwener/OpenCLI and https://github.com/jackwener/OpenCLI/releases/tag/v1.8.7]`

OpenCLI carries disclosed authority that the wrapper does not normally need. Its shared extension requests debugger, cookies, downloads, and `<all_urls>`; its daemon has loopback and browser-origin protections but no secret application authentication; and its broader command surface includes arbitrary page JavaScript, cookies, screenshots, network capture, file input, and explicit user-tab binding. `[CONFIRMED — https://github.com/jackwener/OpenCLI/blob/a0fbe90a7f682f6374d75fb99325c60c48e3aa56/extension/manifest.json#L6-L18]` `[CONFIRMED — https://github.com/jackwener/OpenCLI/blob/a0fbe90a7f682f6374d75fb99325c60c48e3aa56/docs/guide/remote-orchestration.md#L13-L20]` These are risk disclosures and reasons to keep operation local and protocol-directed—not adoption blockers.

M001 tested a stricter deletion-only fork at release `v1.8.7`, commit `87b60a36590c3e2a466c37266c3348d73d7f68fe`. A small authenticated seam was feasible, while ordinary `chatgpt ask` reaches OpenCLI's generic `exec` and `navigate`; Deep Research adds network capture, frames, and CDP. That falsifies capability minimization through a small fork. It does not falsify responsible use of the maintained upstream through an allowlisted wrapper.

## Codex interface direction

`[OWNER DECISION — 2026-08-24]` The Codex-facing product is a custom `chatgpt-research` skill over pinned OpenCLI. The skill directs agents through an allowlisted research protocol; it does not expose or instruct use of OpenCLI's generic browser skill, unrelated adapters, cookie commands, tab binding, or remote orchestration. This is a supported-workflow boundary, not a claim that the underlying OpenCLI installation lacks other capabilities.

Deep Research is **optional, not the default**. Current OpenCLI `chatgpt ask` sends an ordinary prompt by default and separately offers mutually exclusive `--web-search` and `--deep-research` flags. `[CONFIRMED — https://github.com/jackwener/OpenCLI/blob/87b60a36590c3e2a466c37266c3348d73d7f68fe/clis/chatgpt/ask.js#L48-L72 — “deep-research”; “web-search”; “cannot enable both”]` The proposed skill therefore uses ordinary Chat for basic questions, web search for current/source-driven questions, and Deep Research only when explicitly requested. Image generation/editing is a separate explicit operation.

OpenCLI does **not** currently expose a typed GitHub-app/connector selector in its ChatGPT adapter. Its typed composer-tool list contains only Deep Research and Web Search; its file command uploads project knowledge, and its image command can upload/edit/download images. General conversation attachments and arbitrary generated-file return remain gaps. Official OpenAI documentation says plugins can combine skills with connectors such as GitHub, but that does not establish an OpenCLI command or its exact write schema. `[CONFIRMED — https://learn.chatgpt.com/docs/skills-and-plugins — “GitHub, Google Drive, or Slack”]` `[ROOT LIVE OBSERVATION — 2026-08-25]` One bounded standard-mode session returned the exact private parent-issue and milestone state and reported issue creation with milestone assignment among 89 connected GitHub operations, but reported no operation for setting a parent/sub-issue relationship. It therefore made no write under the no-partial-issue instruction; root independently confirmed that only the existing parent remained. This is provider-reported capability evidence, not a direct connector-schema capture or a typed OpenCLI selector. Connector selection remains a separately tested adapter contribution, not a prompt-only assumption.

## Auditable funnel

A Luna Max discovery sweep reviewed 52 result cards, deduplicated 31 repositories/tools, retained 24 plausible candidates, source-screened 10 serious candidates, and shortlisted six. Each shortlisted repository then received its own Terra High source audit in an isolated `/private/tmp` clone. DevSpace received an additional Terra audit because the owner named it directly.

The strongest routes after deep review are:

1. **Pinned OpenCLI plus the custom `chatgpt-research` wrapper** — selected practical route and strongest maintained upstream.
2. **Wrapper-owned templates, receipts, pacing, stop/retry, and handoff** — local product layer above OpenCLI.
3. **A custom controller or older-controller revival** — fallback only if actual integration tests expose a concrete blocker, not because OpenCLI retains generic capabilities.

Ask Bridge and 10x-chat are rejected as shipped because current source includes `--disable-blink-features=AutomationControlled`; 10x-chat also prefers Patchright and injects browser-property disguises. ChatFerry lacks ChatGPT attachment and generated-file return. `chatgpt-use` is conceptually close but unreleased current source depends on an unpinned broad browser executable and lacks durable recovery/files. DevSpace is maintained but runs in the reverse direction: ChatGPT calls local coding tools; it does not submit a question to ChatGPT and return the answer to Codex.

## Permission boundary

Technical viability is separate from permission to operate. The current individual Terms say users may not “Automatically or programmatically extract data or Output” and may not bypass restrictions or protective measures. `[CONFIRMED — https://openai.com/policies/row-terms-of-use/ — “Automatically or programmatically extract data or Output”]` Owner authorization, responsible rate limits, and proxy framing establish product intent but do not change that text. `[OWNER DECISION — 2026-08-24]` The owner accepts that unresolved contract/account risk for continued bounded local use and rejects treating the text as a technical blocker for this project; this is not a legal-compliance finding or authorization for mass extraction.

Official MCP/plugin documentation describes the supported direction as ChatGPT discovering a server’s tools, calling them, and using the returned result in the conversation. It does not document an ordinary-Chat answer export channel back to Codex. `[CONFIRMED — https://developers.openai.com/plugins/concepts/mcp-server — “The model selects a tool”; “uses the result to continue the conversation”]`

## Documents

- [Candidate landscape, maintenance, security, and viability](docs/EVALUATION.md)
- [Product and authority boundary](docs/PROJECT-BOUNDARY.md)
- [Pinned offline evaluation plan](docs/M001-PLAN.md)
- [Offline wrapper foundation plan and receipt](docs/M002-PLAN.md)
- [One-shot OpenCLI transport design](docs/M003-DESIGN.md)
- [M003 implementation and live-smoke plan](docs/M003-PLAN.md)
- [Minimal local production path](docs/M004-PLAN.md)
- [Epistemic rigor profiles](docs/M005-PLAN.md)
- [M006 production-usability milestone](docs/M006-PLAN.md)

## Offline wrapper foundation

M002 provides one executable operation:

```text
chatgpt-research prepare --request <json-file> --output-root <existing-directory>
```

The request must name `template_id` and `template_version`. Omitted mode defaults to `standard`; `web`, `deep`, and `image` require explicit selection and a reason. A successful call writes a versioned prompt plus a write-once job/turn receipt whose state is `prepared` and whose transport status is `not_dispatched`. It does not import or invoke OpenCLI, access a browser or account, or send a provider request.

M003 adds one second operation:

```text
chatgpt-research submit-once --output-root <existing-directory> --job-id <prepared-job-id> --opencli <absolute-executable-path>
```

Only a validated `standard` bundle is accepted. The wrapper verifies an exact OpenCLI v1.8.7 executable identity, writes immutable dispatch intent before one fixed no-shell ask process, and records either a validated answer/reference or terminal `ambiguous_effect`. It never retries. Offline tests use disposable fake executables; they do not establish signed-in ChatGPT behavior.

## Minimal local command

M004 adds the shortest usable path:

```bash
node ./bin/chatgpt-research.js ask "Your question" \
  --output-root "$PWD/.runtime/output" \
  --opencli "$PWD/.runtime/opencli/node_modules/.bin/opencli"
```

The persistent Chrome profile must be running with the installed OpenCLI Browser Bridge enabled and connected. The default `standard` mode is live-verified. Submission uses the persistent container; response collection reloads only the returned conversation in an ephemeral reader and requests Markdown so a partially rendered submission DOM is not mistaken for the completed answer. Add `--mode web` or `--mode deep` only after upstream OpenCLI updates its ChatGPT tool selectors; on the currently tested UI they fail before sending the prompt. Each successful standard call creates a job directory containing `response/answer.md` and `response/result.json`.

## Epistemic rigor profiles

Every prepared prompt now includes a pinned `chatgpt-research-epistemic` profile independently of execution mode. The default `standard` profile assigns IDs to substantive factual, interpretive, synthesis, uncertainty, and recommendation claims and asks for a compact claim ledger containing status, evidence, warrant basis, contrary evidence or limits, and a revision trigger. Warrant is qualitative—directness, independence, recency, methodological quality, and fit—rather than an uncalibrated numeric confidence score.

Built-in profiles are `light`, `standard`, and `strict`. Additional audit detail and citation density are opt-in:

```bash
node ./bin/chatgpt-research.js ask "Your question" \
  --rigor strict \
  --citations expanded \
  --audit-appendix \
  --output-root "$PWD/.runtime/output" \
  --opencli "$PWD/.runtime/opencli/node_modules/.bin/opencli"
```

Use `--rigor-file /absolute/path/profile.json` for a custom versioned profile. A custom file must use the closed profile schema:

```json
{
  "profile_id": "owner-rigor",
  "version": "1.0.0",
  "status": "active",
  "protocol_id": "chatgpt-research-epistemic",
  "protocol_version": "1.0.0",
  "claim_coverage": "substantive",
  "claim_ledger": true,
  "body": "Your compact epistemic and output requirements."
}
```

`claim_coverage` is `conclusions`, `substantive`, or `all-claims`. The exact semantic content is hashed into the prompt and receipts. A custom profile cannot change mode selection or transport behavior. The owner-provided AHR-C document informed this feature but is neither adopted nor packaged by the adapter.

Deterministic tests establish exact profile loading, compilation, hashing, option routing, and receipt propagation. They do not establish that a model will follow every requested label, citation, or ledger field; that is separately observable conformance evidence.

## Current authority and execution status

`[OWNER DECISION — 2026-08-24]` Underlying generic capabilities do not need to be absent. The wrapper protocol is the intended agent interface and is sufficient for adoption. The earlier clean-controller disposition is superseded because it depended on an assistant-proposed gate the owner did not ratify.

The M003 slice established the first controlled mapping to pinned OpenCLI and proved the no-retry ambiguity contract. The owner subsequently authorized M004, persistent Chrome, and live execution. M004 changed the practical standard flow to submit without waiting and then read the specific returned conversation until its completed assistant response is available. That flow succeeded live and saved `CHATGPT_RESEARCH_PRODUCTION_OK`. A later Extra High answer exposed a stale persistent-reader DOM that contained only a table header; the corrected ephemeral Markdown reader recovered 1,210 UTF-8 bytes from the same conversation, including the final GitHub and Projects rows, without resubmission. Web and Deep Research remain blocked by exact upstream selector errors, not by wrapper dispatch or persistence. See `docs/M003-LIVE-RECEIPT.md` for the historical M003 receipt and `docs/M004-PLAN.md` for the current result.
