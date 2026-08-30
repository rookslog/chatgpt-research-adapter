# M007 OpenCLI dependency ownership

- Issue: [#29](https://github.com/rookslog/chatgpt-research-adapter/issues/29)
- Evidence cutoff: 2026-08-30
- Adapter baseline: `5babf39375323a209ddc61d3c4e188d08af1d92f`
- Installed dependency: `@jackwener/opencli@1.8.7`
- Installed release source: `87b60a36590c3e2a466c37266c3348d73d7f68fe`
- Current upstream release: `v1.8.8`, source
  `8271afc67e8504bda94c147f446ee29775d08274`
- Status: current ownership decision and re-evaluation procedure defined; no
  fork, dependency upgrade, or upstream submission performed

## Decision

Keep the `chatgpt-research` wrapper as the product and protocol owner. Continue
to use released OpenCLI behind it for the present baseline, with exact-source,
temporary compatibility overlays only where an already qualified operation
needs them. Pursue generic ChatGPT adapter improvements upstream as independent
changes.

Do **not** create a maintained OpenCLI fork yet. The cumulative compatibility
surface is now large enough to trigger this explicit architecture review, but
the review still favors the wrapper route because:

1. all three current overlay families are isolated to
   `clis/chatgpt/utils.js`, applied only to a disposable package copy, pinned
   against exact source, and covered by deterministic failures on drift;
2. Standard and forced Web have bounded live observations through the wrapper;
3. the investigated M007 capabilities mostly reuse existing OpenCLI/Bridge
   primitives, and no M007 implementation has yet demonstrated that another
   long-lived source patch is necessary;
4. a fork would relocate the same ChatGPT UI drift and requalification work
   while adding package, release, merge, and distribution ownership;
5. an alternate controller would replace working transport and recovery
   infrastructure before a concrete OpenCLI integration blocker exists.

This is not the deletion-only fork considered in M001. M001 established that
removing OpenCLI's generic internal browser authority would amount to a new
controller. A future integration fork may retain that authority while owning
ChatGPT-specific source changes. The M001 falsifier therefore does not prohibit
such a fork; it only rules out treating deletion as a small hardening patch.

## Ownership boundary

| Concern | Current owner | Long-term destination |
|---|---|---|
| request schema, supported modes/capabilities, authorization gates | wrapper | wrapper |
| prompt templates and epistemic-rigor profiles | wrapper | wrapper |
| job/turn/conversation/artifact receipts and ambiguity/retry rules | wrapper | wrapper |
| exact OpenCLI identity and accepted source pins | wrapper | wrapper |
| generic ChatGPT UI discovery, selection, extraction, and download helpers | temporary compatibility overlay where qualified | upstream OpenCLI, or an internal fork only after re-evaluation |
| Browser Bridge transport and typed page/download primitives | OpenCLI | upstream OpenCLI; fork only if a required public-contract change cannot land |
| provider account, connector authorization, and live-operation approval | owner | owner |

The wrapper remains stable if the backend route changes. A fork or alternate
controller must implement the wrapper protocol; it must not make OpenCLI's raw
browser surface the Codex-facing product API.

## Current compatibility inventory

All current overlays are implemented in
`src/opencli-transport.js::withPatchedOpenCli()`. That function verifies the
installed executable first, copies the package into a private temporary
workspace, replaces exact source only in the copy, runs the bounded command,
and removes the workspace. It never mutates `.runtime/opencli` or the installed
package.

| Family | Exact production seam | Purpose | Evidence and present limit |
|---|---|---|---|
| Markdown fidelity | `patchOpenCliMarkdownSource()` over `clis/chatgpt/utils.js` | enable GFM tables and preserve readable claim IDs during assistant-message conversion | deterministic compatibility/fidelity tests and the closed #4 Standard observation; fails closed as `ERR_OPENCLI_MARKDOWN_COMPAT` on source drift |
| Web/Deep tool activation | `patchOpenCliToolSelectorSource()` over the same file | exact visible option matching, fresh targets, bounded polling, native/DOM fallback, and selected-chip verification | deterministic selector/state-machine suite and the closed #2 forced-Web observation; live Deep qualification remains open in #3 |
| Deep result extraction | `patchOpenCliDeepResearchResultSource()` over the same file | bind conversation/network payload extraction to the expected conversation and preserve current fallback behavior | deterministic extractor, identity, deadline, and cleanup tests; completed live Deep extraction remains open in #16 |

This is three independent compatibility families and one shared temporary-copy
mechanism. The selector replacement is a substantial state machine, not a
one-line shim. Its size and review history are why this architecture review is
required even though the installed package remains untouched.

No compatibility code currently implements model/effort selection,
conversation attachments, assistant-generated artifact enumeration, or
connector activation:

- model/effort has an existing OpenCLI command and needs an atomic wrapper
  transaction before any source change is justified;
- conversation files have an existing Bridge file-input primitive but no
  typed ChatGPT ask contract;
- result artifacts have an existing Bridge `Page.waitForDownload()` primitive
  but no assistant-turn-scoped enumeration contract;
- connectors have an observed plus-menu row and a promising chip-preserving
  send seam, but still require a zero-submit selected-state probe.

## Current upstream observation

OpenCLI released `v1.8.8` on 2026-08-30. GitHub reports current `main` at the
same release source. The Git blob identities for both
`clis/chatgpt/utils.js` and `clis/chatgpt/ask.js` are byte-identical across
`v1.8.7`, `v1.8.8`, and current `main`:

```text
utils.js  ab19a98463deaa01cec9d68e904de51610015098
ask.js    7d615f3b5993ddaac0ea895fc0e100d27f35d401
```

This means the current overlays have not yet encountered a ChatGPT-adapter
port conflict in the first release after the installed pin. It does not qualify
the full v1.8.8 package, daemon, or extension and does not authorize installing
or selecting it. It also does not count as two releases of upstream inaction
after a concrete upstream issue or pull request; no such contribution is part
of this decision slice.

## Patch budget and re-evaluation gates

The existing three families are the measured baseline, not a precedent for
unbounded inline replacement. Pause new capability implementation and reopen
this decision when **any** of these gates is crossed:

1. **Fourth-family gate:** a feature proposes another independent long-lived
   exact-source replacement rather than extending one of the three current
   contracts.
2. **Boundary gate:** correct behavior requires changing the Browser Bridge,
   daemon, extension, or another OpenCLI public contract instead of only the
   ChatGPT adapter seam.
3. **Port-divergence gate:** an existing overlay cannot move to a newer release
   by updating exact pins and passing the same contract tests, and instead
   needs a second release-specific implementation.
4. **Upstream-persistence gate:** after a focused upstream issue or pull
   request is filed, the required generic capability remains unusable through
   two consecutive upstream releases.
5. **Distribution gate:** two or more independent consumers need a versioned,
   installable OpenCLI API rather than this wrapper's private temporary copy.
6. **Verification gate:** the requested state cannot be atomically established
   and verified before submission through typed ChatGPT/Bridge primitives.
7. **Authority gate:** the only working path requires raw auth-bearing fetches,
   account-state inspection, generalized browser scripting, or another
   expansion outside the approved product boundary.
8. **Requalification gate:** ordinary upstream upgrades repeatedly require
   re-running unrelated live capability qualifications rather than focused
   qualification of the changed seam.

A gate crossing freezes additional compatibility growth; it does not select a
fork. Preserve the wrapper, tests, receipts, live evidence, and patch inventory,
then write a short comparison against the three routes below.

## Route comparison after a gate crossing

| Route | Prefer when | Reject or defer when |
|---|---|---|
| released OpenCLI + temporary overlays | changes remain ChatGPT-local, fail-closed, mechanically portable, and used only by this wrapper | a new family, cross-layer change, release-specific branch, or distributable API is required |
| maintained internal OpenCLI fork + upstream path | several coherent ChatGPT changes need source-level integration, release packaging, shared use, or a stable exported API and upstream timing is inadequate | the fork merely moves one UI selector, has no release owner, or cannot keep a small auditable patch queue |
| alternate browser/controller boundary | OpenCLI's transport/public primitives cannot establish the required invariant or force prohibited authority/ambiguity | working OpenCLI primitives remain usable and the rewrite would duplicate leases, downloads, recovery, and ambiguity handling |

The comparison must record patch files and semantic families, upstream issue/PR
state, releases observed, deterministic and live requalification cost,
distribution consumers, migration/rollback cost, and an accountable release
owner. It may choose to remain on the current route.

## Upgrade path for released OpenCLI

For each candidate release:

1. record tag, source SHA, package/tarball identity, extension/Bridge identity,
   lifecycle scripts, and release notes before installation;
2. diff the exact ChatGPT adapter plus every Bridge/daemon/extension seam used
   by the wrapper;
3. apply each compatibility family independently against the candidate source;
   any missing or multiply matching anchor is a typed offline failure;
4. run the complete deterministic wrapper suite, authority/requirement/syntax
   checks, package dry-run, compatibility cleanup checks, and repeated focused
   tests for changed seams;
5. propose only the smallest approval-gated live requalification whose
   observable contract could have changed; never infer a reliability estimate
   from one turn;
6. update the executable/source pins and patch inventory atomically only after
   the candidate passes its approved gates;
7. retain the previous installed release and wrapper pin as the rollback target
   until the new baseline is accepted.

An unchanged `utils.js`/`ask.js` blob is useful source evidence but is not by
itself a full upgrade qualification.

## Fork operating contract, if later selected

A maintained fork would require a separate owner decision and implementation
milestone. Its minimum contract is:

- a dedicated repository and package identity preserving Apache-2.0 notices;
- one documented upstream base SHA and a small semantic patch queue;
- generic ChatGPT changes separated from wrapper-only receipts/policy;
- deterministic upstream-merge and patch-inventory checks;
- reproducible package and Bridge/extension artifacts with recorded digests;
- an upstream issue/PR link for each generally useful patch where contribution
  is practical;
- a named release/upgrade owner and a rollback to the last qualified release;
- no silent widening of the Codex-facing protocol or provider authority.

Forking must not discard the wrapper or rewrite completed evidence. It changes
the backend distribution and source-ownership boundary only.

## Present disposition

- The cumulative patch surface triggered and completed this architecture
  review.
- The selected route remains released OpenCLI behind the wrapper, with the
  existing three temporary exact-source overlay families.
- Do not add a fourth family without reopening this decision. Prefer extending
  an existing coherent family only when its contract and requalification
  surface remain the same.
- Prepare small upstream contributions for generic Markdown, selector, and
  extraction improvements when implementation priority permits; do not bundle
  wrapper policy or receipts into those contributions.
- Reconsider an internal fork before implementing any M007 capability whose
  probe shows that it crosses a gate above.
- No current evidence justifies an alternate controller.
