# M006 — Live Qualification Post-Run Disposition

- Evidence run: 2026-08-26/27
- Evidence receipt: [M006-LIVE-QUALIFICATION-RECEIPT.md](M006-LIVE-QUALIFICATION-RECEIPT.md)
- Disposition review: 2026-08-26/27 after the receipt was published
- Issues reviewed: #4 and #5

This document does not alter the raw live observations. It records a subsequent line-by-line review of the **GitHub issue acceptance criteria**, which are narrower/different from the qualification runbook's deliberately strict probe checks.

## #4 — completed

Issue #4 requires:

1. extracted tables remain valid GFM;
2. visible claim IDs remain readable;
3. full-message extraction remains unchanged;
4. deterministic fixtures cover tables, claim IDs, lists, links, and code blocks;
5. one standard-mode live regression confirms no content loss or duplicate submission.

The merged deterministic implementation and Turn A satisfy those criteria:

- the saved table was valid GFM;
- prose claim IDs were readable;
- the requested table, code literal/block, claim ledger, material prose, and terminal rendered content were all recovered;
- the merged fixture contains a table, generated/near-miss claim IDs, list, link, and code block;
- one direct intent, one accepted handoff, no retry, and native inspection of one user plus one assistant message corroborated exactly one submission.

The raw saved sentinel used `\_` escapes. That is rendered-equivalent Markdown serialization, not truncation, and the same Turndown underscore escaping had already been observed during M004 while full content recovery was confirmed.

The requested `text` info string was absent, but the fenced code block and exact code literal were present. Preserving a requested language info string was not an issue #4 acceptance criterion, and this run did not establish whether that difference originated in provider-rendered HTML or HTML-to-Markdown conversion.

Issue #4 was therefore closed `completed` after acceptance review. This does not claim byte-for-byte reconstruction of the model's original Markdown source.

## #5 — completed with negative conformance findings

Issue #5 is a live **qualification/observation** task. It requires:

1. one bounded live standard-mode expanded-citation turn;
2. one bounded live standard-mode audit-appendix turn;
3. job/turn/conversation/prompt-profile/output receipts;
4. checks of claim IDs, citation coverage, audit fields, contrary evidence/limits, and revision triggers;
5. citation correctness reported separately from formatting conformance, with no reliability generalization.

Both turns completed once with no retry, the full receipts were recorded, all requested checks were performed, and the receipt separates formatting from citation correctness and explicitly rejects reliability generalization.

Turn B's missing principal citations for repository workflow/run claims are therefore a **negative qualification result**, not evidence that the qualification task itself was unperformed. The escaped raw sentinels are likewise recorded conformance observations.

Issue #5 was therefore closed `completed` after acceptance review. Closure means the requested variants were empirically qualified and their failures characterized; it does not mean every sampled model output conformed or that semantic truth verification was added to the wrapper.

## Remaining M006 work

The active feature issues are now #2 Web Search selector compatibility and #3 Deep Research selector compatibility. Their current no-submit structural capture did not reproduce the historical failures, so no selector patch is yet justified. The exact external Chrome/Browser Bridge path remains the next root-cause boundary.
