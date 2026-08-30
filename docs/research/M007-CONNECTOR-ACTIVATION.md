# M007 connector activation and composition

- Issue: [#28](https://github.com/rookslog/chatgpt-research-adapter/issues/28)
- Evidence cutoff: 2026-08-30
- Adapter baseline: `dc2835459acad6b2fb233f37e41ce6e5d1719d6d`
- Installed dependency: `@jackwener/opencli@1.8.7`
- OpenCLI release source: `87b60a36590c3e2a466c37266c3348d73d7f68fe`
- Status: source/offline phase complete; connector activation and composition
  remain no-submit live gates

## Current answer

The current wrapper and exact OpenCLI v1.8.7 do not expose a typed ChatGPT
connector operation. OpenCLI's only typed composer tools are Web Search and
Deep Research. It has no connector discovery result, connected-state check,
plus-menu connector selector, `@`-mention selection flow, multi-connector
postcondition, or connector receipt.

The current signed-in UI does visibly expose a GitHub row under the blank
composer's plus menu. One historical Standard conversation also returned exact
private GitHub repository state and provider-reported GitHub operations. Those
facts establish current discoverability and one connected-session result. They
do **not** establish how GitHub was activated, whether it is presently active,
whether two connectors compose, or whether explicit Web Search remains selected
alongside a connector.

The exact OpenCLI send path supplies a promising narrow seam:

- `selectChatGPTTool()` already opens the plus menu, selects an exact visible
  Web/Deep row, and verifies a selected tool pill;
- `fillChatGPTMessage()` clears editable prompt text but clones and preserves
  every `contenteditable=false` node before typing the prompt;
- current Web/Deep selected state is represented by a
  `contenteditable=false` composer chip.

If connector selection also produces stable noneditable chips, a narrow
ChatGPT-adapter addition can activate connectors first, verify the full set,
then reuse the same prompt-insertion/send transaction. That premise has not yet
been observed and is the smallest discriminating gate.

Current evidence therefore supports an exact-source compatibility patch and an
eventual upstream contribution as the preferred route, subject to the no-submit
probe below. It does not justify an OpenCLI fork.

## Evidence classes

### Direct current observation retained by #24

One blank `/new` composer observation recorded:

- plus control: `button[data-testid="composer-plus-btn"]`;
- a visible `GitHub — Triage PRs, issues, CI, and publish flows` row;
- zero prompt text and zero message nodes;
- `connector_activated=false`;
- no connector click, connection flow, authorization, or provider submission.

This is a current UI affordance, not an activation result.

### Historical provider and repository observation

M006 job `job_f9710a3eb59f4f4a8a7f080e6231ba94` returned exact private issue
and milestone state and reported 89 GitHub operations. It made no issue write
under the no-partial-write constraint, which root corroborated through GitHub.

This is evidence that the signed-in ChatGPT session could use a connected
GitHub surface during that turn. The operation count and schemas are
provider-reported; no connector activation state or OpenCLI selector was
captured.

### Owner-reported interaction practice

The owner reports that they commonly type `@` plus a connector name or use the
plus menu, and that connector insertion should begin from cleared composer text.
The owner also reports that ordinary ChatGPT often searches the Web without an
explicit Web Search chip.

These reports guide probe design. They are not promoted to direct structural
observation, and official product documentation cannot defeat a current local
UI observation or owner reproduction.

### Exact OpenCLI v1.8.7 source

`CHATGPT_TOOL_OPTIONS` contains only:

```text
deep-research
web-search
```

`selectChatGPTTool()` resolves only those keys, opens the current visible plus
menu, finds an exact visible option, clicks it, and requires
`getCurrentChatGPTTool()` to report the expected selected state.

`fillChatGPTMessage()` then:

1. finds the active composer;
2. clones all current `[contenteditable="false"]` descendants;
3. replaces the editable composer content with those clones;
4. moves the caret to the end;
5. types the prompt through native input;
6. leaves submission to `submitChatGPTMessage()`.

This provides a chip-preserving insertion mechanism, but it is deliberately
generic: it does not know which preserved nodes are tools, connectors, files,
or stale/foreign pills. A connector implementation must classify and verify
its own exact nodes before relying on this preservation behavior.

`clearChatGPTDraft()` is different. It removes file chips and replaces the
contenteditable composer body. Calling it after connector activation would be
expected to destroy the connector selection. The connector transaction must
start with a verified blank composer and never clear the draft after the first
activation.

No installed ChatGPT command contains connector, mention-suggestion, or
multi-connector logic.

## Distinct states that must not be conflated

| State | Meaning | Required evidence |
|---|---|---|
| discoverable | connector row/suggestion is visible | exact label/id on current visible menu |
| connected | account has already authorized the connector | current non-secret UI state; never infer from row presence alone |
| activated | connector is attached to this composer/turn | exact selected chip/state after activation |
| preserved | prompt insertion did not remove or replace it | full connector-set recheck after prompt fill |
| used | returned turn actually invoked connector tools | provider result/trace evidence, separately from activation |
| capable | exposed operations include the requested action | operation schema or provider-reported tool inventory |

A connector can be connected but not activated, activated but unused, or used
without the wrapper having observed how selection occurred. The wrapper receipt
must report only the states it directly established.

## Web Search is a separate dimension

Web Search is a ChatGPT composer tool in OpenCLI, not a connector identifier.
The fact that ChatGPT may search automatically in Standard mode does not make an
explicit Web Search chip meaningless, and the disappearance of a Web chip after
adding a connector does not by itself prove Web access is disabled.

The request model should therefore keep these independent:

```json
{
  "mode": "standard | web | deep",
  "connectors": [
    { "id": "github", "required": true }
  ]
}
```

`mode=standard` means no wrapper-forced Web/Deep selection. `mode=web` requires
the existing forced-Web postcondition in addition to connector postconditions.
`mode=deep` plus connectors remains unsupported until a current no-submit probe
shows the UI can represent both states simultaneously.

The initial contract should not add a speculative `web=off` switch. No current
source or observation establishes that the ordinary UI offers or honors a
reliable disable-Web control.

## Activation approaches

### A. Plus-menu connector rows — preferred first probe

Advantages:

- begins from an already observed connector row;
- can reuse the current visible-menu scoping and native click machinery;
- avoids treating typed `@GitHub` as activation;
- can identify a connection-required branch before prompt insertion.

Unknowns:

- exact selected representation;
- whether the row opens a nested menu or authorization surface;
- whether repeated selections accumulate or replace chips;
- interaction with forced Web/Deep tool state.

### B. `@` mention suggestion — useful second route

A correct implementation must type only into a verified blank composer, wait
for a connector-specific suggestion surface, click the exact suggestion, and
verify that the typed text was transformed into a selected connector chip. Raw
`@GitHub` text remaining in the prompt is a known-unsent activation failure.

This route may be the more natural way to accumulate multiple connectors, but
it requires a new typed mention-suggestion state machine. OpenCLI currently has
no such helper.

### C. Prompt-text convention

Rejected. Sending text that says `@GitHub` or asks the model to use GitHub does
not prove a connector was attached, connected, preserved, or used.

### D. General browser scripting

Rejected as the product surface. Raw ad-hoc browser commands can help a bounded
diagnostic, but they do not provide a stable typed connector contract or
receipt.

## Proposed blank-composer transaction

```text
acquire the conversation tab/send lease
  -> open a fresh /new composer
  -> verify zero message nodes and blank editable text
  -> discover each requested connector on the current visible surface
  -> fail known-unsent on any connection/authorization requirement
  -> activate connector 1
  -> verify exact connector-1 selected state
  -> reopen current surface and activate connector 2
  -> verify the complete ordered/set-equivalent connector state
  -> select and verify forced Web/Deep mode, if requested
  -> atomically recheck every connector plus tool state
  -> fill prompt while preserving only the verified noneditable state
  -> recheck connector/tool state and exact prompt text
  -> publish selection receipt
  -> publish dispatch intent bound to the selection receipt
  -> submit exactly once
```

The order between connector activation and forced Web/Deep selection is not yet
settled. The no-submit probe must test both transitions because either action
may replace or hide the other's chip. Production should adopt the order whose
final atomic recheck proves the complete requested state; it must not assume
that visually disappearing state remains active.

If only one connector is available or already connected, single-connector
activation can be qualified while multi-connector composition remains an
explicit non-capability.

## Connection and authorization boundary

The wrapper may use only connectors already connected in the owner's current
ChatGPT account. If selection exposes `Connect`, `Authorize`, login, consent,
MFA, passkey, challenge, or account-choice UI:

- record `connection_required` with prompt known unsent;
- do not click or complete the flow;
- do not inspect cookies, tokens, authorization headers, browser storage,
  passkeys, challenges, account identifiers, or unrelated connector state;
- return the exact connector ID and the minimum sanitized UI disposition.

Connection/authorization is a separate owner-controlled operation, not an
automatic fallback inside a research job.

## Connector selection receipt

Publish an immutable receipt before dispatch intent:

```text
schema
job_id
turn_id
requested_connectors[]
discovered_connectors[]
activated_connectors[]
activation_strategy[]
connection_state[]
requested_mode
resolved_tool_state
composer_blank_before
connector_state_hash
prompt_sha256
prompt_preserved_after_fill
provider_submission
selection_status
verified_at
```

Required dispositions:

```text
selection_status:
  unchanged_verified | changed_verified | connection_required | failed | ambiguous

provider_submission:
  false
```

Only the later handoff/result can establish provider acceptance. If the full
requested connector/tool state cannot be atomically verified immediately
before send, the prompt remains known unsent.

## Smallest no-submit probe

This probe requires separate owner authorization. It uses external Chrome and
the exact installed OpenCLI/Bridge path, but submits zero prompts.

1. Start from a separate fresh `/new` blank composer for every scenario.
2. Capture the minimal sanitized visible connector row/suggestion structure.
3. Activate GitHub once through the plus-menu route; record the first result and
   selected representation.
4. On a new blank composer, activate GitHub once through the `@` suggestion
   route; verify conversion from text to selected state.
5. If a second already-connected connector is available without authorization,
   add GitHub then that connector and record whether both remain selected. Do
   not connect a new service merely to run the probe.
6. On separate blank composers, test GitHub -> Web Search and Web Search ->
   GitHub, recording the complete state after each transition.
7. Fill a harmless unsent sentinel after the selected state, verify chips and
   text, then close the probe tab without submitting.

Preserve each first result. Do not retry an ambiguous click, authorize a
connector, inspect unrelated connector contents, or treat one successful state
transition as a reliability estimate.

## Smallest justified RED set

1. omitted connectors preserve the exact current request, argv, prompt, and
   receipts;
2. connector identifiers use a closed canonical registry and reject duplicate,
   unknown, or label-like free text;
3. discovery is limited to current visible connector surfaces and excludes
   hidden/stale menus and unrelated navigation/sidebar rows;
4. raw `@name` text without exact suggestion selection fails known-unsent;
5. connection-required UI fails before prompt fill or provider submission;
6. activating a second connector must preserve and reverify the first, or fail
   with multi-connector unsupported;
7. connector -> tool and tool -> connector transitions recheck the complete
   requested state and detect replacement;
8. prompt fill preserves exactly the verified connector/tool chips and inserts
   text after them;
9. stale/foreign `contenteditable=false` nodes cannot satisfy a connector
   postcondition merely because `fillChatGPTMessage()` would preserve them;
10. failed or ambiguous selection never calls send and never auto-retries;
11. selection receipt hash is required by dispatch intent, handoff, result, and
   Deep completion event where applicable;
12. exact pinned-source drift fails before any connector activation.

These scenarios test distinct mechanisms. Connector-name and ordering
permutations should not be expanded beyond surfaces observed by the bounded
probe.

## Ownership and architecture

### Near term

Keep the connector request/receipt contract in the wrapper. Add a narrow
exact-source ChatGPT compatibility helper near `selectChatGPTTool()` and
`fillChatGPTMessage()` only after the no-submit probe establishes the current
selected representation and composition rules.

### Upstream destination

Propose generic ChatGPT connector discovery/selection upstream with typed
canonical IDs, connection-required disposition, multi-selection result, and a
same-page prompt handoff. The wrapper remains owner of allowed connector
profiles, receipts, ambiguity, and job authorization.

### Re-evaluation gates

Invoke #29 without automatically choosing a fork if:

- selection cannot be expressed within the ChatGPT adapter and existing Bridge
  click/insert primitives;
- stable connector identity requires generalized browser or account-state
  inspection;
- multiple connector/tool state cannot be verified on the same page before
  send;
- a Bridge/daemon public-contract change becomes necessary;
- connector support pushes the combined exact-source patch surface beyond the
  agreed narrow compatibility budget.

The present source evidence does not cross these gates.

## Present recommendation

- Treat connector connection, activation, preservation, use, and operation
  capability as separate states.
- Start every connector transaction from a verified blank composer; activate
  connectors before inserting prompt text.
- Prefer the observed plus-menu route for the first probe; treat `@` suggestion
  selection as a second typed route, never a prompt convention.
- Keep Web/Deep tool mode independent from connectors and verify the complete
  combined state immediately before send.
- Implement multi-connector support only if the current UI preserves two exact
  selected identities; otherwise declare it unsupported rather than simulating
  composition in prompt text.
- Continue wrapper plus a narrow exact-source patch and upstream contribution;
  use #29 as a re-evaluation gate, not an automatic fork switch.
- Keep #28 open until the separately authorized zero-submit probe resolves the
  selected-chip, connection-state, multi-connector, and connector/Web ordering
  unknowns.
