import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('local Markdown defines one canonical pre-brief category slot', async () => {
  const [tracker, producer] = await Promise.all([
    text('.agents/skills/setup-matt-pocock-skills/issue-tracker-local.md'),
    text('.agents/skills/to-spec/SKILL.md'),
  ]);

  assert.match(tracker, /canonical pre-brief category/i);
  assert.match(tracker, /immediately after the plain `Status:` field/i);
  assert.match(tracker, /remove the standalone pre-brief field/i);
  assert.match(producer, /omit the template's body-level category field/i);
});

test('custom tracker setup requires every exhaustive triage query', async () => {
  const setup = await text('.agents/skills/setup-matt-pocock-skills/SKILL.md');

  assert.match(setup, /exhaustive missing-state inventory/i);
  assert.match(setup, /oldest-first ordering/i);
  assert.match(setup, /reporter activity after the latest `needs-info`/i);
});

test('every triage outcome replaces and verifies the workflow state', async () => {
  const [triage, localTracker] = await Promise.all([
    text('.agents/skills/triage/SKILL.md'),
    text('.agents/skills/setup-matt-pocock-skills/issue-tracker-local.md'),
  ]);

  assert.match(triage, /configured state-replacement operation/i);
  assert.match(triage, /real tracker[\s\S]*remove every configured workflow-state label/i);
  assert.match(localTracker, /replaces? the plain `Status:` field/i);
  assert.match(localTracker, /re-reads? it and verifies?/i);
});

test('setup reruns recognize the canonical and legacy triage headings', async () => {
  const setup = await text('.agents/skills/setup-matt-pocock-skills/SKILL.md');

  assert.match(setup, /recognize both `### Triage metadata` and the legacy `### Triage labels`/i);
  assert.match(setup, /emit `### Triage metadata` for new blocks/i);
});

test('Wayfinder blocks when the tracker contract is missing', async () => {
  const wayfinder = await text('.agents/skills/wayfinder/SKILL.md');

  assert.match(wayfinder, /missing tracker contract is a blocking prerequisite/i);
  assert.match(wayfinder, /do not default to Local Markdown/i);
});

test('Local Markdown needs-info notes do not duplicate the canonical category', async () => {
  const triage = await text('.agents/skills/triage/SKILL.md');

  assert.match(triage, /For Local Markdown, retain the standalone canonical category/i);
  assert.match(triage, /omit the `\*\*Category:\*\*` line from the appended needs-info notes/i);
});

test('the GitLab tracker offers only the fully defined issue-map contract', async () => {
  const tracker = await text('.agents/skills/setup-matt-pocock-skills/issue-tracker-gitlab.md');

  assert.doesNotMatch(tracker, /epic may hold the map/i);
  assert.match(tracker, /map is always an issue/i);
});

test('the GitHub issue reader selects JSON fields before jq filtering', async () => {
  const tracker = await text('.agents/skills/setup-matt-pocock-skills/issue-tracker-github.md');

  assert.match(tracker, /gh issue view <number> --json [^\n]*comments[^\n]*labels[^\n]* --jq/i);
});

test('canonical real-tracker briefs require a trusted verified producer', async () => {
  const [brief, policy, tracker] = await Promise.all([
    text('.agents/skills/triage/AGENT-BRIEF.md'),
    text('docs/REVIEW-POLICY.md'),
    text('docs/agents/issue-tracker.md'),
  ]);

  assert.match(brief, /trusted triage producer/i);
  assert.match(policy, /latest verified canonical Agent Brief[\s\S]*trusted triage producer/i);
  assert.match(tracker, /Trusted triage producer:[\s\S]*`rookslog`/i);
});

test('implementation-ticket publication resumes from a stable key', async () => {
  const tickets = await text('.agents/skills/to-tickets/SKILL.md');

  assert.match(tickets, /Ticket publication key:/i);
  assert.match(tickets, /zero matches[\s\S]*one match[\s\S]*multiple matches/i);
  assert.match(tickets, /resume the existing issue[\s\S]*Agent Brief[\s\S]*ready state/i);
});

test('Local Markdown HITL claims persist a stable claimant identity', async () => {
  const tracker = await text('.agents/skills/setup-matt-pocock-skills/issue-tracker-local.md');

  assert.match(tracker, /Claimant: <configured stable claimant identity>/i);
  assert.match(tracker, /verify the same claimant before HITL resume/i);
});

test('ticketless delegated research persists a recoverable run before dispatch', async () => {
  const [research, orchestration] = await Promise.all([
    text('.agents/skills/research/SKILL.md'),
    text('docs/agents/orchestration.md'),
  ]);

  assert.match(research, /docs\/research\/runs\/<run-id>\.md/i);
  assert.match(orchestration, /stable run ID[\s\S]*`claiming`[\s\S]*before\s+dispatch/i);
  assert.match(orchestration, /possibly-dispatched[\s\S]*without resubmission/i);
});

test('ready-for-human is included in maintainer attention discovery', async () => {
  const triage = await text('.agents/skills/triage/SKILL.md');

  assert.match(triage, /4\. \*\*`ready-for-human`\*\*/i);
});

test('built-in trackers define a durable implementation-ticket lifecycle', async () => {
  const [tracker, github, gitlab] = await Promise.all([
    text('.agents/skills/setup-matt-pocock-skills/issue-tracker-local.md'),
    text('.agents/skills/setup-matt-pocock-skills/issue-tracker-github.md'),
    text('.agents/skills/setup-matt-pocock-skills/issue-tracker-gitlab.md'),
  ]);

  assert.match(tracker, /Execution status: unclaimed \| claimed \| completed/i);
  assert.match(tracker, /implementation-ticket claim[\s\S]*Claimant:[\s\S]*Claimed at:/i);
  assert.match(tracker, /implementation-ticket completion[\s\S]*final durable transition/i);
  assert.match(tracker, /blocker[\s\S]*`Execution status: completed`/i);
  assert.match(github, /ordinary implementation ticket[\s\S]*close the issue as the final durable transition/i);
  assert.match(gitlab, /ordinary implementation ticket[\s\S]*close the issue as the final durable transition/i);
});

test('Local Markdown ticket publication reconciles before any write', async () => {
  const tickets = await text('.agents/skills/to-tickets/SKILL.md');

  assert.match(tickets, /Local Markdown[\s\S]*Ticket publication key:/i);
  assert.match(tickets, /inventory[\s\S]*zero matches[\s\S]*one match[\s\S]*multiple matches/i);
  assert.match(tickets, /never (?:implicitly )?(?:overwrite|replace)/i);
});

test('ticket publication keys bind the complete approved breakdown', async () => {
  const tickets = await text('.agents/skills/to-tickets/SKILL.md');

  assert.match(tickets, /source identity[\s\S]*approved-breakdown digest[\s\S]*approved ordinal/i);
  assert.match(tickets, /source reference[\s\S]*does not replace the breakdown digest/i);
});

test('real-tracker spec publication resumes from a stable key', async () => {
  const spec = await text('.agents/skills/to-spec/SKILL.md');

  assert.match(spec, /Spec publication key:/i);
  assert.match(spec, /zero matches[\s\S]*one match[\s\S]*multiple matches/i);
  assert.match(spec, /resume[\s\S]*category[\s\S]*`needs-triage`/i);
});

test('Wayfinder reconciles a keyed map before creation', async () => {
  const wayfinder = await text('.agents/skills/wayfinder/SKILL.md');

  assert.match(wayfinder, /Map publication key:/i);
  assert.match(wayfinder, /zero matches[\s\S]*one match[\s\S]*multiple matches/i);
  assert.match(wayfinder, /before (?:permitting )?(?:a )?map creat/i);
});

test('ticket publication permits only the approved parent relationship mutation', async () => {
  const tickets = await text('.agents/skills/to-tickets/SKILL.md');

  assert.match(tickets, /permit[\s\S]*approved parent[\s\S]*relationship/i);
  assert.match(tickets, /do not[\s\S]*unrelated parent[\s\S]*(?:body|state|closure)/i);
  assert.doesNotMatch(tickets, /Do NOT close or modify any parent issue\./i);
});

test('Local Markdown replaces the canonical brief as a singleton', async () => {
  const [tracker, triage] = await Promise.all([
    text('.agents/skills/setup-matt-pocock-skills/issue-tracker-local.md'),
    text('.agents/skills/triage/SKILL.md'),
  ]);

  assert.match(tracker, /replace[\s\S]*embedded `## Agent Brief`[\s\S]*exactly one/i);
  assert.match(triage, /Local Markdown[\s\S]*replace[\s\S]*existing embedded brief[\s\S]*exactly one/i);
});

test('ready-for-human uses the same authoritative brief source as ready-for-agent', async () => {
  const [brief, policy] = await Promise.all([
    text('.agents/skills/triage/AGENT-BRIEF.md'),
    text('docs/REVIEW-POLICY.md'),
  ]);

  assert.match(brief, /`ready-for-agent` or `ready-for-human`/i);
  assert.match(policy, /`ready-for-agent` or `ready-for-human`[\s\S]*latest verified canonical Agent Brief/i);
});

test('direct research establishes a root-owned output without inventing a ticket', async () => {
  const research = await text('.agents/skills/research/SKILL.md');

  assert.match(research, /direct root invocation/i);
  assert.match(research, /docs\/research\/<YYYY-MM-DD>-<slug>\.md/i);
  assert.match(research, /do not invent a ticket/i);
});
