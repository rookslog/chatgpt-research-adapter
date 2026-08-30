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

test('ready-for-human uses the same authoritative brief source as ready-for-agent', async () => {
  const [brief, policy] = await Promise.all([
    text('.agents/skills/triage/AGENT-BRIEF.md'),
    text('docs/REVIEW-POLICY.md'),
  ]);

  assert.match(brief, /`ready-for-agent` or `ready-for-human`/i);
  assert.match(policy, /`ready-for-agent` or `ready-for-human`[\s\S]*latest canonical Agent Brief/i);
});

test('direct research establishes a root-owned output without inventing a ticket', async () => {
  const research = await text('.agents/skills/research/SKILL.md');

  assert.match(research, /direct root invocation/i);
  assert.match(research, /docs\/research\/<YYYY-MM-DD>-<slug>\.md/i);
  assert.match(research, /do not invent a ticket/i);
});
