---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Read the repository's orchestration instructions before starting, then classify
the invocation:

- **Ticketed or delegated invocation:** read the claimed ticket's execution
  contract and use its exact owned Markdown output path. If it is absent,
  return the missing-contract fact instead of inventing a location.
- **Direct root invocation:** no claimed ticket is required. Establish and
  record one root-owned output before research begins: follow an existing
  repository research-artifact convention, or use
  `docs/research/<YYYY-MM-DD>-<slug>.md` when none exists. Avoid overwriting an
  existing artifact. Do not invent a ticket merely to satisfy the delegated
  contract.

- If you are the root orchestrator and delegation is justified, launch one
  bounded background research agent using the ticket's recorded route or a
  direct-run contract that records the root-owned output and validation oracle.
- If you are already the delegated researcher, perform the research directly;
  do not create another delegation layer.

The research job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it only at the established ticket-owned or direct-root output path and
   return that locator to the root for validation.

For ticketed or delegated work, the returned worktree path is collection
evidence, not durable publication. Root must publish the validated artifact
through the repository's authorized version-control destination (or an
explicitly approved tracker attachment), verify the durable locator, and keep
the ticket assigned and open if that publication lacks authority or has not
completed. For direct root work, report the exact repository path and its
verification state; later commit or publication still follows the repository's
normal authority boundary.
