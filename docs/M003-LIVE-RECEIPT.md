# M003 — Installation and Live-Smoke Receipt

- Status: terminal `ambiguous_effect`; one live wrapper attempt completed without retry
- Date: 2026-08-24
- Commit authority: not granted

## Authorized operation

`[OWNER DECISION — 2026-08-24]` Inspect and install exactly `@jackwener/opencli@1.8.7`, load its matching Browser Bridge only in a new temporary ChatGPT-only Chrome profile, allow manual owner sign-in, and run exactly one wrapper prompt: `Reply with exactly CHATGPT_RESEARCH_LIVE_SMOKE_OK`.

The owner's acceptance of unresolved contract/account risk is recorded in `M003-DESIGN.md`. It is not a legal-compliance finding or permission for mass extraction, general browser automation, additional turns, retries, attachments, other modes, or normal-profile access.

## Offline prerequisite receipt

`[ROOT VERIFICATION — 2026-08-24]`

- `npm test`: 60 passed, 0 failed, 0 skipped.
- Ten independent `node --test --test-reporter=dot` runs: all exited zero with 60 tests represented per run.
- `node --check`: 23/23 JavaScript source/bin/checker/test files passed.
- `node scripts/m002-authority-check.js`: `M002_AUTHORITY_OK`, no violations.
- `npm pack --dry-run --json --ignore-scripts --cache /private/tmp/chatgpt-research-m003-pack-cache`: 18 declared distributable files, no bundled dependency.
- `git diff --check`: passed; repository still has no `HEAD` commit and all project files remain untracked on `main`.

The deterministic gate validates local fake-executable behavior only. No OpenCLI package, extension, account, browser, or provider was used for those checks.

`[POST-PREFLIGHT TDD VERIFICATION — 2026-08-24]` The `OPENCLI_CONFIG_DIR` environment correction added one deterministic test. The fresh full suite passed 61/61, `src/opencli-transport.js` passed syntax checking, and the exact-source authority checker returned `M002_AUTHORITY_OK`.

## Published package inspection

`[ROOT VERIFICATION — 2026-08-24]`

- Inspected exactly `@jackwener/opencli@1.8.7` from the npm registry. The package reports Node.js `>=20`, bin target `dist/src/main.js`, git head `87b60a36590c3e2a466c37266c3348d73d7f68fe`, integrity `sha512-2M+oPc70R1jNGzKzNrsm3fN4/gdvxCKlla7s9eaaTjkDjlzHpoZFN1YdV01A185kwCTN/ChOg+rbO4epO73c3w==`, and shasum `1935c9c20fe208745a7e203386195cc0f3520ebb`.
- The downloaded npm tarball contained 2,340 files with an unpacked size of 13,956,624 bytes. Its local SHA-256 is `de016839c48e6b3f64a629e7fa715de6f483b31c071c4309f2c55e4a18c48af4`.
- Lifecycle inspection found `postinstall` (`node scripts/postinstall.js || true; node scripts/fetch-adapters.js || true`), `preuninstall`, and development/publication scripts. Installation therefore used `--ignore-scripts`.
- The official v1.8.7 GitHub release points to signed commit `87b60a3`. Its Browser Bridge asset is `opencli-extension-v1.0.23.zip`; the GitHub-reported and local SHA-256 values both equal `e3399db1e9dd626519a8719d638d3c3813494d1f030c1e96799e05ebe7ba5340`.
- The extracted Manifest V3 extension identifies itself as OpenCLI version 1.0.23. It requests `debugger`, `tabs`, `cookies`, `activeTab`, `alarms`, `storage`, `tabGroups`, and `downloads`, plus `<all_urls>` host access. Its declared CLI compatibility is `>=1.7.0`.

## Isolated installation and preflight

`[ROOT VERIFICATION — 2026-08-24]`

- Temporary root: `/private/tmp/chatgpt-research-m003.KcUIM5`.
- Installed with lifecycle scripts disabled into the temporary prefix. The exact executable is `/private/tmp/chatgpt-research-m003.KcUIM5/install/node_modules/.bin/opencli`; its resolved target is `dist/src/main.js`, SHA-256 `246004200e381e5aecdfaef13e904953c0d18e0600ca66d02b956c4b1820ec02`, size 8,275 bytes, and reported version `1.8.7`. The wrapper's exact executable preflight accepted this identity.
- The installed `chatgpt ask` adapter SHA-256 is `6d61e004025728122aaf39daeb9490888d26d38fd34eb104fa5f14baa7b4602c`; the isolated install lockfile SHA-256 is `0f4bbbbae21b71089fc05be98d20661f3bf1db081abb5f76d90022863c9f4674`.
- The verified extension was unpacked beneath the temporary root. Branded Google Chrome 151.0.7922.170 was launched with user-data directory `/private/tmp/chatgpt-research-m003.KcUIM5/chrome-profile-2`, `--disable-extensions-except`, and `--load-extension`. Chrome accepted the arguments but did not load an extension worker for the temporary process. This agrees with [Chrome's documented removal of `--load-extension` from branded builds starting in version 137](https://developer.chrome.com/blog/extension-news-june-2025); Chrome for Testing and Chromium retain the development mechanism.
- The owner intentionally used Chrome sign-in and confirmed that bookmarks were expected. Subsequent process/profile evidence showed that the visible signed-in ChatGPT window and toolbar extensions were associated with the separately running normal Chrome surface, while the temporary profile had no persisted extension settings and no extension process. The isolated-profile ChatGPT sign-in and Browser Bridge attachment are therefore not established. No credential, cookie, storage value, or conversation content was exported or retained in this receipt.
- `doctor --help` was attempted with `OPENCLI_CONFIG_DIR` pointing at the temporary root. OpenCLI stopped before parsing the command with `EPERM: mkdir '/Users/rookslog/.opencli/clis'`; no daemon or provider request started.
- Source inspection establishes that v1.8.7 hard-codes `USER_OPENCLI_DIR = path.join(os.homedir(), '.opencli')`. Full startup unconditionally calls `ensureUserCliCompatShims()` and `ensureUserAdapters()`, which can create or replace `~/.opencli/package.json`, `~/.opencli/clis`, and `~/.opencli/node_modules/@jackwener/opencli`. The background update checker separately hard-codes `~/.opencli/update-check.json`; `OPENCLI_CONFIG_DIR` does not redirect these paths.
- The pre-existing user directory contains one observed file, `update-check.json` (72 bytes, mtime `2026-08-23T16:43:33Z`, SHA-256 `56fc263c8188020366a1f1e2cfbc43f50713b4b107e66ac734edb0988c405087`). It was not modified by the blocked command.
- `[OWNER DECISION — 2026-08-24]` The owner authorized one bounded use of the pre-existing OpenCLI user runtime with a byte-for-byte backup/manifest and surgical restoration. The existing cache was backed up with the same SHA-256. OpenCLI then created only the predicted `package.json`, `clis/`, and `node_modules/@jackwener/opencli` symlink tree.
- With `OPENCLI_CONFIG_DIR` still targeting the temporary root, `doctor --verbose` reported OpenCLI daemon v1.8.7 running on port 19825, but Browser Bridge missing and connectivity failed. No `chatgpt status`, wrapper intent, or provider request followed.
- Preflight also found that the wrapper's minimal child environment omitted `OPENCLI_CONFIG_DIR`. A RED test demonstrated the omission; `src/opencli-transport.js` now passes that one additional allowlisted key while excluding unrelated values. The focused test passed twice and the exact-source authority check remained green. This correction keeps OpenCLI profile/daemon config in the selected temporary root; it does not redirect OpenCLI's separate hard-coded user runtime.
- The daemon and temporary Chrome process were stopped. The created user-runtime entries were moved into the temporary backup area, leaving `~/.opencli` with only the original 72-byte `update-check.json`; its SHA-256 still matches the pre-run/backup value. The approved user-runtime issue is therefore resolved for this attempt. The remaining falsifier is how to load the verified unpacked bridge without installing it in the owner's normal Chrome profile.
- `[OWNER DECISION — 2026-08-24]` The owner selected a temporary official Chrome for Testing build rather than persistent normal-profile bridge installation. Chrome for Testing 151.0.7922.174 for mac-arm64 was downloaded from Google's published availability endpoint. The ZIP is 187,590,367 bytes with SHA-256 `7897e8c7241500f67f99ddf0ddf86bd173a606f45bb2fc16ea8b3513f149a38b`; its executable reports the expected version and has SHA-256 `df6a0a094280be49db8a2cc1d3fd9d75bccfc61d5fdbf9928ead4bb5dcb91ba9`.
- The Chrome for Testing app carries an ad-hoc linker signature without sealed resources; strict deep `codesign` verification therefore failed with `code has no resources but signature indicates they must be present`. This is recorded as a packaging characteristic/risk, not misrepresented as production-app signature verification. The binary came from the official Google HTTPS asset selected by the owner.
- The verified Browser Bridge loaded in a new Chrome for Testing user-data directory. A process check observed its extension worker. After one local-only delayed doctor recheck, the preflight was fully green: daemon v1.8.7, extension v1.0.23, context `6hfwpnpj`, immediate connectivity, and `chatgpt status` equal to `Connected`, login `Yes`, URL `https://chatgpt.com/`.

## One live wrapper result

`[LIVE WRAPPER RECEIPT — 2026-08-24]`

- Prepared exactly one default-`standard` job for question `Reply with exactly CHATGPT_RESEARCH_LIVE_SMOKE_OK`: job `job_db66eb2b6320410b9bde8bd7bd5144c3`, turn `turn_f11280c445b349ff82417901b14e3353`, prompt SHA-256 `014dd213b0b361ed7d71893316e046d1c2ff0280851758573ec14e69ccdf5988`.
- Invoked `chatgpt-research submit-once` exactly once against the verified executable with `OPENCLI_CONFIG_DIR` set to the temporary root. Intent was durably recorded at `2026-08-24T16:51:05.110Z`; its SHA-256 is `59a90b5c837f7908604b868a281fee30bcb89e7b576c2329569c856e2b677ab5`.
- The child produced no accepted answer before termination near the fixed deadline. At `2026-08-24T16:53:19.402Z`, the wrapper durably recorded schema `m003.dispatch-result.v1`, status `ambiguous_effect`, process disposition `ERR_OPENCLI_EXIT`, remote effect `unknown`, and retry decision `prohibited`. Result SHA-256 is `6b42e9e30c5cd66c2aa4b6a1d17adb75b23e8203edd1dd872a3349217454b4a5`.
- No `answer.md`, conversation ID, or conversation URL exists. The result's intent hash matches the durable intent, and the prompt hash matches the prepared prompt. No second provider turn, direct `opencli chatgpt ask`, or manual composer submission occurred. Desktop accessibility inspection exposed sidebar titles from signed-in browser surfaces, but no conversation was opened, read, or used to infer the remote effect.
- The exact OpenCLI root cause is not established. The elapsed timing is consistent with the configured deadline, but the wrapper intentionally persisted only the error class and stderr hash, not the bounded stderr text. A second ask to reproduce or recover details is prohibited. This observability gap must be resolved offline before any separately authorized future live attempt.

## Cleanup

The OpenCLI daemon and Chrome for Testing process were stopped after the terminal result. A narrowly filtered process check found no remaining process using the M003 temporary root. The extension handshake had changed the pre-existing update cache, so the recorded 72-byte backup was restored byte-for-byte with its original mode, mtime, and SHA-256; every M003-created entry under `~/.opencli` was removed. The entire resolved M003 temporary root was then deleted, including isolated OpenCLI/npm state, extension, browser profiles, Chrome for Testing binary/archive, backups, and smoke content/receipts. Those temporary files are not recoverable; their minimal hashes/status evidence remains in this document. No bridge was installed in the normal profile; its inspected tab was returned to ChatGPT. Fresh post-cleanup tests passed 61/61, the authority gate returned `M002_AUTHORITY_OK`, and the package dry-run contained 18 declared files with no bundled dependency.

## Subsequent milestone

`[FOLLOW-ON — 2026-08-24]` This receipt remains the historical result of M003.
The owner later approved M004, persistent normal-Chrome installation, and
additional live operation. M004 identified the old wait path as the practical
failure, completed a standard prompt through a submit-then-detail sequence, and
saved the exact response. Current status and evidence are recorded in
`M004-PLAN.md`; they do not rewrite or retry the terminal M003 attempt.
