# Verification Policy

## Principle

Every hard `MUST`, security boundary, acceptance criterion, and release gate must map to explicit verification evidence.

The contract is **requirement -> verification coverage**, not one requirement -> one test. One requirement may need several checks, and one integration test may exercise several requirements.

## Verification classes

- `test` — deterministic unit/property/regression behavior.
- `integration` — deterministic behavior spanning multiple repository components.
- `static-check` — source, authority, dependency, path, schema, or packaging policy.
- `live-qualification` — bounded behavior of an external/evolving system that cannot truthfully be established offline.
- `manual-gate` — explicit owner/operator decision that cannot be automated.

## TDD evidence

For deterministic new behavior or a deterministic bug fix:

1. express the observable contract as a test;
2. run it before the production change;
3. confirm it fails for the expected missing/incorrect behavior rather than a test error;
4. implement the smallest coherent change;
5. rerun the focused test and affected suite;
6. keep the full suite green.

A test written after an implementation is still useful regression coverage, but it must not be described as RED-before-GREEN evidence unless the failing state was actually observed.

## External-system boundary

Mocks and fixtures prove wrapper logic; they do not prove current ChatGPT/OpenCLI/browser behavior.

If a hard requirement depends materially on an external system, the registry must bind it to `live-qualification` or `manual-gate` in addition to any deterministic wrapper tests. CI must not simulate that external requirement and then claim live conformance.

## Machine-readable registry

`verification/requirements.json` is the canonical mapping for repository hard requirements introduced after this policy. Each entry has:

- stable requirement ID;
- concise normative statement;
- verification bindings;
- each binding's type and repository artifact;
- explicit live/manual status where applicable.

`npm run check:requirements` validates registry structure and deterministic artifact existence. It is deliberately lightweight and is not a general requirements-management system.

## CI contract

Credential-free CI must run the same stable deterministic gates expected locally:

- `npm test`;
- `npm run check:authority`;
- `npm run check:syntax` once exposed as a stable package command;
- `npm run check:requirements` once the registry checker is installed;
- package dry-run with lifecycle scripts disabled.

CI must not receive ChatGPT/browser credentials and must not invoke live provider/browser operations.

## Review-to-requirement feedback

A valid review finding that reveals a previously unstated hard invariant should add or refine a requirement binding when that invariant is likely to matter beyond the exact line under review.

A repeated high-severity finding in the same invariant category is evidence that the design or verification topology is wrong, not merely that another test case is missing.
