# Contributing

This guide is for humans and coding agents making a bounded, locally reproducible change. Start with the [current Standard status](README.md#current-standard-status): Standard submission is refusal-only. [Standard groundwork](docs/STANDARD-GROUNDWORK.md) describes offline preparation and the remaining qualification boundary.

## Run the offline checks

Use a checkout of the revision you intend to change, Node.js 22 or newer, and npm. [Package metadata](package.json) declares no dependencies, so these checks need no install step. The syntax script uses POSIX `find`, `sort`, and `xargs`. [CI](.github/workflows/ci.yml) uses `ubuntu-latest` and Node 22; this is not a supported-platform matrix.

Run from the repository root:

```sh
node --version
npm --version
npm test
npm run check:authority
npm run check:requirements
npm run check:syntax
npm pack --dry-run --json --ignore-scripts
```

These checks use local code and fixtures. They require no signed-in browser, OpenCLI installation, provider account, paid model, or personal skills. Record the revision and any uncommitted changes with the results.

| Check | Meaning and limit |
| --- | --- |
| `npm test` | Executes deterministic tests for this checkout; fixtures do not qualify live ChatGPT behavior. |
| `check:authority` | Checks source inventory, hashes, import/capability constraints, and the encoded package contract. |
| `check:requirements` | Checks registry shape, referenced files, and test-name text correspondence; it does not execute tests or approve requirements. |
| `check:syntax` | Checks JavaScript syntax in the source, scripts, CLI, and tests. |
| Package dry run | Reports package contents and metadata without publishing; it does not qualify a release. |

For a focused test, run `node --test test/<relevant-file>.test.js`, replacing the placeholder with an existing test file. Run the full checks before handing off code changes. For prose-only changes, inspect the exact diff and local links; wording alone needs no new tests.

## Choose and implement a bounded change

Use [GitHub Issues](https://github.com/rookslog/chatgpt-research-adapter/issues) for bugs, proposals, and scope agreement. Check blockers and active work before duplicating an effort. Small documentation corrections can explain their scope directly. Changes to public behavior, schemas, dependencies, authority, or release policy need an explicit maintainer decision before implementation.

Describe the problem, expected outcome, acceptance example, and intended files. Preserve unrelated work. An issue, passing test, or recommendation does not authorize provider calls, browser operations, installation, publication, or wider contract changes. Keep ordinary reproduction offline; request a separately bounded maintainer qualification step when live evidence is necessary.

For behavior changes, agree on the acceptance example first. Add a public-contract test and inspect its baseline result. An expected behavioral failure is useful RED evidence; an import/setup failure is not. If the test already passes, record the existing behavior. Implement the smallest change, inspect the outcome, then run relevant regressions and the full checks. [Agent contribution guidance](docs/agents/contributing.md) covers bounded assignments and handoffs.

Only accepted requirements belong in the [hard-requirements registry](verification/requirements.json). Keep candidate scenarios in an issue or proposal until their outcome and support boundary are decided. Update changed accepted requirements, bindings, and relevant documentation together, then execute the tests themselves.

## Work with source pins

The [authority checker](scripts/m002-authority-check.js) constrains exact hashes, inventory, imports, capability tokens, production comments, and package structure. An ordinary source edit can produce `SOURCE_DIGEST_MISMATCH` even when tests pass. Review the source change instead of disabling validation.

For an approved compiler behavior change, include the behavioral test, smallest compiler edit, and corresponding SHA-256 update under `m002Authority.sourceSha256` in [package metadata](package.json). This read-only example hashes the final bytes:

```sh
node --input-type=module -e "import {createHash} from 'node:crypto'; import {readFileSync} from 'node:fs'; console.log(createHash('sha256').update(readFileSync('src/compiler.js')).digest('hex'))"
```

Update only pins for intentionally reviewed changes. Explain each changed source and inspect the full diff before rerunning `check:authority`. New source files/imports or package-contract changes can require reviewed checker changes; resolve that scope explicitly. For validator or test changes, preserve the motivating counterexample and explain how the check remains meaningful. A refreshed pin or passing validator cannot approve its own changes.

## Find the contract and hand off evidence

Consult the [product boundary](docs/PROJECT-BOUNDARY.md), [offline foundation](docs/M002-PLAN.md), [transport design](docs/M003-DESIGN.md), [Deep lifecycle](docs/M006-PLAN.md), and [Standard groundwork](docs/STANDARD-GROUNDWORK.md) for the behavior being changed. Older live results are historical evidence, not qualification of the current driver.

Use the PR template for the problem, decision/requirement links, changes, exact checks/results, and unresolved limits. State what was not checked and why. Bug reports should include a minimal redacted reproduction, revision, Node/npm versions, OS, and whether evidence is offline or live. Omit credentials, private content, and unnecessary account/job/browser identifiers.

Contributors remain accountable for understanding and validating generated code. No particular AI tool or full agent transcript is required. The package remains private at version `0.0.0`; repository documentation links refer to a checkout, and the package file list excludes docs. This guide makes no release or distribution promise.

## License

Original contributions are made under the project [Apache-2.0 license](LICENSE), subject to any separately agreed contribution terms. Preserve applicable third-party attribution and license notices.
