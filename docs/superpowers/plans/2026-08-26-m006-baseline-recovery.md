# M006 Baseline Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the actual working ChatGPT research-adapter source and its reproducible test/dependency state into `rookslog/chatgpt-research-adapter` without recreating or refactoring it from inference.

**Architecture:** Treat source recovery as a provenance-preserving import, not feature development. The Bridgewright working-repo surface is the first authority for the uncommitted implementation; GitHub and the ChatGPT Library are corroborating discovery surfaces only. If the working-repo surface remains unavailable, record an explicit blocked recovery result instead of manufacturing a new adapter, because PRs 1–3 depend on exact existing paths, contracts, and tests.

**Tech Stack:** GitHub repository/Contents API; Bridgewright working-repo MCP (`bw_list`, `bw_read_file`, `bw_run_tests`, `bw_get_state`); git/GitHub commit history; existing adapter stack as recovered, never guessed.

**Spec:** `docs/superpowers/specs/2026-08-26-m006-production-usability-design.md`

## Global Constraints

- Soft requirement: under 800 changed implementation + test lines per PR, counted as additions plus deletions.
- Hard constraint: under 1,200 changed implementation + test lines per PR.
- Do not refactor while importing the baseline.
- Do not silently replace missing source with a newly invented wrapper.
- Preserve existing standard-mode behavior, typed `standard | web | deep` exclusivity, receipt semantics, and exactly-once submission expectations as observed in the recovered implementation.
- Do not expose arbitrary browser scripting or authenticated request forwarding.

---

### Task 1: Establish the recovery authority and working-tree inventory

**Files:**
- Create on successful or blocked completion: `docs/recovery/M006-BASELINE-RECOVERY.md`

**Interfaces:**
- Consumes: Bridgewright working-repo connector operations `bw_get_state()` and `bw_list()`.
- Produces: an authoritative inventory of the existing working repository, or a citable blocked-recovery record if the connector cannot expose it.

- [ ] **Step 1: Read the Bridgewright loop state**

Invoke `bw_get_state()`.

Expected successful shape: current repository/test/proposal state sufficient to identify the working repository.  
Current known failure to recognize explicitly: MCP SSE probe HTTP 404 from the Bridgewright tunnel.

- [ ] **Step 2: Enumerate the working repository**

Invoke `bw_list()`.

Expected: repo-relative file inventory. Do not infer omitted files from issue text.

- [ ] **Step 3: Classify the result**

If both calls succeed, identify every file belonging to:

```text
runtime / wrapper entrypoints
dependency or pin metadata
prompt-profile compilation
standard | web | deep mode selection
output extraction / Markdown conversion
job / turn / conversation / output receipts
tests / fixtures
README / run instructions
```

If the connector instead returns the known transport 404, write `docs/recovery/M006-BASELINE-RECOVERY.md` with exactly these substantive fields:

```markdown
# M006 Baseline Recovery

Status: BLOCKED — source authority unavailable
Date: 2026-08-26
GitHub baseline: repository contained only M006 issues before the Superpowers design/spec commits
Working-repo authority attempted: Bridgewright MCP
Observed failure: MCP SSE probe returned HTTP 404 from the configured tunnel
GitHub search result: no pre-existing branch or commit containing the adapter implementation
Library/personal-context search result: no recoverable adapter source path or package located
Consequence: implementation PRs #2–#5 must not be fabricated from issue descriptions
Unblock condition: restore the Bridgewright working-repo connector or otherwise surface the exact existing adapter source/package
```

- [ ] **Step 4: Commit the recovery record**

On a successful inventory, the record must list exact recovered source paths and the authority used for each. On a blocked inventory, commit the blocked record above unchanged except for adding raw connector error details if useful.

Commit message:

```bash
git commit -m "docs: record M006 baseline recovery state"
```

**Verification:** The recovery record must contain no guessed implementation path, dependency version, test command, or schema field.

---

### Task 2: Read and fingerprint the recovered baseline

**Files:**
- Modify: `docs/recovery/M006-BASELINE-RECOVERY.md`
- Create only after successful Task 1: `docs/recovery/M006-BASELINE-MANIFEST.md`

**Interfaces:**
- Consumes: exact repo-relative paths from `bw_list()`.
- Produces: content fingerprints and a component map used to import the baseline and author the later implementation plans.

- [ ] **Step 1: Read every mapped baseline file**

For each path classified in Task 1, invoke `bw_read_file({path})` exactly once unless the connector indicates the result was truncated.

- [ ] **Step 2: Record implementation contracts without changing them**

In `docs/recovery/M006-BASELINE-MANIFEST.md`, record the exact discovered names/signatures/commands for:

```text
adapter entrypoint
mode type / enum / validation
OpenCLI or browser dependency and exact pin
prompt profile identifiers and versions
receipt types/fields
message extraction function
Markdown conversion function
focused test command
full test command
live-test command or harness, if present
```

Each entry must cite its repo-relative source path.

- [ ] **Step 3: Record source fingerprints**

For every baseline file to be imported, record:

```text
path
byte length if exposed
source revision/state identifier if exposed
whether file is implementation, test, fixture, config, or documentation
```

Do not normalize formatting.

- [ ] **Step 4: Commit the manifest**

```bash
git commit -m "docs: map recovered adapter baseline"
```

**Verification:** Every later plan reference to an adapter file/function must be traceable to this manifest.

---

### Task 3: Verify the recovered baseline before import

**Files:**
- Modify: `docs/recovery/M006-BASELINE-RECOVERY.md`

**Interfaces:**
- Consumes: recovered working repository.
- Produces: baseline pass/fail counts and raw test evidence before any source is migrated.

- [ ] **Step 1: Run the repository test suite in place**

Invoke `bw_run_tests()` before proposing or applying any patch.

- [ ] **Step 2: Record the exact result**

Append to the recovery record:

```markdown
## Pre-import verification

Command/surface: Bridgewright bw_run_tests
Passed: <returned pass count>
Failed: <returned fail count>
Raw result: <returned concise raw output>
```

Use the actual returned values; do not convert a failing baseline into a milestone regression.

- [ ] **Step 3: Classify baseline health**

A failing pre-import test is recorded as pre-existing. PR 0 may import that state only if the failure is unrelated to source-transfer corruption; feature repair belongs in later milestone PRs.

- [ ] **Step 4: Commit the verification record**

```bash
git commit -m "test: record recovered baseline verification"
```

---

### Task 4: Import the baseline without refactoring

**Files:**
- Create: every exact adapter implementation/test/config path listed in `docs/recovery/M006-BASELINE-MANIFEST.md`
- Modify: `docs/recovery/M006-BASELINE-RECOVERY.md`

**Interfaces:**
- Consumes: byte-for-byte or text-faithful contents read through `bw_read_file()`.
- Produces: committed GitHub baseline corresponding to the recovered working implementation.

- [ ] **Step 1: Partition the import by existing module boundaries**

Calculate additions + deletions for implementation and test files in each proposed import slice.

Rules:

```text
0–799 lines: preferred slice
800–1199 lines: permitted only if splitting would break an existing coherent module/test unit
>=1200 lines: prohibited; split before commit/PR
```

- [ ] **Step 2: Create the first import branch from `main`**

Branch naming convention:

```text
m006/baseline-01
```

Additional required slices use `m006/baseline-02`, `m006/baseline-03`, and so on.

- [ ] **Step 3: Copy the recovered files with no behavioral edits**

For each file in the slice, create the same repo-relative path with the exact content recovered in Task 2. Do not rename functions, update dependencies, reformat, or fix milestone issues in the import commit.

- [ ] **Step 4: Verify transferred content**

Compare every imported file against the Task 2 fingerprint/content record. Any mismatch is a transfer defect and must be fixed before feature work.

- [ ] **Step 5: Run the recovered focused/full tests**

Use the exact commands recorded in `docs/recovery/M006-BASELINE-MANIFEST.md`. Expected result: no new failures relative to Task 3.

- [ ] **Step 6: Enforce the PR-size gate**

Count additions plus deletions for implementation and tests. Expected: `< 1200`; preferred: `< 800`.

- [ ] **Step 7: Commit the import slice**

```bash
git commit -m "chore: recover ChatGPT research adapter baseline"
```

- [ ] **Step 8: Open the baseline PR**

PR description must state:

```text
Purpose: provenance-preserving recovery only
Behavioral changes: none intended
Source authority: Bridgewright working repository
Pre-import test result: <actual result>
Post-import test result: <actual result>
Implementation+test changed lines: <actual additions+deletions>
M006 dependency: prerequisite for issues #2–#5
```

Do not claim feature completion in PR 0.

---

### Task 5: Produce exact implementation plans for milestone PRs 1–3

**Files:**
- Create: `docs/superpowers/plans/2026-08-26-m006-tool-selection.md`
- Create: `docs/superpowers/plans/2026-08-26-m006-markdown-fidelity.md`
- Create: `docs/superpowers/plans/2026-08-26-m006-production-qualification.md`

**Interfaces:**
- Consumes: imported baseline plus `docs/recovery/M006-BASELINE-MANIFEST.md`.
- Produces: three no-placeholder Superpowers implementation plans with exact files, functions, tests, commands, and PR line budgets.

- [ ] **Step 1: Map #2/#3 to exact source and test paths**

Use the recovered mode-selection and dependency files. The plan must start from failing current-UI fixtures and prefer consuming a proven upstream-compatible selector before local forking.

- [ ] **Step 2: Map #4 to the exact extraction/conversion seam**

The plan must identify the actual message extraction and Markdown conversion functions and prove full-message extraction remains unchanged while GFM tables and visible claim IDs are preserved.

- [ ] **Step 3: Map #5 and live gates to the actual receipt/profile harness**

The plan must name the real expanded-citation and audit-appendix profile identifiers, receipt fields, live invocation commands, and storage path for qualification evidence.

- [ ] **Step 4: Apply the PR budget to each plan**

Each implementation plan must contain an expected source+test change budget below 800 lines and a split trigger before 1,200 lines.

- [ ] **Step 5: Commit the three plans**

```bash
git commit -m "docs: plan M006 implementation PRs"
```

**Verification:** No plan may contain `TBD`, `TODO`, guessed paths, guessed function names, guessed test commands, or guessed receipt/profile fields.

---

## Execution stop condition

If Task 1 cannot access the working-repo authority, execute the blocked-record branch of Task 1 and stop implementation. That is a valid, auditable execution result: it preserves the approved design's provenance gate and prevents an invented adapter from being mistaken for recovery of the existing working system.
