---
name: wayfinder
description: Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
---

A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on the repo's issue tracker, then works its **decision tickets** (questions whose resolution is a decision, not slices of a build to execute) one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting: it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic: engineering work, course content, whatever fits the shape.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear, with nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes**, carrying execution into the map itself, but absent that, produce decisions, not deliverables.

When this skill names another installed skill, apply it through the current harness's supported skill mechanism. If that surface has no explicit skill-invocation tool, read and follow the named skill's `SKILL.md` directly. Never assume a tool literally named `Skill` exists.

## Refer by name

Every map and ticket is an issue, so it has a **name**: its title. In everything the human reads (narration, the map's Decisions-so-far), refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish; a name wraps its link, but they ride _inside_ the name, never stand in for it.

## The Map

The map is a single issue on this repo's issue tracker, labelled `wayfinder:map`, the canonical artifact. Its tickets are child issues of the map.

The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place, its ticket, so the map never restates it, only gists it and links.

Child publication is a recoverable state transition, not a single create call. Write the tracker-defined durable parent marker or canonical local placement when the child is created, then attach it through the native relationship or fallback index and verify that relationship. If the second step fails, the marker or placement is recovery evidence: before deriving a frontier or closing a map, enumerate those candidates and repair or explicitly disposition every child missing from the canonical inventory. Never infer a complete frontier or completed map while that reconciliation is incomplete.

Map publication is recoverable too. Derive `Map publication key: <effort-id>/<normalized-destination-digest>` and persist it in the map body. Reconcile the complete open-and-closed map inventory by destination digest before permitting map creation: **zero active matches and no closed candidate** permits one first-effort create, **one active match** resumes that exact map from its observed stage, and **multiple active matches** stops for explicit duplicate disposition. Also reject multiple exact full-key matches. A one-match recovery reconciles the map body, child publication, and current state; it never creates a replacement because identity retention or later child publication failed. When there is no active match but a closed match exists, require explicit resume-versus-new-effort disposition. If the result is a new effort, generate a fresh stable effort ID before any create and retain the destination digest; this gives the new generation a distinct key while leaving the prior closed map discoverable. A materially redrawn destination instead receives its own digest.

**Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific.** The issue tracker must have been provided to you. A missing tracker contract is a blocking prerequisite: tell the user to run `/setup-matt-pocock-skills` and stop before creating or mutating a map. Consult the configured tracker doc's "Wayfinding operations" section for how _this_ repo expresses them. Do not default to Local Markdown; that backend must be an explicit configured choice.

### The map body

The whole map at low resolution, loaded once per session. Open tickets are normally **not** listed: they are open child issues, found by query. When the configured tracker lacks a complete native child relationship, the map instead carries the tracker-defined fallback child index below so later sessions can enumerate every child.

```markdown
Map publication key: <effort-id>/<normalized-destination-digest>

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

## Child tickets (fallback only)

<!-- Include only when the tracker configuration requires it. Maintain the complete tracker-defined child index here; omit this section when native child enumeration is available. -->
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

A ticket is visibly **claimed** through the configured tracker's durable claimant operation: a real tracker uses its assignee; Local Markdown records the configured stable claimant identity and claim time in the file. An assignee or claimant field is availability state, not a concurrency mutex. Exactly one root orchestrator is the claim authority for a map. Delegated AFK work serializes `re-read frontier -> verify execution contract -> persist pre-dispatch run record -> assign -> verify assignment -> dispatch once -> persist task locator`. The pre-dispatch record carries the stable run ID, `claiming` state, and no task locator; workers receive an already-claimed ticket and never self-assign. HITL work instead serializes `re-read frontier -> verify execution contract -> persist and verify claimant identity -> begin live exchange`; it has no delegated run record, dispatch, or task locator. Do not run independent root claimers against the same map. If a single claim authority cannot be established, stop rather than start duplicate work.

For delegated work, if assignment or dispatch fails, root records the observed boundary. A claim proven not dispatched is unassigned and returned to the frontier after its run is dispositioned; a claim whose dispatch may have occurred stays assigned and is investigated without resubmission. Later sessions reconcile assigned delegated children and `claiming` records even when no task locator was persisted, so no-locator claims cannot disappear from recovery. An unfinished HITL claim remains assigned for the live owner/root to resume or explicitly disposition; never force it through delegated recovery.

Blocking uses the tracker's **native** dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children, the edge of the known.

The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in. Before closure, every primary artifact must have a verified durable locator: publish repository files through the authorized version-control destination, publish a prototype's throwaway commit to its approved durable ref, or use an explicitly approved tracker attachment. A local worktree path or unpushed branch is not durable evidence. If publication lacks authority or has not completed, keep the ticket assigned and open with that prerequisite recorded.

## Ticket Types

Every ticket is either **HITL** (human in the loop, worked _with_ a human who speaks for themselves) or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that applies the installed `research` skill through its supported harness mechanism. Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by applying the installed `prototype` skill. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation. The default case. Always apply both installed `grilling` and `domain-modeling` skills.
- **Task** (HITL or AFK): Manual work that must happen before a _decision_ can be made: nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that _does_ rather than decides, and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the public answer records only non-secret access status, an explicitly approved opaque owner-held reference, and safe result facts such as public URLs or row counts. Never publish credential locations, account identifiers, vault paths, secret-store metadata, challenge values, or access URLs that disclose private operational state.

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

1. **Name the destination.** Apply the installed `grilling` and `domain-modeling` skills through the supported harness mechanism to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. Fog and unresolved decisions are independent: several sharp tickets can exist with no fog. Skip the map only when there are no unresolved decisions, or when every unresolved decision fits one session and no shared graph or resumption point is needed. Then stop and ask the user how they'd like to proceed.
3. **Create or recover the map** (label `wayfinder:map`): compute the destination digest and perform the tracker-defined active-generation and exact-key reconciliation before any create. Create once only when no active match exists. On one active match, resume the observed map and verify its identity/state instead of replacing it. When the user explicitly starts a new effort after a closed match, generate the fresh effort ID before creation. Then ensure Destination and Notes are filled in, Decisions-so-far is initially empty for a new map, and the fog is sketched into **Not yet specified**.
4. **Create the tickets you can specify now** as child issues of the map. Populate the repository's complete ticket execution contract and durable parent marker or canonical local placement on every ticket at creation, regardless of type; for HITL work, record the human/root route explicitly rather than inventing an agent route. Attach or index each child through the configured tracker operation and verify it before continuing. A partial create/attach transition remains held for reconciliation, not ignored or recreated. If a contract field cannot yet be supplied, set `Contract status: needs-clarification` and exclude the child from the frontier until the contract is completed. Then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Wiring sorts contract-complete children into the frontier and the blocked; everything you can't yet specify stays in the fog: the **Not yet specified** section.
5. **Launch the research frontier.** The root claim authority re-reads the wired dependency state and selects only open, unassigned `research` tickets with no open blocker. Launch no more than the remaining wave capacity. Before each launch, add or verify the repository's ticket execution contract, including one owned output path and the route fit; persist the stable run ID in a `claiming` pre-dispatch record, assign and verify the ticket, dispatch exactly once, then persist the task/return locator and `dispatched` state. If the transition fails, apply the known-unsent versus possibly-dispatched recovery rule above. The subagent applies the installed `research` skill through its supported harness mechanism and works only in its isolated owned branch/worktree and output path. Blocked, contract-incomplete, or unverifiably claimed tickets remain unlaunched.
6. **Register collection.** Every launched run must have a supported return path: use the harness's task waiter/wakeup when available, or persist a resumable task locator that a later Wayfinder session can inspect. A later session first reconciles every assigned child and every `claiming` record, including assigned claims with no locator; it collects completed research, validates the ticket-owned artifact, leaves confirmed in-progress work claimed, returns provably undispatched work to the frontier after disposition, and holds possibly-dispatched work for investigation without resubmission. A successfully collected result remains assigned, is published to its authorized durable destination and verified there, then moves directly into root reconciliation and the canonical publish-then-close transition; it is never returned to selection or resubmitted. Missing publication authority or an incomplete publication keeps the ticket open and assigned. Never abandon an assigned research ticket merely because charting stops.
7. Stop: charting is one session's work; it hand-resolves nothing unless a launched research result has returned and passed collection.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional**: without one, you pick the next decision, not the user.

1. Load the **map**: the low-res view, not every ticket body. First reconcile partial child publication from the tracker-defined parent markers or canonical local placement so every created child is attached, indexed, or explicitly dispositioned. Then reconcile assigned delegated children and pre-dispatch records, including claims with no task locator. Collect and validate completed artifacts; for each success, keep the ticket assigned to root, publish and verify every primary artifact at its authorized durable destination, then immediately perform steps 3–5 to reconcile its finding, publish the resolution, update the map and dependencies, and close the child last. If artifact publication lacks authority or remains incomplete, record the prerequisite and leave the ticket assigned and open. Complete every otherwise-unblocked closure before selecting new work. Leave confirmed in-progress work claimed, return provably undispatched work to the frontier after disposition, and hold possibly-dispatched work for investigation without resubmission. Preserve unfinished HITL claims for the live owner/root to resume or explicitly disposition.
2. Choose or resume the ticket only after the completed-result closure queue is empty. A new selection must be open, unblocked, unassigned, and contract-complete. An authorized HITL resume may instead be open, unblocked, contract-complete, and already assigned to the same live owner/root; verify that identity and resume without reassigning. A named ticket bypasses no gate except this explicit same-owner HITL resume case. Delegated assigned tickets stay in collection/recovery; a successfully collected one already entered root closure in step 1 and never enters this selection or HITL-resume path. For new delegated AFK work, root persists the pre-dispatch run record before assignment, verifies the assignment, dispatches once, and persists the task locator; failures use the delegated recovery rule. For new HITL work, root assigns and verifies the live owner/root, then begins the exchange without a run record, dispatch, or locator.
3. Resolve it. **Zoom as needed**: fetch the full body of any related or closed ticket on demand; apply whichever installed skills the `## Notes` block names through the supported harness mechanism. If in doubt, apply both `grilling` and `domain-modeling`.
4. **Reconcile while the ticket is still open.** Add newly surfaced tickets through the recoverable create-attach/index-verify transition, graduate any fog the answer has made specifiable, clear each graduated patch from **Not yet specified**, and update or close invalidated tickets. If the answer places work beyond the destination, rule it out of scope rather than recording it as a route decision.
5. **Publish closure last.** Verify every primary artifact at its durable locator before posting the answer; a local path or unpublished branch blocks closure. Post the answer as a resolution comment. For a route decision, append its context pointer to the map's Decisions-so-far; for an out-of-scope disposition, link it only under Out of scope and do not add it to the decision index. Re-read the affected dependency/frontier state, and only then close the resolved ticket. Closing is the final publication step because it can unblock dependants.
6. **Resolve a completed map.** After the child closes, reconcile partial child publication again, then re-read every map child and the map's `Not yet specified` section. If no undispositioned publication candidate, open child, or fog remains, post the destination outcome on the map, record that publishing any derived implementation breakdown still requires owner approval, and close the map. Otherwise keep the map open. An empty frontier alone is not completion when publication recovery, blocked/claimed children, or fog remain.

Steps 4–6 are the canonical tracker-independent resolution state transition. Tracker configuration supplies the concrete comment, map-edit, and close commands; it must not redefine or reorder this transition.

The user may run unblocked tickets in parallel through the single root claim authority, so expect workers to edit disjoint artifacts concurrently while root retains claim, reconciliation, and closure writes.
