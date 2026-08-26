# M006 Markdown Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change and superpowers:verification-before-completion before any success claim. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make standard/web answer collection preserve GFM tables and readable claim IDs without changing full-message extraction, submission, selectors, or the installed OpenCLI package.

**Architecture:** The recovered wrapper receives Markdown only after pinned OpenCLI 1.8.7 has converted ChatGPT message HTML, so table structure cannot be repaired safely after `runOpenCliDetail()` returns. For detail reads only, create a unique temporary sibling copy of the exact preflighted OpenCLI package, patch the copied `clis/chatgpt/utils.js` converter to enable OpenCLI's already-shipped `turndown-plugin-gfm` and narrowly de-escape generated claim IDs, execute the unchanged `chatgpt detail` argv through that copy, then remove the copy in `finally`. The installed runtime, user adapter directory, ask/submission path, completed-assistant selection, and response persistence remain unchanged.

**Tech Stack:** Node.js >=22 ESM; Node built-ins only in the wrapper; pinned `@jackwener/opencli@1.8.7`; OpenCLI's existing `turndown-plugin-gfm@1.0.2` runtime dependency; `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-26-m006-production-usability-design.md`

## Global Constraints

- Issue: #4 only.
- Preserve the existing full-message extraction boundary and exactly-once submission behavior.
- Do not change Web Search or Deep Research selectors.
- Add no wrapper dependency.
- Do not modify the installed OpenCLI package or `~/.opencli` user adapters.
- Claim-ID de-escaping is limited to generated IDs of the forms `[C1]` and `[C-001]`; unrelated escaped bracket text remains escaped.
- Soft PR limit: under 800 changed implementation + test lines; hard limit: under 1,200.
- No live ChatGPT/provider/browser operation is authorized in this slice.

---

### Task 1: Reproduce the conversion defect with one composite deterministic fixture

**Files:**
- Create: `test/fixtures/chatgpt-markdown.html`
- Create: `test/fixtures/chatgpt-markdown.gfm.md`
- Modify: `test/opencli-transport.test.js`

**Interfaces:**
- Consumes: existing `preflightOpenCli()` and `runOpenCliDetail()`.
- Produces: one failing integration-style transport test whose fake pinned OpenCLI package emulates the converter seam before and after GFM activation.

- [ ] Add a composite assistant-message HTML fixture containing a table, `[C-001]`, ordinary non-claim bracket text, a list, a link, and a fenced-code source block.
- [ ] Add the exact expected Markdown fixture with a valid GFM table, readable `[C-001]`, the unrelated bracket text still escaped, preserved list/link syntax, and fenced code.
- [ ] Add a fake OpenCLI package helper under the test temp directory. Its packaged ChatGPT converter has the exact pinned import/function anchors; its fake `htmlToMarkdown` returns linearized/escaped output unless the configuration callback enables a fake `gfm` plugin.
- [ ] Add a test that preflights the fake v1.8.7 executable, runs `runOpenCliDetail()`, and expects the complete GFM fixture.
- [ ] Run the focused test and confirm it FAILS because the current wrapper executes the unpatched converter and returns linearized/escaped Markdown.

### Task 2: Patch only the temporary detail-reader package

**Files:**
- Modify: `src/opencli-transport.js`
- Modify: `package.json` only to refresh the existing authority SHA-256 pin for `src/opencli-transport.js`

**Interfaces:**
- Consumes: the already-preflighted OpenCLI `identity.real_path` and the pinned converter source anchors.
- Produces: temporary executable path used only by `runOpenCliDetail()`; original OpenCLI executable and source remain unchanged.

- [ ] Add exact constants for the pinned OpenCLI Markdown import/function source and the patched replacement.
- [ ] Add a small source transformer that fails with `ERR_OPENCLI_MARKDOWN_COMPAT` unless each pinned source anchor occurs exactly once.
- [ ] Add a temporary-package helper that derives the package root from `<package>/dist/src/main.js`, copies the package to a unique sibling directory, patches only the copied `clis/chatgpt/utils.js`, verifies the copied executable bytes still match the preflight identity hash/size, invokes a callback with that copied executable, and removes the copy in `finally`.
- [ ] Change only `runOpenCliDetail()` to execute its existing argv through the temporary Markdown-compatible copy. Do not change `runOpenCliAsk()`, `runOpenCliDeepResearchResult()`, row selection, wait/stability options, or persistence.
- [ ] Run the focused test and confirm PASS.
- [ ] Refresh the authority digest for `src/opencli-transport.js` in `package.json`.

### Task 3: Fail closed on converter-source drift

**Files:**
- Modify: `test/opencli-transport.test.js`

**Interfaces:**
- Consumes: the temporary-package compatibility helper through `runOpenCliDetail()`.
- Produces: deterministic evidence that a changed/unrecognized OpenCLI converter is not silently patched.

- [ ] Write a failing test whose fake OpenCLI package changes the pinned converter function anchor.
- [ ] Run it and confirm the current implementation does not yet surface the required typed compatibility error if that behavior is missing.
- [ ] Make the minimum correction needed for `ERR_OPENCLI_MARKDOWN_COMPAT` before any copied OpenCLI process executes.
- [ ] Re-run the focused tests and confirm PASS.

### Task 4: Verification and review PR

**Files:**
- No new production behavior.

- [ ] Run focused transport tests.
- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run check:authority` and require `M002_AUTHORITY_OK`.
- [ ] Run `node --check` for every JavaScript file under `bin/`, `scripts/`, `src/`, and `test/`.
- [ ] Run `git diff --check` against PR #6 head.
- [ ] Count additions + deletions for implementation and tests/fixtures; require <1,200 and report whether <800.
- [ ] Open a review PR from `m006/issue-4-markdown-fidelity` with base `m006/baseline-recovery`, link it to #4 without closing the issue, and explicitly state that the live standard-mode acceptance check is deferred because the owner did not authorize a live provider/browser operation in this slice.
