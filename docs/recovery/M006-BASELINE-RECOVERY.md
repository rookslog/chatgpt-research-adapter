# M006 Baseline Recovery

Status: **RECOVERED — exact local baseline available**

Date: 2026-08-26

Publication branch: `m006/baseline-recovery`

Pull request: `#6`

## Source authority

The adapter was not missing. It existed as the uncommitted working tree at:

```text
/Users/rookslog/Development/chatgpt-research-adapter
```

The original repository had an unborn local `main` and no commits. Commit and
push authority had not been granted when M006 and issues #1–#5 were created, so
GitHub was intentionally code-empty even though the local M002–M005
implementation existed.

Codex's local Git object database also retained the complete source/docs/test
snapshot as tree:

```text
d7c0014bdd99c0b9e078015aa5f12922367803ff
```

Every blob in that tree was compared with the corresponding working-tree file
before publication; all matched exactly. The imported implementation and test
files are therefore the recovered baseline, not a reconstruction from issue
text.

## Recovered implementation

The baseline includes:

- executable `bin/chatgpt-research.js` and Node ESM modules under `src/`;
- typed `standard | web | deep | image` preparation and
  `standard | web | deep` direct execution;
- OpenCLI 1.8.7 identity preflight and mode-aware invocation;
- versioned prompt template and epistemic-rigor profile compilation;
- write-once prepared-job and dispatch receipts;
- standard/web full-message extraction and deep-report collection;
- deterministic tests and the golden UTF-8 prompt fixture;
- M001–M006 plans, evaluation, live receipts, and project boundary records.

See `docs/recovery/M006-BASELINE-MANIFEST.md` for exact paths, symbols, pins,
commands, and surviving runtime evidence.

## Verification before publication

Fresh checks on 2026-08-26:

```text
npm test
  82 passed, 0 failed, 0 skipped

npm run check:authority
  M002_AUTHORITY_OK; violations: []

node --check over bin/*.js scripts/*.js src/*.js test/*.js
  all files exited zero
```

These are deterministic source-level checks. No provider request or new live
smoke was performed during baseline publication.

## Publication boundary

This PR imports the pre-existing baseline and updates recovery/handoff
documentation. It intentionally contains no selector, Markdown-converter, or
rigor-conformance feature fix.

The recovered source and tests total 2,223 lines. The owner authorized
publishing the complete intact baseline so the ChatGPT/GitHub-connector
experiment can operate on the real repository. This one-time provenance import
is recorded as an exception to the later feature-PR line budget; all M006
feature PRs remain subject to the soft 800 / hard 1,200 changed implementation
and test line limits.
