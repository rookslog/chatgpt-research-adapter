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

Current evidence therefore supports a pinned-anchor compatibility patch and an
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

Connector order is not a caller-controlled semantic dimension. The wrapper
must reject duplicate IDs, normalize the remaining canonical IDs into one
documented lexical order, and record both the requested set and canonical
activation sequence. Reversing the input list therefore cannot produce a
different UI transaction. Supporting an exceptional connector-specific order
would require new evidence and a versioned contract change.

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
  -> inventory every existing noneditable composer node
  -> reject any state-bearing or unclassified pre-existing node
  -> canonicalize the requested connector set
  -> discover each canonical connector on the current visible surface
  -> activate connector 1 and branch on selected, connection-required, or neither
  -> continue only after exact connector-1 selected state
  -> reopen current surface and activate connector 2 through the same branch
  -> verify the complete canonical connector state
  -> select and verify forced Web/Deep mode, if requested
  -> atomically recheck every connector plus tool state
  -> fill prompt while preserving only the verified noneditable state
  -> recheck connector/tool state and exact prompt text
  -> publish selection receipt
  -> publish dispatch intent bound to the selection receipt
  -> recheck the exact connector/tool/prompt state adjacent to submission
  -> on mismatch, leave send authorization absent and record known-unsent state change
  -> on match, durably publish send authorization bound to the observed state
  -> execute one compare-and-submit operation against that authorized state
```

A fresh route and empty editable text do not prove an empty state. The baseline
inventory must classify every visible `contenteditable=false` descendant of the
active composer. It may explicitly account for inert structural nodes, but any
selected tool, connector, attachment, stale pill, or unclassified noneditable
node makes the composer nonblank and the operation fails known-unsent. Prompt
fill may preserve only nodes bound to that accepted baseline plus the newly
verified requested state.

The order between connector activation and forced Web/Deep selection is not yet
settled. The no-submit probe must test both connector/tool transitions because
either action may replace or hide the other's chip. This is distinct from
caller connector-list order, which is canonicalized above. Production should
adopt the connector/tool transition whose final atomic recheck proves the
complete requested state; it must not assume that visually disappearing state
remains active.

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

This branch is required both during discovery and immediately after each
activation attempt. A connector row can reveal authorization UI only after it
is clicked. After a bounded click, the wrapper must observe exactly one of:

1. the exact selected connector state;
2. recognized connection/authorization UI, producing `connection_required`;
3. neither state, producing `ambiguous` with the prompt known unsent.

It must not collapse cases 2 and 3 into a generic selector failure.

## Connector selection receipt

Publish an immutable receipt before dispatch intent:

```text
schema
job_id
turn_id
requested_connectors[]
canonical_connectors[]
discovered_connectors[]
activated_connectors[]
activation_strategy[]
connection_state[]
requested_mode
resolved_tool_state
composer_blank_before
baseline_noneditable_nodes[]
baseline_state_hash
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
requested connector/tool state cannot be verified immediately before send, the
prompt remains unsent. The post-intent recheck is mandatory: immutable intent
records planned dispatch, not proof that the previously receipted UI state
survived until submission.

That recheck introduces a second durable commit point. Provider mutation is
forbidden until an immutable send-authorization receipt exists with:

```text
schema
job_id
turn_id
selection_receipt_sha256
intent_sha256
pre_submit_state_hash
prompt_sha256
authorized_at
provider_submission: false
```

On a mismatch, do not publish send authorization and do not call send. Publish
`pre_submit_disposition=state_changed_before_submit` when possible. If the
process stops before that terminal outcome is durable, recovery treats an
intent with no send authorization as known unsent and may durably finalize the
same disposition; it must not leave the job in an intent-only non-retry state.

On a match, durably publish send authorization and run exactly one bounded
compare-and-submit operation. That operation compares the current state to
`pre_submit_state_hash` and invokes send only on an exact match. A lost outcome
after send authorization is necessarily ambiguous: recovery must not retry,
because the durable authorization proves that provider mutation was permitted
but cannot prove whether it occurred. This is the explicit local/provider
uncertainty boundary; selection receipt or intent alone is not that boundary.

This requires a versioned connector-dispatch schema and corresponding recovery
reader. It must not reinterpret an existing M003/M004 intent-only job as known
unsent: those schemas permit provider mutation immediately after intent. The
absence of send authorization proves no mutation only for a schema whose send
path is structurally gated on that artifact.

## Smallest no-submit probe

This probe requires separate owner authorization. It uses external Chrome and
the exact installed OpenCLI/Bridge path, but submits zero prompts.

1. Start from a separate fresh `/new` composer for every scenario. Inventory
   every visible noneditable composer node before treating it as blank.
2. Capture the minimal sanitized visible connector row/suggestion structure and
   record whether every baseline node is inert, state-bearing, or unclassified.
3. Activate GitHub once through the plus-menu route; record the first result and
   selected representation.
4. On a new blank composer, activate GitHub once through the `@` suggestion
   route; verify conversion from text to selected state.
5. If a second already-connected connector is available without authorization,
   activate the two connectors once in canonical ID order and record whether
   both remain selected. Reverse caller input is an offline normalization case,
   not a second live activation order. Do not connect a new service merely to
   run the probe.
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
   unknown, or label-like free text; reversed input produces the same canonical
   activation sequence and receipt identity;
3. a fresh route with empty editable text rejects any state-bearing or
   unclassified pre-existing noneditable composer node;
4. discovery is limited to current visible connector surfaces and excludes
   hidden/stale menus and unrelated navigation/sidebar rows;
5. raw `@name` text without exact suggestion selection fails known-unsent;
6. each activation attempt distinguishes exact selected state,
   connection-required UI revealed after the click, and ambiguous neither-state
   before prompt fill or provider submission;
7. activating a second connector must preserve and reverify the first, or fail
   with multi-connector unsupported;
8. connector -> tool and tool -> connector transitions recheck the complete
   requested state and detect replacement;
9. prompt fill preserves exactly the verified connector/tool chips and inserts
   text after them;
10. stale/foreign `contenteditable=false` nodes cannot satisfy a connector
   postcondition merely because `fillChatGPTMessage()` would preserve them;
11. a connector/tool/prompt change after dispatch intent but before send records
    `state_changed_before_submit`, leaves send authorization absent, and never
    calls send;
12. a crash after intent but before send authorization recovers as known unsent,
    including a crash while publishing the mismatch outcome;
13. send authorization binds the selection receipt, intent, prompt, and current
    state hashes and is durable before the compare-and-submit operation;
14. a compare-and-submit mismatch never calls send; loss of its outcome after
    authorization is ambiguous and never auto-retries;
15. failed or ambiguous selection never calls send and never auto-retries;
16. selection receipt hash is required by dispatch intent, send authorization,
    handoff, result, and Deep completion event where applicable;
17. required pinned source-anchor drift fails before any connector activation.

These scenarios test distinct mechanisms. Connector-name permutations should
not be expanded beyond surfaces observed by the bounded probe; canonical order
removes caller-order permutations from the live matrix.

## Ownership and architecture

### Near term

Keep the connector request/receipt contract in the wrapper. Add a narrow
pinned-anchor ChatGPT compatibility helper near `selectChatGPTTool()` and
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
- connector support pushes the combined pinned-anchor patch surface beyond the
  agreed narrow compatibility budget.

The present source evidence does not cross these gates.

## Present recommendation

- Treat connector connection, activation, preservation, use, and operation
  capability as separate states.
- Start every connector transaction from a verified blank composer; activate
  connectors before inserting prompt text, and reject unrequested pre-existing
  noneditable state.
- Prefer the observed plus-menu route for the first probe; treat `@` suggestion
  selection as a second typed route, never a prompt convention.
- Keep Web/Deep tool mode independent from connectors and verify the complete
  combined state after durable intent and immediately before send.
- Implement multi-connector support only if the current UI preserves two exact
  selected identities; otherwise declare it unsupported rather than simulating
  composition in prompt text.
- Continue wrapper plus a narrow pinned-anchor patch and upstream contribution;
  use #29 as a re-evaluation gate, not an automatic fork switch.
- Keep #28 open until the separately authorized zero-submit probe resolves the
  selected-chip, connection-state, multi-connector, and connector/Web ordering
  unknowns.
