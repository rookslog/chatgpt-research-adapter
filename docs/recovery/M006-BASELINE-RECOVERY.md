# M006 Baseline Recovery

Status: **BLOCKED — source authority unavailable**  
Date: 2026-08-26

## Recovery target

Recover the actual working ChatGPT research-adapter source referred to by milestone M006 without recreating the wrapper from inference.

## Observed repository state

Before the Superpowers design/spec commits in this execution, `rookslog/chatgpt-research-adapter` had milestone issues but no committed source, branches, or implementation commits. The repository reported size `0`, and GitHub contents/commit inspection reported an empty repository.

The current repository now contains only the approved M006 design/planning artifacts added during this execution plus this recovery record; those artifacts are not the missing adapter implementation.

## Working-repo authority attempted

Primary authority: Bridgewright working-repo MCP.

Observed failures during this execution:

1. Earlier `bw_get_state` and `bw_list` attempts returned an MCP SSE probe HTTP 404 from the configured Bridgewright tunnel (`invalid_mcp_response`).
2. After the execution plan was committed and an isolated `m006/baseline-recovery` branch was created, the Bridgewright tool namespace could no longer be rediscovered among currently valid connector namespaces.

Therefore the working repository cannot currently be enumerated or read.

## Corroborating recovery searches

### GitHub

- No pre-existing branch in `rookslog/chatgpt-research-adapter` contained the adapter source.
- No pre-existing commit was available because the repository was empty.
- Searches of accessible user repositories did not locate committed files containing the adapter-specific protocol/profile identifiers.

### ChatGPT Library / prior context

Searches for the adapter, `chatgpt-research-epistemic/1.0.0`, `standard/1.0.0`, the selector failure strings, receipt terminology, and `FULL_MESSAGE_EXTRACTION_OK` did not surface a recoverable source package or exact local source path.

The available research packages identify OpenCLI and `rookslog/chatgpt-cli` as relevant prior art, but do not establish that either is the missing wrapper source.

## What is known but is not sufficient to recreate the baseline

Milestone issues establish that an existing wrapper had:

- standard, web, and deep modes;
- a pinned OpenCLI/browser dependency;
- prompt-profile behavior;
- job/turn/conversation/output receipts;
- full-message extraction behavior;
- observed Web Search and Deep Research selector failures;
- deterministic prompt/profile coverage for additional rigor variants.

These issue-level facts do **not** establish the wrapper's exact file layout, function/type names, dependency pin, test commands, receipt schema, or source contents.

## Consequence

Implementation PRs for issues #2–#5 must not be fabricated from issue descriptions or by copying upstream OpenCLI wholesale. Doing so would violate the approved M006 provenance gate and could silently replace the working adapter rather than repair it.

The source-level implementation phase is therefore blocked before PR 0 baseline import.

## Unblock condition

Any one of the following is sufficient if it exposes the **exact existing adapter source**:

- restore the Bridgewright working-repo connector;
- surface the local working tree through another connected source;
- provide/materialize the exact adapter source archive or directory that produced the M006 observations.

Once the source authority is available, resume at Task 1 of `docs/superpowers/plans/2026-08-26-m006-baseline-recovery.md`, enumerate the real tree, run its tests before modification, import it without refactoring, then generate exact no-placeholder plans for selector compatibility, Markdown fidelity, and production qualification.
