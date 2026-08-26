# M005 — Epistemic Rigor Profiles

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:test-driven-development` for production behavior and `superpowers:verification-before-completion` before any success claim. Track this plan with checkbox state. Do not commit.

- Status: complete; deterministic contract verified and one standard-mode conformance turn observed
- Date: 2026-08-25
- Closure target: an offline-verified prompt and receipt contract that makes ChatGPT research answers auditable by default
- Commit authority: not granted
- Live boundary: one bounded standard-mode conformance smoke may follow deterministic verification under the existing M004 local-live authorization; it must not exercise web/deep selectors, automate unrelated browser state, publish, or deploy

## Owner decision and design reference

`[OWNER DECISION — 2026-08-25]` Every research prompt should automatically apply epistemic quality and rigor standards. The default covers substantive factual, interpretive, and recommendation claims. Callers may request an expanded audit appendix or expanded citations and may select or supply a versioned rigor profile.

The owner supplied **Agentic Harness Research Constitution (AHR-C) v2.0** as an example of the desired distinctions, warrant discipline, optional audit appendix, and customization. `[OWNER CLARIFICATION — 2026-08-25]` It is not adopted or vendored by this adapter. M005 defines a smaller wrapper-owned `chatgpt-research-epistemic` protocol; a custom profile may independently align with AHR-C or another framework.

## Minimal contract

The existing `research-question` template remains the task template. A separate rigor profile is loaded and deterministically appended by the compiler so mode selection, task wording, and epistemic policy remain independent.

Built-in profiles:

- `light`: label only conclusions, important uncertainty, and recommendations; no claim ledger unless requested.
- `standard` (default): assign stable IDs to substantive factual, interpretive, synthesis, uncertainty, and recommendation claims and include a compact claim ledger.
- `strict`: assign IDs to every externally checkable or decision-relevant claim and require the expanded audit fields.

Request options:

```json
{
  "rigor_profile": "standard",
  "rigor_profile_version": "1.0.0",
  "citation_level": "principal",
  "audit_appendix": false,
  "rigor_profile_file": "/absolute/path/to/custom-profile.json"
}
```

`citation_level` is `principal` or `expanded`. Expanded citations require direct claim-attached citations and source-role descriptions, not an arbitrary citation count. `audit_appendix` adds source inventory, contrary evidence, coverage gaps, dependencies, scope conditions, and revision triggers.

A custom profile file uses the same closed schema as a built-in profile, requires an ID and semantic version, and is snapshotted by content hash. It may strengthen or restate the audit instructions but cannot change execution mode, OpenCLI arguments, transport behavior, or authorization.

Every compiled prompt and durable job/turn receipt records:

- wrapper rigor-protocol ID/version;
- rigor profile ID/version/content SHA-256;
- citation level;
- audit-appendix choice; and
- exact final prompt SHA-256.

## Output protocol

The compact runtime instructions require an answer-first report. Claims use these wrapper-owned statuses:

`direct-observation`, `externally-supported`, `user-premise`, `source-report`, `disputed`, `synthesis`, `inference`, `interpretation`, `speculation`, `recommendation`, and `unknown`.

The standard ledger fields are:

```text
ID | Claim | Status | Evidence | Warrant basis | Contrary evidence / limits | Revision trigger
```

`Warrant basis` is qualitative and explains directness, independence, recency, methodological quality, and fit. Numeric confidence is not requested unless a defensible calibration is supplied. The ledger records concise outcome-relevant rationale, not hidden reasoning.

The optional audit appendix adds evidence cutoff, source roles and dependencies, search/access limitations, unresolved contradictions, and unperformed checks. Expanded citations remain separate from AHR-C methodological citations.

## Implementation tasks

### Task 1 — Versioned profile loader and compiler seam

**Files:**
- Create: `rigor/registry.json`
- Create: `rigor/profiles/{light,standard,strict}/1.0.0.json`
- Create: `src/rigor-profile.js`
- Modify: `src/compiler.js`
- Test: `test/rigor-profile.test.js`, `test/compiler.test.js`, `test/fixtures/golden-prompt.utf8`

- [x] Write failing tests that require the default standard profile, exact compiled bytes, profile identity/hash, allowed option enums, and fail-closed handling for unknown versions, altered pins, malformed custom profiles, duplicate JSON keys, symlinks, controls, and oversize content.
- [x] Run the focused tests and confirm failure because the profile API and compiler arguments do not exist.
- [x] Implement the smallest loader and deterministic appendix compiler that satisfy those tests.
- [x] Run the focused tests and confirm they pass.

### Task 2 — Request, CLI, and receipt propagation

**Files:**
- Modify: `src/prepare.js`, `src/direct-ask.js`, `src/cli.js`
- Modify: `src/receipts.js`, `src/prepared-bundle.js`, `src/dispatch-receipts.js`
- Test: `test/prepare-cli.test.js`, `test/ask-cli.test.js`, `test/direct-ask.test.js`, `test/receipts.test.js`, `test/prepared-bundle.test.js`, `test/dispatch-receipts.test.js`

- [x] Write failing tests for default propagation, explicit built-in selection, expanded citations, audit appendix, custom absolute profile path, receipt identity, and rejection before dispatch of ambiguous or unsupported option combinations.
- [x] Run the focused tests and confirm the expected contract failures.
- [x] Implement the minimum request/CLI/receipt fields without changing provider transport behavior.
- [x] Run the focused tests and confirm they pass.

### Task 3 — Durable product documentation

**Files:**
- Modify: `README.md`, `docs/M001-PLAN.md`, `docs/M004-PLAN.md`, `package.json`

- [x] Document the default profile, customization flags, output ledger, and the distinction between deterministic prompt compilation and model conformance.
- [x] Propagate the decision back to M001's planned versioned-rubric seam and forward from M004's usable command.
- [x] Add `rigor/` to the package allowlist, then update the authority source pins for every deliberately modified executable source file.

### Task 4 — Verification and bounded conformance evidence

- [x] Run `npm test` and require zero failures.
- [x] Run `npm run check:authority` and require a green closed-world inventory.
- [x] Run `node --check` for every JavaScript file under `bin/`, `src/`, `scripts/`, and `test/`.
- [x] Run `npm pack --dry-run --json` and inspect the package file list for the profiles and absence of runtime/dependency material.
- [x] Inspect a prepared prompt and receipt to confirm byte/hash/profile agreement.
- [x] If all deterministic gates pass, run at most one standard-mode prompt asking for a small mixed-status answer and ledger; record observed conformance and limitations without treating one output as general reliability.

## Falsifiers and deferrals

Stop and return to the owner if useful customization requires arbitrary transport or browser authority, the compiled profile cannot be durably identified, or the profile overhead makes ordinary standard prompts impractical. A model failing to follow the ledger on one live turn is conformance evidence and may justify prompt refinement; it does not falsify deterministic compilation.

Automated semantic validation of the returned report, citation correctness checking, source retrieval, web/deep selector repair, attachments, remote service operation, deployment, publication, and commit remain outside this slice.

## Execution receipt

`[ROOT VERIFICATION — deterministic, 2026-08-25]` The final local suite executed 82 tests with zero failures. The closed authority inventory returned `M002_AUTHORITY_OK`; every JavaScript source/test passed `node --check`. The package dry run used a disposable `/tmp` npm cache because the owner's default npm cache contains root-owned entries; it listed 24 files, included all three profiles plus their registry, bundled no dependency, and measured 28,026 bytes packed / 106,331 bytes unpacked. A prepared-job probe recorded `standard/1.0.0`, profile SHA-256 `3ac667a01fadbb23a139ab0f45adb70c996f79adc389ee8183c6c7daac29a031`, a prompt hash equal to the durable receipt, and the claim-ledger instruction. The standard rubric adds 714 UTF-8 bytes to the golden prompt, below the enforced 800-byte budget.

`[ROOT FAILURE DIAGNOSIS — 2026-08-25]` The first live command was run inside the filesystem/network sandbox. It created only a prepared job (`transport_status: not_dispatched`, null conversation reference, no response directory) and the OpenCLI child returned `BROWSER_CONNECT`. A foreground daemon reproduction then returned `listen EPERM 127.0.0.1:19825`, establishing that the sandbox could not host the loopback daemon. An earlier inference that the existing listener itself was stale was therefore incomplete; PID 46850 was terminated on that inference. Root restored the exact v1.8.7 daemon outside the network sandbox and `opencli doctor --verbose` then reported daemon v1.8.7, Bridge v1.0.23, one connected profile, and immediate connectivity.

`[ROOT LIVE OBSERVATION — 2026-08-25]` One actual standard-mode conformance prompt then completed as job `job_20cd15aeedb14908ac2d8927e63d6c0f`, conversation `6a8e1e4f-7c94-83e9-bf9b-ed0493240e43`. The 217-word / 1,869-byte saved Markdown used four stable claim IDs, distinguished `user-premise`, `interpretation`, `recommendation`, and `direct-observation`, stated unchecked empirical evidence, and included all requested ledger concepts: evidence, qualitative warrant, contrary evidence/limits, and revision triggers. The upstream converter linearized the ledger table and escaped the visible claim-ID brackets, preserving content but not ideal GFM layout. Because the prompt intentionally required no external research, this turn does not establish citation correctness or expanded-citation conformance. One successful turn is evidence of conformance in this configuration, not general reliability.
