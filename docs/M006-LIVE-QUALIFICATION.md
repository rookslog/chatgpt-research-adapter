# M006 — Bounded Standard-Mode Live Qualification

- Qualification target: integrated implementation at `adf8d6c4c682a5c23fc54965920d2f862878f51e`
- Issues: #4 and #5
- Mode: `standard` only
- Maximum provider submissions in this bundle: two, one per turn
- Automatic retry: prohibited
- Purpose: satisfy #4's remaining standard-mode live regression while exercising both #5 rigor variants without changing production behavior

This runbook is an operator bundle, not evidence that the live criteria have already passed. Preserve deterministic, live-observation, source-check, and inference evidence as separate classes.

## Preconditions

Run from the local repository/runtime previously qualified in M004. Before the first provider turn:

```bash
git rev-parse HEAD
git diff --exit-code
git diff --cached --exit-code
npm test
npm run check:authority
npm run check:requirements
npm run check:syntax

OPENCLI="$PWD/.runtime/opencli/node_modules/.bin/opencli"
QUAL_ROOT="$PWD/.runtime/output/m006-live-qualification"
"$OPENCLI" --version
"$OPENCLI" doctor --verbose
```

The implementation under qualification must be the integrated #4 implementation, not an unreviewed local source edit. Untracked `.runtime/` material is expected and is not publication evidence.

If the Browser Bridge/account runtime is not healthy, stop before a provider submission. Do not repair a failed or ambiguous provider effect by resubmitting the same job.

## Turn A — expanded citations plus Markdown/full-message regression

This is the one live turn intended to cover #4's remaining criterion and #5's expanded-citation criterion.

```bash
PROMPT_A=$(cat <<'EOF'
Using current public GitHub evidence, verify two things about rookslog/chatgpt-research-adapter at execution time: the current main commit SHA, and whether issues #4 and #5 are open. Keep the answer compact.

In the answer body:
- mark substantive factual claims with claim IDs;
- include one GitHub Flavored Markdown table with columns `Item` and `Observed value`, with rows for the main SHA, issue #4 state, and issue #5 state;
- include two bullets naming the principal evidence sources and the role each source played;
- include one fenced `text` block containing exactly `M006_EXPANDED_CODE_LITERAL_[C-777]`;
- use direct claim-attached citations wherever a substantive claim is supported;
- distinguish any inability to verify live state rather than guessing.

After the claim ledger, end the complete response with a final standalone line exactly:
M006_EXPANDED_FULL_MESSAGE_OK

Do not make any claim about whether this prompt was submitted once or more than once; submission count is verified outside the answer.
EOF
)

node ./bin/chatgpt-research.js ask "$PROMPT_A" \
  --rigor standard \
  --citations expanded \
  --output-root "$QUAL_ROOT" \
  --opencli "$OPENCLI" \
  | tee "$QUAL_ROOT/turn-a-summary.json"
```

### Turn A acceptance checks

Record the printed job ID and inspect only that job's durable artifacts:

- `jobs/<job-id>/current.json`
- `jobs/<job-id>/events.jsonl`
- `jobs/<job-id>/prompt.txt`
- `jobs/<job-id>/response/intent.json`
- `jobs/<job-id>/response/handoff.json`
- `jobs/<job-id>/response/answer.md`
- `jobs/<job-id>/response/result.json`

Require all of the following before treating Turn A as a passing observation:

1. `result.json` is `completed`, mode is `standard`, citation level is `expanded`, audit appendix is `false`, and the profile is `standard/1.0.0`.
2. Job, turn, prompt/profile hashes, handoff conversation ID/URL, answer hash, and answer byte count are internally consistent with the durable files.
3. `answer.md` contains the terminal `M006_EXPANDED_FULL_MESSAGE_OK`, the exact fenced-code literal, all requested table rows, the claim ledger, and the material prose preceding them. The table is valid GFM rather than linearized text, and visible prose claim IDs are readable.
4. Exactly-one submission is corroborated separately from formatting: one durable direct intent, one accepted handoff, no retry state, and manual inspection of the returned native conversation shows exactly one user prompt for this job. If duplicate submission is suspected, #4 does not pass.
5. Expanded-citation formatting is checked separately from citation correctness. For every material claim-attached citation, open the cited source and record whether it actually supports that claim. Missing/incorrect support is a citation-correctness failure even if formatting conforms.
6. Do not generalize from this turn to reliability beyond this observed configuration.

If the turn ends in `ambiguous_effect` or `recovery_required`, preserve the job unchanged, inspect the returned conversation state before any later action, and do not resubmit this job. If content is truncated or duplicate submission is observed, keep #4 open.

## Turn B — audit appendix

Run Turn B only after Turn A has a known, non-ambiguous submission disposition. Turn B is independent evidence for #5 and must create a distinct job and native conversation.

```bash
PROMPT_B=$(cat <<'EOF'
Using current public GitHub evidence for rookslog/chatgpt-research-adapter, assess this statement: "A successful GitHub Actions run on ubuntu-latest proves this repository is portable to native Windows." Give one interpretation and one recommendation. Ground the answer in the repository's current workflow and a recent successful CI run, and explicitly separate direct observation from inference. Keep the main answer compact.

The audit appendix must materially address: evidence cutoff, source inventory and source roles/dependencies, contrary evidence or limits, coverage gaps, scope conditions, unresolved conflicts if any, unchecked or unperformed checks, and revision triggers. Do not treat absence of Windows CI evidence as proof of Windows incompatibility.

After the audit appendix, end the complete response with a final standalone line exactly:
M006_AUDIT_APPENDIX_OK
EOF
)

node ./bin/chatgpt-research.js ask "$PROMPT_B" \
  --rigor standard \
  --citations principal \
  --audit-appendix \
  --output-root "$QUAL_ROOT" \
  --opencli "$OPENCLI" \
  | tee "$QUAL_ROOT/turn-b-summary.json"
```

### Turn B acceptance checks

Require and record:

1. A distinct job ID, turn ID, conversation ID/URL, prompt hash, and answer/result receipt from Turn A.
2. `result.json` is `completed`, mode is `standard`, citation level is `principal`, audit appendix is `true`, and the profile is `standard/1.0.0`.
3. The answer contains substantive claim identifiers plus the claim-ledger fields for evidence, qualitative warrant, contrary evidence/limits, and revision trigger.
4. The appendix contains each requested audit field in substance: evidence cutoff; source inventory/roles/dependencies; contrary evidence; coverage gaps; scope; unresolved conflicts; unchecked items; revision triggers.
5. The final `M006_AUDIT_APPENDIX_OK` sentinel is present in the saved answer.
6. Citation correctness is evaluated separately from structural conformance by checking the cited workflow/run evidence against the claims attached to it.
7. The conclusion about Windows is scoped correctly: Linux CI success is evidence about that Linux runner/configuration, not direct native-Windows execution evidence.
8. No reliability estimate is inferred from this single audit turn.

## Qualification receipt

After both turns, add a durable receipt document or issue comment that records, for each turn:

- execution timestamp and implementation SHA;
- job ID and turn ID;
- conversation ID and URL;
- mode;
- rigor protocol/profile ID, version, and SHA-256;
- citation level and audit-appendix flag;
- prompt SHA-256;
- result status/disposition;
- answer path, SHA-256, and byte count;
- formatting/conformance findings;
- citation-correctness findings;
- exactly-one-submission evidence;
- material contrary evidence/limits and unchecked items;
- explicit statement that one turn is not a reliability estimate.

Use evidence labels such as `[ROOT LIVE OBSERVATION]`, `[ROOT VERIFICATION]`, `[MANUAL SOURCE CHECK]`, and `[INFERENCE]` where they clarify provenance. Do not promote provider-reported behavior into a direct observation without corroboration.

## Issue disposition

- Close #4 only if Turn A confirms valid GFM/readable claim IDs, complete full-message extraction, and no duplicate submission in the live standard flow in addition to the already-merged deterministic criteria.
- Close #5 only if both Turn A and Turn B complete and all #5 acceptance criteria are recorded, including citation correctness separately from formatting conformance.
- If either turn fails model conformance but transport/extraction is sound, preserve that as live evidence; do not rewrite the observation as a wrapper success.
- #2 and #3 remain separate selector work and are not modified by this bundle.
