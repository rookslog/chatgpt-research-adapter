# Refusal-only command loading qualification

Status: completed **narrowed VM/source characterization**, not full native-runtime qualification. Assigned September 9 wave; local run September 8, 2026. Requested role Astra Medium; served identity unknown. This investigates the refusal-only command-loading step of [Standard submission #60](https://github.com/rookslog/chatgpt-research-adapter/issues/60), without completing its wider transaction contract.


## Finding and falsifiers

**Observed:** unchanged pinned OpenCLI 1.8.7 `main.js` loaded discovery, scanned an owned home, resolved the owned command's public registry export, registered `chatgpt/research-standard`, and reached that command once through actual Commander 14.0.3 and `executeCommand`. The normalized declaration remained `browser: true`, `access: write`, `siteSession: persistent`, `navigateBefore: false`. An actual runtime browser-session lifecycle surrounded a synthetic BrowserBridge.

The callback waited on an explicit fixture promise and then threw `ERR_STANDARD_DRIVER_UNQUALIFIED`. Main evaluation ended with no settled exit status. After release, the actual execution lifecycle closed the synthetic browser and called the synthetic lease-release boundary; actual Commander adapter code rendered the error and set exit code 1 exactly once. This is **observed action settlement**, not an inference from successful main import. The runner awaits the terminal status before temporary cleanup.

**Corroborated-for-this-decision:** the intended command metadata and refusal can compose through these source layers under the enumerated replacements. **Uncorroborated:** the native ESM/runtime chain with real startup networking, browser transport, installed adapter inventory and native effect interception. Production helper adoption remains parked until a concrete consumer and the required remaining qualification exist.

| Case in RUN.json | Owned callback | Other callback | Observed terminal result | Disconfirming purpose |
| --- | ---: | ---: | --- | --- |
| `refusal` | 1 | 0 | `ERR_STANDARD_DRIVER_UNQUALIFIED`, exit 1 | Wrong/no callback, altered metadata, premature settlement, missing refusal or duplicate action would fail assertions |
| `missing-command` | 0 | 0 | unknown command, exit 2 | A callback without the owned file would invalidate discovery attribution |
| `broken-import` | 0 | 0 | `ERR_PACKAGE_PATH_NOT_EXPORTED` warning, then unknown command/exit 2 | Exercises native export denial and swallowed discovery failure; main health alone would miss this |
| `collision` | 0 | 0 | fixture guard records duplicate, then `FIXTURE_COLLISION`, exit 1 | Demonstrates explicit harness rejection only |
| `collision-unguarded` | 0 | 1 | colliding plugin selected and throws `COLLISION_SELECTED`, exit 1 | Contradicts any claim that upstream registry itself prevents overwrite |
| `effect-trap` | 1 | 0 | attempted page input throws `EFFECT_TRAP:browser.page.nativeClick`, exit 1 | Confirms the browser-effect boundary actually rejects an attempted effect through execution |

All six cases passed their assertions. Before **every main import**, child-process spawn, global fetch and page input probes tripped the installed traps. No unexpected trap occurred in the refusal or missing/import/collision cases. The effect control modifies only the temporary command copy to attempt input; its distinct hash is in the receipt. No browser/provider input implementation exists in the evaluated closure.

## Collision interpretation

Actual `registry.js` stores commands in a global Map and overwrites existing keys. The unguarded control uses a Map subclass that only records duplicate `set` calls and otherwise preserves ordinary Map behavior; a later plugin replaced the owned command and its refusal callback ran. This is an observed limitation of command identity qualification in the tested discovery order.

The guarded control adds a **fixture-only** duplicate-key rejection and the owned command's fixture `validateArgs` checks that event before execution. Discovery catches the rejected plugin import, so that second check matters. Neither guard is an upstream feature, an adopted production policy, or evidence of production collision prevention. The normal case additionally checks registry identity against the loaded command export and the resolved public registry path.

## Actual and substituted layers

[SOURCE-PINS.json](SOURCE-PINS.json) pins all copied source bytes, OpenCLI/Commander package metadata and [refusal-command.js](refusal-command.js). The runner checks hashes **before** creating/evaluating VM modules. No source excerpts or rewritten upstream modules are evaluated.

Actual full OpenCLI modules executed in the successful case:

- Main/discovery, package paths, version/runtime/constants, CLI and Commander adapter.
- Registry/public registry API, hooks, errors, argument preprocessing, serialization and help.
- Execution, runtime, capability routing and browser timeout configuration.

Actual Commander CommonJS modules execute in the same VM: `index.js`, `lib/argument.js`, `error.js`, `command.js`, `help.js`, `option.js`, and `suggestSimilar.js`. The receipt lists every executed module and every stub's exported names.

**Filesystem and resolution:** actual discovery performs directory reads and compatibility-symlink creation inside an owned temporary home. Actual `createRequire(parent).resolve` plus `realpathSync` resolve the command's package exports to the copied `registry-api.js` and errors file. The broken-import control receives Node's package-export denial. However, the VM uses that native **require-condition resolver** for ESM links and executes Commander as CommonJS. This is not native ESM loading, import-condition resolution, or an unmodified spawned executable. Public registry/error subpaths in this pinned package are direct export paths; broader conditional-export equivalence is not claimed.

The temporary package is a **selected source snapshot**, with an empty built-in `clis` directory and no built-in manifest. It is not a complete runtime copy or qualification of competing installed adapters. Actual discovery scans the owned user file and synthetic plugin controls. Native host home/config/plugin data are not used; immutable synthetic home/config/plugin sentinels were checked. All pinned installed source files were hashed again after the six cases and remained unchanged.

Explicit replacements:

- `node-network.js` and `update-check.js` are stubbed **before top-level evaluation**. No `undici`, native-fetch capture, dispatcher, update fetch or exit hook from them runs. CI alone is not the effect barrier.
- BrowserBridge connect/close, daemon-client lease/run bookkeeping, profile selection, Electron classification, external-binary lookup, auth registration, logger and output/YAML rendering are synthetic. YAML error rendering is JSON, while actual error-envelope/exit selection remains exercised.
- Other browser, daemon, pipeline, observation, completion and unrelated CLI imports expose throwing exports. Thirty-two OpenCLI modules are stubbed; `RUN.json` contains the exhaustive list. `js-yaml` is an additional explicit stub.
- Filesystem methods delegate only after path and realpath confinement checks against the owned temporary tree. Unlisted methods throw. Node path/URL/hash/EventEmitter utilities are host helpers; OS home and process state/output/exit are synthetic. The process cannot spawn; Commander child-process imports receive throwing methods. Unknown builtin imports throw. Dynamic imports go through the same allowlist and resolver.
- Browser lifecycle timeouts are tracked inert handles, not real waits. The callback gate and short host-side test deadline establish settlement; they do not characterize production timeout behavior. VM string/Wasm code generation is disabled. These are effect limits for the pinned fixture, not a general claim that Node VM is a security sandbox.

## Reproduction, evidence and publication boundary

From the repository root, using an already available package with the pinned source and Commander bytes:

```sh
node --check docs/research/opencli-qualification/command-loading/run.mjs
node --check docs/research/opencli-qualification/command-loading/refusal-command.js
node --experimental-vm-modules docs/research/opencli-qualification/command-loading/run.mjs "$OPENCLI_ROOT"
```

Alternatively set `OPENCLI_ROOT` and omit the positional argument. The runner performs no installation. Node v26.5.0 was used; VM modules emit Node's experimental warning. [RUN.json](RUN.json) preserves the actual six-case receipt, source/stub/resolution inventories, synthetic lifecycle events, settled errors, preflight traps and cleanup result. Positional/environment-root reproductions and syntax checks passed. Temporary data are created only under this directory and removed in `finally`; cleanup and sentinel/source continuity assertions passed.

[pin-sources.mjs](pin-sources.mjs) is a separate maintainer utility recording the inspected source set. The runner never calls it. Regenerating pins is a reviewed source change, not permission to accept an incompatible installation automatically.

Portable paths and sanitized synthetic receipts make these files candidates for publication review, not approved publication. No private captures or personal runtime paths are required in the artifacts. Source bytes must be independently supplied; only the owned fixture is distributed here. A fresh-clone/runtime matrix, licensing/provenance decision, complete package materializer, real native loading/effect interception, production collision disposition and a concrete production consumer remain unqualified or unapproved. Repository-wide production checks were intentionally not run for this isolated research-only write set. No public driver, schemas, reservations, receipts or dependencies were changed.

## Independent cleanup regression

Independent review found that initial setup/copy errors occurred before the original runner entered its cleanup block. The [frozen fault probe](cleanup-check.mjs) exercised the actual runner with injected mkdir and write failures: [RED](cleanup-red.json) left an owned directory in both cases. A separate implementation author moved the try boundary directly after temporary-directory creation. Root reproduced [GREEN](cleanup-green.json): both injected errors retained their identity, newly created directories were removed, and unrelated paths/installed sources were unchanged. The normal six-case receipt is unchanged.

```sh
node --experimental-vm-modules docs/research/opencli-qualification/command-loading/cleanup-check.mjs docs/research/opencli-qualification/command-loading/run.mjs "$OPENCLI_ROOT"
```

The probe itself restores its filesystem hooks and removes only the exact temporary directory created by its invocation. Removal failures remain untested; the runner's existing rmSync failure semantics are unchanged. This is a fixture cleanup repair, not a production transaction/recovery change.

Runner before repair SHA-256: `d61d3e41c8b426dea06ee527d7df7a354f32e65c6306da72b9491f7fbefa04ff`. Runner after repair: `30b571de026e26ce446fe3f9a1c99984f8180659a91c599c968c42d48aa56254`. Frozen probe: `6e3ba39c6bf7ffd1aaa7d187f40475cd57e84aa3479e021508c1e7421548a5ab`.
