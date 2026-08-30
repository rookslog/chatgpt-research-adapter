---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Read the repository's orchestration instructions and the claimed ticket's
execution contract before starting.

- If you are the root orchestrator and delegation is justified, launch one
  bounded background research agent using the ticket's recorded route.
- If you are already the delegated researcher, perform the research directly;
  do not create another delegation layer.
- Use the ticket's exact owned Markdown output path. If it is absent, return
  the missing-contract fact instead of inventing a location.

The research job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it only at the ticket-owned output path and return that locator to the
   root for validation.

The returned worktree path is collection evidence, not durable publication.
Root must publish the validated artifact through the repository's authorized
version-control destination (or an explicitly approved tracker attachment),
verify the durable locator, and keep the ticket assigned and open if that
publication lacks authority or has not completed.
