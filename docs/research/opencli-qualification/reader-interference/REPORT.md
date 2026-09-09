# Persistent collector during a held writer window

Status: completed source-only characterization under the approved September 9 bundle; no production change or proposed GREEN. Concerns: #60 and #61; follow-up question from [the Standard submission frontier](https://github.com/rookslog/chatgpt-research-adapter/issues/60), “Navigational-reader composition.” Date names the assigned wave; local execution occurred September 8, 2026. Served model/effort: unknown.

## Finding and decision boundary

**Observed:** with pinned OpenCLI 1.8.7 source, the registered `chatgpt/deep-research-result` callback reached synthetic `page.goto` on a writer's shared target while the writer was held after a simulated verification and before simulated input. The collector declares `access: read`, resolves `siteSession: persistent` and `session: site:chatgpt`, and receives no write lease run. Its navigation passed the extracted daemon arbitration block while the writer retained its lease. Giving a read request a synthetic run ID also leaves it ineligible for lease arbitration.

**Corroborated-for-this-decision:** this composition does not provide exclusion against the tested navigational collector. This is a source/synthetic-target result. Whether a real daemon and extension resolve concurrent commands onto the same physical target, and what a navigation does to real pending input, remain uncorroborated. No browser interference, provider settlement, or real transaction failure is claimed.

| Case in RUN.json | Navigation effects during hold | Writer-target navigations | Competing eligible writer | Writer lease after collector |
| --- | ---: | ---: | --- | --- |
| `shared-target`, different initial URL | 1 | 1 | rejected: 409 `session_busy` | original holder |
| `disjoint-target` | 1 | 0 | rejected: 409 `session_busy` | original holder |
| `shared-target`, already at collector URL | 2: home detour and return | 2 | rejected: 409 `session_busy` | original holder |

All navigation events record `writerHeld: true` and `writerInputs: 0`. Releasing the fixture barrier then increments the synthetic writer input once. In the first case its recorded URL differs from the URL observed before the hold; in the disjoint control it does not. In the same-URL case the final URL is unchanged despite two navigations, which is why navigation counts are preserved independently of final URL.

**Falsifiers run:** collector arbitration rejection or zero shared-target navigation would contradict the positive characterization; a disjoint-target change would expose a fixture identity error; admission of the second eligible writer would undermine the held-lease control. Assertions checked all three, plus original-holder continuity at each navigation and before barrier release. Three cases passed; no VM boundary violations were recorded. The disjoint target is selected by the fixture, so that control establishes specificity only, not a production isolation mechanism.

**Decision implication (inference):** a future exclusion contract needs an explicit disposition for navigational readers. This experiment does not select that policy, approve a separate-target implementation, or settle target identity. Those remain owner decisions informed by independently reproduced evidence.

## Actual source versus simulation

[SOURCE-PINS.json](SOURCE-PINS.json) pins complete upstream files and exact extraction bytes. [run.mjs](run.mjs) reads only that allowlist from the supplied package root, checks all hashes/version before evaluation, and never evaluates `daemon.js` top-level.

Full upstream VM module execution:

- `clis/chatgpt/deep-research-result.js`: entire declaration and callback, including its same-URL detour.
- `dist/src/registry-api.js`, `registry.js`, `hooks.js`, `errors.js`: actual registration/normalization and error classes. Registered command identity is asserted against the real registry.
- `dist/src/session-lease.js`: actual eligibility, key, registry and busy-failure helpers.

Exact source extraction, **not full-module execution**:

- `execution.js`: `normalizeSiteSession`, `resolveSiteSession`, `resolveAdapterBrowserSession`, and the `leaseRun` declaration, with manifest start/end markers and SHA-256. Wrappers export them; a deterministic run-ID supplier replaces generation. The persistent branch uses no UUID.
- `daemon.js`: the block from `let leaseKey;` up to the absolute-deadline comment. The whole block is executed inside a fixture function. The wrapper supplies route/registry/clock/log/response dependencies and appends a success marker after the block. Its returned success marker means “passed this arbitration block,” not extension dispatch.

Explicit simulation:

- Writer callback, verification, input effect, gate and target objects. No actual production writer or input code runs.
- Profile/context resolution, page methods, navigation state, network-capture observations, sleeps and clock. The fixture invokes the arbitration wrapper from synthetic `goto`; full `executeCommand`, daemon-client serialization, page implementation, extension transport and target resolution do not run.
- Collector `utils.js` exports: strict synthetic argument helpers, current URL, login and result observation; a completed synthetic report. These utilities and authenticated report extraction are not qualified. The callback itself is unchanged.
- Logger sink and response callback. Unexpected imports, dynamic imports, timer/network/process calls and unlisted page access throw; VM string/Wasm code generation is disabled. These traps define a bounded fixture, not a security-isolation claim about Node VM.

The source manifest includes `package.json` to assert version; it is parsed, not evaluated. No copied upstream implementation is distributed in this directory: extraction occurs from an operator-supplied installation at run time.

## Reproduction and evidence

From the repository root with an existing package directory containing the pinned bytes:

```sh
node --check docs/research/opencli-qualification/reader-interference/run.mjs
node --experimental-vm-modules docs/research/opencli-qualification/reader-interference/run.mjs "$OPENCLI_ROOT"
```

Alternatively omit the positional argument and set `OPENCLI_ROOT`. The runner performs no installation and defaults to no personal path. Node must provide `vm.SourceTextModule` under `--experimental-vm-modules`.

Observed receipt: [RUN.json](RUN.json), Node v26.5.0, OpenCLI 1.8.7, `status: pass`, three cases, empty `violations`; module/extraction inventory and event sequences are included. The local syntax check and repeated positional/environment-root runs exited 0; their JSON outputs were byte-identical. Node printed its expected experimental VM warning to stderr. Missing-root invocation was checked to exit nonzero before evaluation. No repository-wide production checks were run because this lane changes only an independent research fixture/report.

Portability/publication boundary: paths in the runner and manifest are package-relative, and the receipt uses synthetic URLs/identifiers with no private captures. Reproduction elsewhere requires independently supplied identical OpenCLI bytes; a portable CLI argument is not a clean-clone or supported-OS/runtime qualification. Licensing/provenance and any public release remain separate owner decisions. This fixture is not added to a published package or a production acceptance registry.
