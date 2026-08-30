# M007 model and reasoning-effort control

- Issue: [#25](https://github.com/rookslog/chatgpt-research-adapter/issues/25)
- Evidence cutoff: 2026-08-30
- Adapter baseline: `82c760c1f6f9338ecece630926dba3611fd8a8ee`
- Installed dependency: `@jackwener/opencli@1.8.7`
- Status: research recommendation; not an approved product contract or live qualification

## Question and answer

The smallest maintainable wrapper contract must represent **model identity** and
**reasoning effort** as separate fields. The current UI exposes them as separate
controls, while OpenCLI v1.8.7's single `chatgpt model` command mixes both
dimensions.

A plain wrapper sequence of:

```text
opencli chatgpt model <target>
opencli chatgpt ask <prompt>
```

is not sufficient for a production contract. The operations use separate
browser-command lifetimes; no receipt binds the selected state to the send; and
the upstream `advanced` and generic `pro` targets first mutate specific GPT-5.5
model configurations rather than selecting only the current model's effort.

The recommended near-term route is therefore:

1. the wrapper owns a two-dimensional request and receipt schema;
2. selection, verification, and send occur under one profile-scoped lease and
   one same-page transport transaction;
3. a narrow, exact-source-checked compatibility patch may provide that seam in
   a temporary OpenCLI copy while an upstream contribution is pursued;
4. do not fork OpenCLI yet.

This is a recommendation for M007 approval issues #29/#30, not a decision made
by this research ticket.

## Evidence

### Confirmed current adapter facts

- `src/cli.js` accepts no model or effort option.
- `src/prepare.js` rejects unknown request keys; model and effort cannot enter a
  prepared bundle.
- prepared, intent, handoff, result, and completion-event schemas contain no
  requested or resolved model/effort identity.
- `runAsk()` in `src/opencli-transport.js` always invokes a new conversation and
  adds only the explicit Web or Deep tool flag.
- OpenCLI executable identity is checked before transport, but there is no
  profile-scoped model-selection lease.

The existing default path must remain byte- and behavior-compatible when the
new fields are omitted.

### Confirmed exact OpenCLI v1.8.7 facts

The installed ChatGPT adapter matches registry v1.8.7 and upstream git head
`87b60a36590c3e2a466c37266c3348d73d7f68fe`.

[`model.js`](https://github.com/jackwener/OpenCLI/blob/87b60a36590c3e2a466c37266c3348d73d7f68fe/clis/chatgpt/model.js)
exposes one `chatgpt model` command. Its choices include aliases for `fast`,
`balanced`, `advanced`, `very-high`, generic `pro`, and `gpt-5.6-pro`.

[`utils.js`](https://github.com/jackwener/OpenCLI/blob/87b60a36590c3e2a466c37266c3348d73d7f68fe/clis/chatgpt/utils.js)
implements the targets differently:

| OpenCLI target | Source behavior before visible-picker fallback | Contract interpretation |
|---|---|---|
| `fast` | no backend model configuration | effort candidate |
| `balanced` | no backend model configuration | effort candidate |
| `advanced` | requests `gpt-5-5-thinking` with `extended` effort | conflates model and effort |
| `very-high` | no backend model configuration; visible-picker path | effort candidate; displayed as Extra High in the observed UI |
| `pro` | requests `gpt-5-5-pro` with `standard` effort | conflates generic Pro effort with a GPT-5.5 Pro model |
| `gpt-5.6-pro` | requests `gpt-5-6-pro` with `standard` effort | exact-model candidate |

For targets with `modelConfig`, `selectChatGPTModel()` obtains browser cookies,
requests a session access token, PATCHes the account's last-used model
configuration, rewrites the last-model cookie, reloads `/new`, and verifies the
visible result. If that path is unavailable or does not prove selection, it
falls back to a native visible-picker click.

The upstream tests cover aliases, API success/failure, visible-picker fallback,
five-option order fallback, and selected-state verification. They are
deterministic source evidence; they do not establish compatibility with today's
signed-in UI.

### Current UI and owner observations

The merged [capability inventory](M007-CAPABILITY-INVENTORY.md) records one
zero-submit external-Chrome observation:

- current reader result: `very-high` / `Very High`;
- visible effort: `Extra High`, described as `4 of 5`;
- model rows: checked `GPT-5.6 Sol`, unchecked `GPT-5.5`;
- a separate `Select model` item;
- blank composer, zero message nodes, and no model change or provider submit.

The owner reports that Pro is human-selectable in the effort/model surface. That
is evidence for availability to this account, but it does not establish the
automation selector, exact state attributes, or whether upstream generic
`pro` preserves the current base model. The bounded probe did not independently
reach a Pro row, and its absence from that capture is not contrary evidence.

## Domain distinction

The wrapper should use canonical names and keep UI/upstream aliases at the
transport boundary:

```json
{
  "compute": {
    "model": "current | gpt-5.6-sol | gpt-5.5 | gpt-5.6-pro",
    "reasoning_effort": "current | fast | balanced | advanced | extra_high | pro"
  }
}
```

- `current` means observe and preserve, not silently choose a default.
- `pro` under `reasoning_effort` means the fifth effort level on the selected
  base model. It must never be normalized to `model=gpt-5.5`.
- `gpt-5.6-pro` is an exact model identity, not an alias for effort `pro`.
- CLI convenience aliases such as `xhigh` may map to `extra_high` before
  preparation, but durable receipts contain only canonical values.
- Unsupported combinations fail before dispatch intent or provider mutation.

The schema can represent more than the first qualified implementation. A
capability table, not permissive fallback, decides which combinations are
accepted.

## Initial capability table

| Requested model | Requested effort | Evidence at cutoff | Initial disposition |
|---|---|---|---|
| `current` | `current` | existing wrapper default plus current read-only observation | preserve as the default no-op |
| `current` | `extra_high` | current UI observation; OpenCLI `very-high` visible-picker source and deterministic tests | first selector candidate; still needs bounded selection qualification |
| `current` | `fast` or `balanced` | OpenCLI source/tests only | represent but reject until current UI qualification |
| `current` | `advanced` | upstream changes model to GPT-5.5 Thinking before fallback | reject until a visible effort-only selector exists |
| `current` | `pro` | owner availability observation; upstream changes model to GPT-5.5 Pro before fallback | priority target, but reject until a visible effort-only selector and postcondition exist |
| `gpt-5.6-pro` | `current` | exact upstream target/tests; no current selection observation | represent but reject until exact-model qualification |
| `gpt-5.6-sol` or `gpt-5.5` | `current` | current UI rows; no canonical upstream target | represent but reject until exact-model selection exists |
| any explicit model | any explicit non-current effort | no independent two-dimensional qualification | reject in the first implementation |

“Reject” here means known-unsent validation failure. It does not mean the
ordinary UI lacks the capability.

## Required transaction

The minimum reliable transition is:

```text
validate canonical request
  -> acquire profile-scoped compute/send lease
  -> open blank target conversation
  -> observe model + effort before state
  -> select only requested non-current dimensions
  -> verify exact current model + effort
  -> atomically recheck immediately before send
  -> publish dispatch intent bound to selection receipt
  -> submit once
  -> persist provider handoff/result
  -> release lease
```

“Atomically” means no wrapper-controlled wait or independent command occurs
between the final state read and send. A separate `chatgpt model` process
followed by `chatgpt ask` cannot supply this invariant, even if root serializes
its own processes. A human action or another OpenCLI consumer could change the
account state between them.

The lease prevents two wrapper jobs from selecting different targets at the
same time. It does not make account state private; receipts must still show what
was observed immediately before send.

## Receipt contract

A write-once `compute-selection.json` should be published before the dispatch
intent and bound into every later receipt by SHA-256. It needs at least:

```text
schema
job_id
turn_id
opencli_version
opencli_executable_sha256
requested_model
requested_reasoning_effort
before_model
before_reasoning_effort
resolved_model
resolved_reasoning_effort
selector_strategy
selection_status
pre_send_verified_at
provider_submission
preference_effect
finished_at
```

Required semantics:

- `selection_status`: `unchanged_verified | changed_verified | failed | ambiguous`;
- `provider_submission`: always `false` in this receipt; the dispatch handoff is
  the first artifact that can establish provider acceptance;
- `preference_effect`: `unchanged | changed_verified | unknown` independently
  records the account/UI preference effect;
- no cookie, token, authorization header, storage value, raw DOM, or account
  identifier is retained;
- dispatch intent, handoff, result, and Deep completion event include the
  selection-receipt hash plus requested/resolved canonical values.

If selection cannot be verified, the prompt is known unsent. The wrapper must
not “continue with whatever is selected.” If the send later becomes ambiguous,
the existing no-retry rule remains authoritative; changing or restoring the
preference cannot convert an ambiguous provider effect into a known-unsent one.

Automatic restoration of the prior preference is **not** part of the first
contract. Whether post-handoff restoration can affect an in-progress response
is not established. A future bounded probe must justify restoration before it
becomes default behavior.

## Implementation routes

### A. Separate unmodified OpenCLI commands

Smallest code, but rejected for production because it lacks atomicity and uses
the conflated generic `advanced`/`pro` behavior.

### B. Wrapper-owned exact-source compatibility patch — recommended near term

Patch only a private temporary OpenCLI copy, as the adapter already does for
selector/Markdown compatibility. The patch should:

- add separate canonical `model` and `effort` inputs to the ChatGPT `ask`
  transaction;
- prefer the visible current-surface selector and never route effort `pro` to a
  GPT-5.5 model configuration;
- observe, select, verify, immediately recheck, and send on the same page;
- emit only canonical resolved state in the transport row;
- fail closed if exact pinned source identity changes.

This is a wrapper-owned compatibility layer, not an installed-package mutation
or maintained fork.

### C. Upstream contribution — recommended ownership destination

Propose separate `--model` and `--effort` options on `chatgpt ask`, with the
same-page invariant and a typed resolved-state result. Upstream is the right
long-term owner for generic ChatGPT UI selector maintenance; the wrapper remains
owner of job receipts, ambiguity semantics, and capability gating.

### D. Maintained fork — not justified yet

Create a fork only if one of these falsifiers is observed:

1. the required same-page behavior cannot be expressed by at most two narrow,
   source-identity-checked ChatGPT adapter patches;
2. the compatibility patch must change the Browser Bridge/daemon or a general
   OpenCLI public contract rather than only the ChatGPT adapter seam;
3. the same material divergence survives two consecutive upstream releases
   after an upstream issue/PR is declined or left unusable;
4. multiple project consumers require a versioned distributable OpenCLI API
   rather than this wrapper's private compatibility copy.

UI drift or one delayed upstream release alone is not a fork trigger.

## Smallest justified RED set

1. **Schema separation:** generic effort `pro` cannot normalize to any exact
   model, especially GPT-5.5 Pro.
2. **Default preservation:** omitted compute fields reproduce the current
   prepared bytes and transport arguments.
3. **Known-unsent selector failure:** missing/ambiguous model or effort
   postcondition publishes a typed selection receipt and never calls send.
4. **Pre-send TOCTOU:** a target changed after selection but before the atomic
   recheck aborts without provider submission.
5. **Profile serialization:** two jobs requesting different targets cannot both
   enter select/send; the follower re-observes after acquiring the lease.
6. **Receipt binding:** prepared, selection, intent, handoff, result, and Deep
   event reject mismatched requested/resolved state or selection hash.
7. **Credential exclusion:** durable artifacts contain no raw browser/session
   material.
8. **Pinned-source drift:** any incompatible upstream selector/ask change fails
   before browser or provider mutation.

These tests cover distinct invariants. Additional timing permutations are not
justified until a concrete execution path falsifies one of them.

## Qualification order

After #29/#30 approve the contract and an implementation passes deterministic
tests:

1. one no-submit `extra_high` selection/postcondition probe;
2. one separately authorized no-submit `pro` effort probe that preserves exact
   before/resolved state and does not treat GPT-5.5 Pro as success;
3. one exact-model `gpt-5.6-pro` probe if that target remains in scope;
4. only then, one separately approval-gated provider turn for each capability
   promoted to supported.

No automatic retry follows an uncertain preference or provider effect. One
observation qualifies a path; it does not estimate reliability.

## Present recommendation

- **Contract owner:** wrapper.
- **Current selector implementation owner:** pinned compatibility patch, then
  upstream if accepted.
- **Fork:** defer.
- **First product target:** preserve `current/current`, then qualify
  `current/extra_high`; make `current/pro` the next explicit target using an
  effort-only visible selector.
- **Decision gate:** issues #29 and #30.
