---
name: wayfinder
description: Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
---

A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on the repo's issue tracker, then works its **decision tickets** (questions whose resolution is a decision, not slices of a build to execute) one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting: it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic: engineering work, course content, whatever fits the shape.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear, with nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes**, carrying execution into the map itself, but absent that, produce decisions, not deliverables.

## Refer by name

Every map and ticket is an issue, so it has a **name**: its title. In everything the human reads (narration, the map's Decisions-so-far), refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish; a name wraps its link, but they ride _inside_ the name, never stand in for it.

## The Map

The map is a single issue on this repo's issue tracker, labelled `wayfinder:map`, the canonical artifact. Its tickets are child issues of the map.

The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place, its ticket, so the map never restates it, only gists it and links.

**Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific.** The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`. Consult the tracker doc's "Wayfinding operations" section for how _this_ repo expresses them. If no tracker has been provided, default to the local-markdown tracker.

### The map body

The whole map at low resolution, loaded once per session. Open tickets are **not** listed: they are open child issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like: the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [<closed ticket title>](link): <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a **child issue** of the map; the tracker's issue id is its identity. Its body is the question, sized to one 100K token agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>

## Execution contract

**Contract status:** complete / needs-clarification

<the repository-required execution contract; a needs-clarification child is not on the frontier>
```

Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).

A ticket is visibly **claimed** by assigning it to the dev driving the map, but an assignee is availability state, not a concurrency mutex. Exactly one root orchestrator is the claim authority for a map. It serializes `re-read frontier -> verify execution contract -> assign -> verify assignment -> record run -> dispatch`; workers receive an already-claimed ticket and never self-assign. Do not run independent root claimers against the same map. If a single claim authority cannot be established, stop rather than start duplicate work.

Blocking uses the tracker's **native** dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children, the edge of the known.

The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.

## Ticket Types

Every ticket is either **HITL** (human in the loop, worked _with_ a human who speaks for themselves) or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that calls the Skill tool with "research". Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation. The default case. Always call the Skill tool twice, for "grilling" and "domain-modeling".
- **Task** (HITL or AFK): Manual work that must happen before a _decision_ can be made: nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that _does_ rather than decides, and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war**: the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets, one at a time, until the way to the destination is clear and no tickets remain.

The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination: everything here is in scope, just not sharp enough to ticket. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.

**Fog or ticket?** The test is whether you can state the question precisely now, _not_ whether you can answer it now.

- **Ticket when** the question is already sharp, even if it's blocked and you can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Don't pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and one patch may graduate into several tickets, or none, once the frontier reaches it.

**Not yet specified** excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope**: it isn't fog, and it doesn't belong in **Not yet specified**. It gets its own **Out of scope** section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.

Out-of-scope work never graduates (the frontier stops at the destination), so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.

Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session**, with the exception of research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Call the Skill tool twice, for "grilling" and "domain-modeling", to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. Fog and unresolved decisions are independent: several sharp tickets can exist with no fog. Skip the map only when there are no unresolved decisions, or when every unresolved decision fits one session and no shared graph or resumption point is needed. Then stop and ask the user how they'd like to proceed.
3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Create the tickets you can specify now** as child issues of the map. Populate the repository's complete ticket execution contract on every ticket at creation, regardless of type; for HITL work, record the human/root route explicitly rather than inventing an agent route. If a contract field cannot yet be supplied, set `Contract status: needs-clarification` and exclude the child from the frontier until the contract is completed. Then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Wiring sorts contract-complete children into the frontier and the blocked; everything you can't yet specify stays in the fog: the **Not yet specified** section.
5. **Launch the research frontier.** The root claim authority re-reads the wired dependency state and selects only open, unassigned `research` tickets with no open blocker. Launch no more than the remaining wave capacity. Before each launch, add or verify the repository's ticket execution contract, including one owned output path and the route fit; then claim and verify the ticket, record a stable run ID plus task/return locator in the claim comment, and only then dispatch. The subagent calls the Skill tool with "research" and works only in its isolated owned branch/worktree and output path. Blocked, contract-incomplete, or unverifiably claimed tickets remain unlaunched.
6. **Register collection.** Every launched run must have a supported return path: use the harness's task waiter/wakeup when available, or persist a resumable task locator that a later Wayfinder session can inspect. A later session first collects completed research, validates the ticket-owned artifact, and reconciles the map; in-progress work stays claimed, and failed or lost work gets an explicit disposition from the root. Never abandon an assigned research ticket merely because charting stops.
7. Stop: charting is one session's work; it hand-resolves nothing unless a launched research result has returned and passed collection.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional**: without one, you pick the next decision, not the user.

1. Load the **map**: the low-res view, not every ticket body. Before taking new work, reconcile already-claimed research runs: inspect their persisted task locators, collect completed artifacts, leave in-progress work claimed, and explicitly disposition failed or unrecoverable runs.
2. Choose the ticket. Whether the user named one or you select the first frontier ticket, verify that it is open, unblocked, unassigned, and carries any required execution contract. A named ticket does not bypass these gates. The root claim authority then performs the serialized claim sequence and dispatches or starts work only after the assignment and run record are visible.
3. Resolve it. **Zoom as needed**: fetch the full body of any related or closed ticket on demand; call the Skill tool for whichever skills the `## Notes` block names. If in doubt, call the Skill tool twice, for "grilling" and "domain-modeling".
4. **Reconcile while the ticket is still open.** Add newly surfaced tickets (create-then-wire), graduate any fog the answer has made specifiable, clear each graduated patch from **Not yet specified**, and update or close invalidated tickets. If the answer places work beyond the destination, rule it out of scope rather than recording it as a route decision.
5. **Publish closure last.** Post the answer as a resolution comment, append its context pointer to the map's Decisions-so-far, re-read the affected dependency/frontier state, and only then close the resolved ticket. Closing is the final publication step because it can unblock dependants.
6. **Resolve a completed map.** After the child closes, re-read every map child and the map's `Not yet specified` section. If no open child and no fog remain, post the destination outcome on the map, record that publishing any derived implementation breakdown still requires owner approval, and close the map. Otherwise keep the map open. An empty frontier alone is not completion when blocked/claimed children or fog remain.

Steps 4–6 are the canonical tracker-independent resolution state transition. Tracker configuration supplies the concrete comment, map-edit, and close commands; it must not redefine or reorder this transition.

The user may run unblocked tickets in parallel through the single root claim authority, so expect workers to edit disjoint artifacts concurrently while root retains claim, reconciliation, and closure writes.
