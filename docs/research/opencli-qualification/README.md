# Offline OpenCLI integration evidence

These manual source-characterization fixtures investigate the boundary needed by [Standard submission #60](https://github.com/rookslog/chatgpt-research-adapter/issues/60). They do not implement a Standard driver or authorize browser/provider calls. Ordinary contributor tests do not require OpenCLI.

## Navigational reader during a writer window

[Report](reader-interference/REPORT.md), [runner](reader-interference/run.mjs), [source pins](reader-interference/SOURCE-PINS.json) and [synthetic receipt](reader-interference/RUN.json).

The pinned persistent result collector is labelled read but can navigate. In this bounded source composition, write-only lease arbitration admits that navigation while a writer retains its lease. Shared/disjoint/same-URL controls distinguish target identity, an ineffective lock, and navigation hidden by an unchanged final URL. Full daemon execution, extension routing and physical browser targets are not exercised.

Supply an existing matching OpenCLI 1.8.7 package root; the fixture will not install one. Source hashes must match.

```sh
node --experimental-vm-modules docs/research/opencli-qualification/reader-interference/run.mjs "$OPENCLI_ROOT"
```

A successful run produces synthetic JSON for three cases and no external input. A mismatched/missing source or unexpected import/effect fails closed. The disjoint target is a fixture control, not an implemented browser-isolation feature.

## Refusal-only command loading

[Report](command-loading/REPORT.md), [runner](command-loading/run.mjs), [source pins](command-loading/SOURCE-PINS.json) and [synthetic receipt](command-loading/RUN.json).

```sh
node --experimental-vm-modules docs/research/opencli-qualification/command-loading/run.mjs "$OPENCLI_ROOT"
```

Six cases exercise the actual main/discovery/Commander/execution source in a trapped VM. The owned callback refuses once after a controlled asynchronous gate; missing and broken commands never reach it. An unguarded plugin replaces the command, while a fixture-only guard rejects replacement. These controls do not establish upstream collision prevention. Network/update/browser/daemon modules are substituted and native require-condition resolution is used for VM linking; full native-runtime qualification remains open. Source pins include the already available Commander dependency.

The loading runner also has an independently authored [cleanup regression](command-loading/REPORT.md#independent-cleanup-regression), with before/after receipts for setup and copy errors.

## How to use the evidence

The result challenges the inference that a write lease excludes every operation that can disturb a page. It does not choose whether collectors should return busy or use independently qualified targets. Unknown-outcome settlement and cross-process recovery remain separate questions.

These files are excluded from the development npm package and default production test suite. They make no live qualification, provider-model, quota, installed-package or supported-platform claim. See the individual reports for exactly which sources execute and which boundaries are simulated.
