# Domain documentation

This repository uses a single product context.

## Required context

Before changing product concepts, public behavior, or authority boundaries,
read:

- `README.md` for current product and implementation status;
- `docs/PROJECT-BOUNDARY.md` for product, authority, and operation boundaries;
- the active `docs/M###-PLAN.md` when the work belongs to a milestone.

If `CONTEXT.md` or an applicable ADR under `docs/adr/` exists, read it as well.
Their absence is not a setup defect: create a glossary or ADR lazily when a
term or durable trade-off is actually resolved.

## Vocabulary and decisions

- Use existing product terms in issue titles, acceptance criteria, and code.
- Surface contradictions with `docs/PROJECT-BOUNDARY.md` or an ADR before
  treating a new direction as settled.
- Use an ADR only for a consequential decision that is difficult to reverse,
  surprising without its rationale, and the result of a real trade-off.
