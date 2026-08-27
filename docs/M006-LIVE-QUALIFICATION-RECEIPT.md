# M006 — Live Qualification Receipt

- Execution window: 2026-08-26 23:10–23:14 EDT / 2026-08-27 03:10–03:14 UTC
- Implementation target: `adf8d6c4c682a5c23fc54965920d2f862878f51e`
- Execution branch: PR #9 head `36cc688cf2ab52b30722274b40220ce9d4164ac9` before this receipt was added
- Provider submissions: exactly two total, one for each runbook turn
- Automatic retries: none
- Outcome: both transports completed, but the runbook acceptance criteria were not all satisfied; issues #4 and #5 remain open

This receipt separates deterministic checks, root live observations, manual source checks, and inference. It is evidence for these two observations only, not a reliability estimate.

## Shared execution identity

`[ROOT VERIFICATION]` The executable/configuration inputs under qualification were byte-identical between integrated `main` and the pre-execution PR #9 head. `git diff --exit-code adf8d6c4c682a5c23fc54965920d2f862878f51e -- bin src scripts rigor templates package.json` exited 0. The 24 Git tree entries for those paths had the same manifest SHA-256 on both refs: `31694e6ce2e95796b75179bc12b09f4558983c8348e985a3293472bb108f8335`.

- OpenCLI executable: `/Users/rookslog/Development/chatgpt-research-adapter/.runtime/opencli/node_modules/.bin/opencli`
- Executable symlink target: `../@jackwener/opencli/dist/src/main.js`
- OpenCLI version: `1.8.7`
- Executable SHA-256: `246004200e381e5aecdfaef13e904953c0d18e0600ca66d02b956c4b1820ec02`
- Installed package integrity: `sha512-2M+oPc70R1jNGzKzNrsm3fN4/gdvxCKlla7s9eaaTjkDjlzHpoZFN1YdV01A185kwCTN/ChOg+rbO4epO73c3w==`
- OpenCLI ChatGPT selector source SHA-256 (`clis/chatgpt/utils.js`): `41fe6da20ec7184d6fa08defa86240b2a0261177e6311b6528cdb7b62ebc2d33`
- Browser Bridge: `1.0.23`; `[ROOT VERIFICATION]` OpenCLI doctor reported daemon/extension connectivity before either submission
- Rigor protocol: `chatgpt-research-epistemic/1.0.0`
- Rigor profile: `standard/1.0.0`
- Rigor profile SHA-256: `3ac667a01fadbb23a139ab0f45adb70c996f79adc389ee8183c6c7daac29a031`

Fresh deterministic preflight on the exercised branch:

- `npm test`: 125 passed, 0 failed, 0 skipped
- `npm run check:authority`: `M002_AUTHORITY_OK`
- `npm run check:requirements`: `REQUIREMENTS_OK`
- `npm run check:syntax`: exited 0

## Turn A — expanded citations and Markdown/full-message regression

| Receipt field | Recorded value |
| --- | --- |
| Implementation SHA | `adf8d6c4c682a5c23fc54965920d2f862878f51e` |
| Job ID | `job_34b33213687145bfac5d7016f3a70397` |
| Turn ID | `turn_4d80a21faa1845ed9d4f4c32e107013a` |
| Conversation ID | `6a8faa8a-f298-83e9-8f59-f1fdd94c9cac` |
| Conversation URL | `https://chatgpt.com/c/6a8faa8a-f298-83e9-8f59-f1fdd94c9cac` |
| Mode | `standard` |
| Citation level / audit | `expanded` / `false` |
| Prompt SHA-256 | `a8081499f2dac2a7f295b2ca165d17860e58a95c56279f3551ae2adfc98f30c1` |
| Intent SHA-256 | `df2aaa69dfd35034abd22faef0a89d660649b1e5662b08cdeed6385b860cb5b8` |
| Handoff SHA-256 | `632747d536e237631c54dd25c48ab5c85bea4474ab52f4ac7f872616c8aab5c3` |
| Answer path | `.runtime/output/m006-live-qualification/jobs/job_34b33213687145bfac5d7016f3a70397/response/answer.md` |
| Answer SHA-256 / bytes | `c9cd1da4bda11e016d2a78140e8238754d98b93d856a921c56dc995a504d3e25` / `2410` |
| Result SHA-256 / bytes | `91cce2ecf2d86451409aeab68991c0d4f7c38befba1ec7303cd440754c75ae4f` / `1211` |
| Disposition | `completed`; `exit_0_validated`; `remote_effect=completed`; `retry_decision=not_applicable` |

### Turn A findings

- `[ROOT VERIFICATION]` Receipt consistency passed: the durable prompt, intent, handoff, answer, and result hashes/byte count match their cross-references.
- `[ROOT VERIFICATION]` The saved answer has a valid GFM table with all requested rows, readable prose claim IDs, the claim ledger, the requested code literal, and material content through the final line.
- `[ROOT VERIFICATION]` The raw saved final line is `M006\_EXPANDED\_FULL\_MESSAGE\_OK`, not the exact required `M006_EXPANDED_FULL_MESSAGE_OK`. It is rendered-equivalent Markdown, but the runbook's exact raw sentinel check failed.
- `[ROOT VERIFICATION]` The requested code literal is present, but the saved output has an unlabelled fence rather than the requested `text` fence. This is an output-conformance defect, not evidence of truncation; this observation does not distinguish provider emission from conversion behavior.
- `[ROOT LIVE OBSERVATION]` Native conversation inspection found exactly one user message and one assistant message. The visible assistant message contained the unescaped rendered sentinel. Together with one direct intent, one accepted handoff, and no retry state, this corroborates exactly one submission for this job.
- `[MANUAL SOURCE CHECK]` GitHub's current `main`, issue #4, and issue #5 resources supported the three material claim-attached citations: `main` was `adf8d6c4c682a5c23fc54965920d2f862878f51e`, and both issues were open at checking time. Citation correctness therefore passed for the material linked claims. The second source-role bullet named the issue resources but did not itself link them; the claims above it did.
- `[INFERENCE]` The final content is present rather than truncated, but the strict acceptance contract requires the exact saved sentinel. #4 therefore remains open. Turn A is useful expanded-citation evidence for #5 but is not a complete runbook pass.

## Turn B — audit appendix

| Receipt field | Recorded value |
| --- | --- |
| Implementation SHA | `adf8d6c4c682a5c23fc54965920d2f862878f51e` |
| Job ID | `job_ad1ab84b0a314d65839c28a4016acbb7` |
| Turn ID | `turn_55a32461e41f495393bd4b5fd7d32217` |
| Conversation ID | `6a8fab3f-7f20-83ea-90b9-2e769c011386` |
| Conversation URL | `https://chatgpt.com/c/6a8fab3f-7f20-83ea-90b9-2e769c011386` |
| Mode | `standard` |
| Citation level / audit | `principal` / `true` |
| Prompt SHA-256 | `682cc20e696b1221bffd334c03f4ae406c8456bff6cceae1bdc2a389d3242e3c` |
| Intent SHA-256 | `f136c62cf59ecbc8a92ad59fd9229254019e7c7dc9a303a10b30a3428a4986b5` |
| Handoff SHA-256 | `94e468451ed4803adaac78426813223ef9bad6a851f03ede4a28293b2aeac27a` |
| Answer path | `.runtime/output/m006-live-qualification/jobs/job_ad1ab84b0a314d65839c28a4016acbb7/response/answer.md` |
| Answer SHA-256 / bytes | `caf89c4a5845a8ea4ad8390b8f31a896e921d511a0ae5e9a27eab8bedce0edc3` / `6997` |
| Result SHA-256 / bytes | `03877fed40ce86532c19e7ad17a5457b94e5f502469ffb90b7eea3d5210dfe11` / `1211` |
| Disposition | `completed`; `exit_0_validated`; `remote_effect=completed`; `retry_decision=not_applicable` |

### Turn B findings

- `[ROOT VERIFICATION]` Receipt consistency passed and all per-turn identities are distinct from Turn A.
- `[ROOT VERIFICATION]` The answer contains readable claim IDs, a substantive claim ledger, and all requested audit fields: evidence cutoff; source inventory/roles/dependencies; contrary evidence/limits; coverage gaps; scope conditions; unresolved conflicts; unchecked checks; and revision triggers.
- `[MANUAL SOURCE CHECK]` Integrated `ci.yml` has one `ubuntu-latest` job and writes the package dry-run to `/tmp/chatgpt-research-pack.json`. GitHub Actions run 134 (`33030036704`) completed successfully for the integrated SHA with every configured step successful. GitHub's cited runner documentation supports the distinction between `ubuntu-latest` and `windows-latest`.
- `[ROOT VERIFICATION]` The emitted GitHub Docs citation is correct for the runner-label claim. The answer did not emit direct citations for its repository workflow and run claims, so principal-source citation coverage failed even though the claims were independently corroborated.
- `[ROOT VERIFICATION]` The Windows conclusion is scoped correctly: Ubuntu success supports the checked Ubuntu configuration but is not direct native-Windows execution evidence; absence of Windows CI was not treated as incompatibility evidence.
- `[ROOT VERIFICATION]` The raw saved final line is `M006\_AUDIT\_APPENDIX\_OK`, not the exact required `M006_AUDIT_APPENDIX_OK`; it is rendered-equivalent Markdown but fails the strict raw sentinel check.
- `[ROOT LIVE OBSERVATION]` Native conversation inspection found exactly one user message and one assistant message. One direct intent, one accepted handoff, no retry state, and the native count corroborate exactly one submission for this job.
- `[INFERENCE]` Audit substance passed, but exact-sentinel conformance and principal-source citation coverage did not. #5 therefore remains open.

## Issue disposition

- #4: remain open. The live turn corroborated one submission, GFM table fidelity, readable claim IDs, and presence of the final rendered content, but failed the runbook's exact raw sentinel check.
- #5: remain open. Both variants were observed without transport ambiguity, but the bundle did not satisfy all acceptance checks: Turn A had strict raw-output conformance defects, and Turn B lacked principal citations for the repository/run claims and also escaped its raw sentinel.
- Neither observation is generalized into a reliability estimate.
