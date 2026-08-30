---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker).
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

Determine the durable `bug` or `enhancement` category from that source. Every published implementation ticket must carry that category and the canonical agent brief; a source whose category remains ambiguous is not ready to decompose into runnable tickets.

Classify the source's planning state before drafting. When a durable source
reference exists, fetch its current tracker record and the repository's
definition of terminal planning state. A Wayfinder map must be closed/resolved
with its destination outcome published; another spec or plan must be
closed/resolved or carry the repository-defined verified terminal approval
record. An open Wayfinder map, a spec in `needs-triage`, unresolved fog, or a
missing/ambiguous terminal record must stop before publication. When there is no
durable source, the user-approved breakdown in the live conversation is the
source decision; do not invent a tracker state for the conversation.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker `/setup-matt-pocock-skills` configured; the tickets are the same either way, only the shape of the blocking edges changes:

- **Local Markdown** → reconcile the complete feature-directory inventory before any write, then create or resume one file per approved key under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`. Each file's "Blocked by" lists the reconciled numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues.

Before any tracker write, re-read every durable source and verify the terminal
planning state under the rule above, then validate the complete approved
blocking graph. Reject every self-edge or self-dependency. Run a deterministic
topological sort over the approved ticket ordinals; if vertices remain,
identify one concrete cycle, stop without publishing anything, and return that
cycle to the user for a corrected breakdown. Only a terminal source and an
acyclic approved graph may proceed.

Then compute one approved-breakdown digest over the complete normalized user-approved list: ticket titles, observable deliverables, blocking edges, and order. The key binds the source identity, approved-breakdown digest, and approved ordinal. Every ticket receives `Ticket publication key: <source-identity>/<approved-breakdown-digest>/<approved-ordinal>`; use a stable conversation-derived source identity when no source ticket exists. A canonical source reference supplies the source identity but does not replace the breakdown digest. Reordering, inserting, removing, or materially changing a slice therefore produces a different key set and requires explicit disposition of tickets from the prior breakdown.

Before any ticket create, reconcile every ticket generation for the stable
source identity. Exhaustively find open and closed tickets whose publication
key starts with `Ticket publication key: <source-identity>/`, not only tickets
whose full keys occur in the newly approved set. Separate exact current keys
from every prior generation. Each prior-generation ticket requires an explicit,
verified reuse or supersession disposition that prevents obsolete runnable work
before creation of any replacement; a still-ready or ambiguously dispositioned
prior ticket stops publication.

For a real tracker, put the exact key in the issue body, perform that exhaustive source-prefix inventory, then reconcile every approved key: **zero matches** permits one create only after all prior generations are dispositioned; **one match** means resume the existing issue from its observed stage; **multiple matches** stops for explicit duplicate disposition. Resume the existing issue by verifying or repairing relationships, then publishing and verifying the trusted Agent Brief, then applying and verifying the ready state. Never recreate an issue merely because brief publication, relationship mutation, or state application failed.

For Local Markdown, put the same exact `Ticket publication key:` in every file and inventory the complete feature issue directory before allocating any path. Treat every unmatched key with the same source-identity prefix as a prior generation requiring explicit verified disposition. For each approved key, **zero matches** permits one exclusive create at an unused number only after that generation reconciliation, **one match** resumes that exact file without discarding its observed state or evidence, and **multiple matches** stops for explicit duplicate disposition. Stop on duplicate numbers, malformed files, or unmatched existing tickets until they are dispositioned. Never implicitly overwrite or replace a path, claim, completion record, discussion, or prior evidence. After reconciliation, map approved ordinals to the actual local numbers and write blocking references in a second pass.

Before marking any published ticket `ready-for-agent`, use the authoritative [agent-brief template](../triage/AGENT-BRIEF.md), including its complete execution contract, and add the parent/blocking relationship. On a real tracker, create or recover the keyed issue body with its parent and blocker metadata, then post the complete Agent Brief through the configured trusted triage producer; fetch and verify the comment/note author plus immutable ID or URL. Do not embed the authoritative brief only in the description. Apply the ready state only after that trusted record is verified. For local Markdown, keep the complete brief in the ticket file. Do not maintain a second reduced brief schema here. If any required field is undecided, leave the ticket non-runnable and route it for human clarification instead of applying `ready-for-agent`.

Work the **frontier**: any real-tracker ticket whose blockers are closed, or any Local Markdown ticket whose blockers all verify `Execution status: completed`. For a purely linear chain that means top to bottom.

Execution uses the configured tracker lifecycle. Root claims only a ready, unblocked, contract-complete ticket and verifies the durable claimant before work. Completion requires the closure target, deterministic verification, declared review, root integration, and durable evidence; it is then published and verified before the tracker-specific final transition. Real trackers close the issue last. Local Markdown sets `Execution status: completed` last. Neither a ready state nor an answer/evidence record alone unblocks dependants.

Permit only the approved parent relationship mutation needed to attach/index the published implementation tickets, and verify it. Do not change unrelated parent body content, workflow state, or closure; do not close the parent as part of ticket publication.

<local-ticket-template>

# <NN>: <Ticket title>

Created: <current RFC 3339 timestamp>

Status: ready-for-agent

Ticket publication key: <source-identity>/<approved-breakdown-digest>/<approved-ordinal>

Execution status: unclaimed

<complete canonical Agent Brief, including Category and Execution contract>

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None (can start immediately)".

</local-ticket-template>

<issue-template>

Ticket publication key: <source-identity>/<approved-breakdown-digest>/<approved-ordinal>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## Blocked by

- A reference to each blocking ticket, or "None (can start immediately)".

</issue-template>

After creating or recovering each real-tracker issue from that body, post one
separate comment containing the complete canonical Agent Brief, including
Category and Execution contract, through the configured trusted triage
producer. Fetch and verify its author plus immutable locator before applying
`ready-for-agent`.

In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.
