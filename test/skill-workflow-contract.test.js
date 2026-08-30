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
  const triage = await text('.agents/skills/triage/SKILL.md');

  assert.match(triage, /remove every configured workflow-state label/i);
  assert.match(triage, /apply exactly the selected target label/i);
  assert.match(triage, /verify that the target is the only configured workflow-state label/i);
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
