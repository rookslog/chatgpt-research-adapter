# M006 Recovered Baseline Manifest

## Provenance

- Local working tree: `/Users/rookslog/Development/chatgpt-research-adapter`
- Exact source/docs/test Git tree: `d7c0014bdd99c0b9e078015aa5f12922367803ff`
- Package: `chatgpt-research-adapter@0.0.0`, private, Node `>=22`
- Wrapper dependencies: none
- Deterministic test command: `npm test`
- Authority command: `npm run check:authority`
- Executable: `node ./bin/chatgpt-research.js`

## Component map

| Concern | Exact path | Symbols/contracts |
|---|---|---|
| Wrapper entrypoint | `bin/chatgpt-research.js` | calls `runCli()` |
| CLI | `src/cli.js` | `runCli()`, `formatCliError()` |
| One-command use | `src/direct-ask.js` | `directAsk()`, `submitDirectPreparedJob()` |
| Mode contract | `src/modes.js` | `MODES`, `resolveMode()` |
| OpenCLI transport | `src/opencli-transport.js` | `preflightOpenCli()`, `runOpenCliAsk()`, `runOpenCliDetail()`, `runOpenCliDeepResearchResult()` |
| Prompt compiler | `src/compiler.js` | `compilePrompt()` |
| Template loading | `src/template-registry.js` | `loadTemplate()` |
| Rigor profiles | `src/rigor-profile.js` | `loadRigorProfile()` |
| Prepare orchestration | `src/prepare.js` | `prepareResearchJob()` |
| Prepared receipts | `src/receipts.js` | `persistPreparedJob()`; schema `m002.prepared.v1` |
| Prepared validation | `src/prepared-bundle.js` | `loadPreparedBundle()` |
| Dispatch receipts | `src/dispatch-receipts.js` | `createDispatchIntent()`, `persistDispatchIntent()`, `persistCompletedResult()`, `persistAmbiguousResult()` |
| Exactly-once dispatch | `src/submit-once.js` | `submitPreparedJobOnce()` |
| Direct result | `src/direct-ask.js` | schema `m004.direct-result.v1`; `response/answer.md` or `response/report.md` |

## Prompt and rigor identities

- Template: `research-question@1.0.0`
- Protocol: `chatgpt-research-epistemic@1.0.0`
- Profiles:
  - `light@1.0.0`, SHA-256 `4009d3ea88234724e068dbdb3e857e1d35c6248850f627091252603155b0f0df`
  - `standard@1.0.0`, SHA-256 `3ac667a01fadbb23a139ab0f45adb70c996f79adc389ee8183c6c7daac29a031`
  - `strict@1.0.0`, SHA-256 `a598e8a9a4880b0b56a15bc4f787548405ebcba91e603e85e7320e8cc846fd3d`
- Citation levels: `principal | expanded`
- Audit appendix: Boolean flag

## OpenCLI identity used for M004/M005 observations

- Package: `@jackwener/opencli@1.8.7`
- Tag/commit: `v1.8.7` / `87b60a36590c3e2a466c37266c3348d73d7f68fe`
- NPM shasum: `1935c9c20fe208745a7e203386195cc0f3520ebb`
- Tarball SHA-256: `de016839c48e6b3f64a629e7fa715de6f483b31c071c4309f2c55e4a18c48af4`
- Installed `dist/src/main.js` SHA-256: `246004200e381e5aecdfaef13e904953c0d18e0600ca66d02b956c4b1820ec02`
- Wrapper command-contract SHA-256: `bc5b3ea166d903fc915948fc483760ff8fae95897d6dd9edcd9002b9a0c831c4`
- Browser Bridge: `1.0.23`; archive SHA-256 `e3399db1e9dd626519a8719d638d3c3813494d1f030c1e96799e05ebe7ba5340`

OpenCLI is a separately installed ignored runtime under `.runtime/opencli/`; it
is not bundled into this repository.

## Deterministic tests

The suite is under `test/`. Load-bearing coverage includes:

- `compiler.test.js` and `fixtures/golden-prompt.utf8`;
- `rigor-profile.test.js`;
- `modes.test.js` and `ask-cli.test.js`;
- `opencli-transport.test.js`;
- `receipts.test.js`, `prepared-bundle.test.js`, and
  `dispatch-receipts.test.js`;
- `direct-ask.test.js` and `submit-once.test.js`;
- `authority-check.test.js`.

The fresh publication gate passed 82/82 tests.

## Surviving local runtime evidence

Ignored `.runtime/` artifacts include:

- standard baseline job `job_8196b12a795b4f1b8dc2aa4d0bd372e3`;
- full-message extraction job `job_9cfc08b4d2964047a6aea91455d9ea1d`;
- standard rigor conformance job `job_20cd15aeedb14908ac2d8927e63d6c0f`;
- M006 connector job `job_f9710a3eb59f4f4a8a7f080e6231ba94`;
- failed Web Search preparations `job_c0442a51ec42449d90968ef074c8be41`
  and `job_d91e0036edfe47059bc08592e551dcf7`;
- failed Deep Research preparation `job_4c518a90d2354ba685a86a9541821294`.

These runtime artifacts remain local and intentionally uncommitted.
