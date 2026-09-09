import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';
import { directAsk, submitDirectPreparedJob } from '../src/direct-ask.js';
import { createDispatchIntent, persistDispatchIntent, persistDispatchHandoff, persistCompletedResult, persistRecoveryRequiredResult } from '../src/dispatch-receipts.js';
import { loadPreparedBundle } from '../src/prepared-bundle.js';

import { prepareResearchJob } from '../src/prepare.js';
import { persistPreparedJob } from '../src/receipts.js';


const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const dispatchBundle = Object.freeze({
  job_id: 'job_review',
  turn_id: 'turn_review',
  template_id: 'research-question',
  template_version: '1.0.0',
  template_sha256: 'a'.repeat(64),
  template_body_sha256: 'b'.repeat(64),
  mode: 'standard',
  mode_reason: 'default',
  prompt_sha256: 'c'.repeat(64),
  rigor_protocol_id: 'chatgpt-research-epistemic',
  rigor_protocol_version: '1.0.0',
  rigor_profile_id: 'standard',
  rigor_profile_version: '1.0.0',
  rigor_profile_sha256: 'd'.repeat(64),
  citation_level: 'principal',
  audit_appendix: false
});
const dispatchExecutable = Object.freeze({ supplied_path: '/tmp/opencli', real_path: '/tmp/opencli', sha256: 'e'.repeat(64), size: 123, device: '1', inode: '2', version: '1.8.7' });

test('REQ-CLI-001 rejects a relative prepare output root at the CLI boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-hardening-cli-'));
  const requestPath = join(root, 'request.json');
  await writeFile(requestPath, JSON.stringify({ question: 'x', template_id: 'research-question', template_version: '1.0.0' }));
  try {
    await assert.rejects(
      runCli(['prepare', '--request', requestPath, '--output-root', './out'], { stdout: { write() { throw new Error('unexpected stdout'); } } }),
      { code: 'ERR_CLI_USAGE' }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-PREPARED-001 syncs the jobs directory after publishing a prepared job', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'review-hardening-receipt-'));
  const prompt = 'prepared prompt\n';
  const compiled = {
    prompt,
    prompt_sha256: createHash('sha256').update(prompt).digest('hex'),
    template_id: 'research-question',
    template_version: '1.0.0',
    template_sha256: 'b'.repeat(64),
    template_body_sha256: 'c'.repeat(64),
    mode: 'standard',
    mode_reason: 'default',
    rigor_protocol_id: 'chatgpt-research-epistemic',
    rigor_protocol_version: '1.0.0',
    rigor_profile_id: 'standard',
    rigor_profile_version: '1.0.0',
    rigor_profile_sha256: 'd'.repeat(64),
    citation_level: 'principal',
    audit_appendix: false
  };
  try {
    await assert.rejects(
      persistPreparedJob({
        outputRoot,
        job: { job_id: 'job_sync' },
        turn: { turn_id: 'turn_sync' },
        compiled,
        now: '2026-08-26T17:30:00.000Z',
        testSeam: { failAt: 'after-jobs-directory-sync' }
      }),
      { code: 'ERR_INJECTED_FAULT' }
    );
    const current = JSON.parse(await readFile(join(outputRoot, 'jobs', 'job_sync', 'current.json'), 'utf8'));
    assert.equal(current.turn.transport_status, 'not_dispatched');
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-004 failed intent publication does not publish or wedge the dispatch slot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-hardening-dispatch-'));
  const jobRoot = join(root, 'job');
  await mkdir(jobRoot);
  const intent = createDispatchIntent({ bundle: dispatchBundle, executable: dispatchExecutable, now: '2026-08-26T17:31:00.000Z' });
  try {
    await assert.rejects(persistDispatchIntent({ jobRoot, intent, testSeam: { failAt: 'after-intent-write' } }), { code: 'ERR_INJECTED_FAULT' });
    await assert.rejects(stat(join(jobRoot, 'dispatch')), { code: 'ENOENT' });
    const saved = await persistDispatchIntent({ jobRoot, intent });
    assert.match(saved.intent_sha256, /^[0-9a-f]{64}$/);
    assert.equal((await stat(join(jobRoot, 'dispatch'))).isDirectory(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-002 Web persists direct intent before ask and provider handoff before collection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-hardening-handoff-'));
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  const jobPath = join(outputRoot, 'jobs', 'job_handoff');
  let askCalls = 0;
  try {
    await assert.rejects(
      directAsk({
        mode: 'web', question: 'preserve handoff',
        outputRoot,
        openCliPath: '/tmp/opencli',
        templatesRoot,
        clock: () => '2026-08-26T17:32:00.000Z',
        newJobId: () => 'job_handoff',
        newTurnId: () => 'turn_handoff',
        submit: (options) => submitDirectPreparedJob({
          ...options,
          preflight: async () => ({ version: '1.8.7' }),
          ask: async () => {
            askCalls += 1;
            const intent = JSON.parse(await readFile(join(jobPath, 'response', 'intent.json'), 'utf8'));
            assert.equal(intent.job_id, 'job_handoff');
            assert.equal(intent.mode, 'web');
            return { conversationId: 'handoff-1', conversationUrl: 'https://chatgpt.com/c/handoff-1', tool: 'Web Search', response: '' };
          },
          readDetail: async () => { const persisted = JSON.parse(await readFile(join(jobPath, 'response', 'handoff.json'), 'utf8')); assert.equal(persisted.status, 'accepted'); assert.equal(persisted.conversation_id, 'handoff-1'); const error = new Error('reader failed after provider handoff'); error.code = 'ERR_TEST_READ'; throw error; }
        })
      }),
      { code: 'ERR_TEST_READ' }
    );
    assert.equal(askCalls, 1);
    const handoff = JSON.parse(await readFile(join(jobPath, 'response', 'handoff.json'), 'utf8'));
    assert.equal(handoff.conversation_id, 'handoff-1');
    assert.equal(handoff.conversation_url, 'https://chatgpt.com/c/handoff-1');
    assert.equal(handoff.status, 'accepted');
    const recovery = JSON.parse(await readFile(join(jobPath, 'response', 'result.json'), 'utf8'));
    assert.equal(recovery.status, 'recovery_required');
    assert.equal(recovery.conversation_id, 'handoff-1');
    assert.equal(recovery.retry_decision, 'prohibited');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-006 legacy receipt persistence links accepted handoff to recovery with prohibited retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacy-recovery-storage-'));
  try {
    const { jobRoot, bundle, now, intent } = await historicalStorage(root);
    const saved = await persistDispatchIntent({ jobRoot, intent });
    const common = { jobRoot, bundle, now, intentSha256: saved.intent_sha256, conversationId: 'blank-1', conversationUrl: 'https://chatgpt.com/c/blank-1' };
    const handoff = await persistDispatchHandoff({ ...common, tool: '' });
    const result = await persistRecoveryRequiredResult({ ...common, handoffSha256: handoff.handoff_sha256, disposition: 'ERR_OPENCLI_OUTPUT' });
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.process_disposition, 'ERR_OPENCLI_OUTPUT');
    assert.equal(result.remote_effect, 'accepted');
    assert.equal(result.conversation_id, 'blank-1');
    assert.equal(result.retry_decision, 'prohibited');
    assert.equal(result.intent_sha256, createHash('sha256').update(await readFile(saved.intent_path)).digest('hex'));
    assert.equal(result.handoff_sha256, createHash('sha256').update(await readFile(handoff.handoff_path)).digest('hex'));
    assert.deepEqual(JSON.parse(await readFile(join(jobRoot, 'dispatch', 'result.json'), 'utf8')), result);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('REQ-DISPATCH-006 Web direct ask failure after durable intent records ambiguous effect without retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-hardening-direct-ambiguous-'));
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  const jobPath = join(outputRoot, 'jobs', 'job_direct_ambiguous');
  let askCalls = 0;
  try {
    const outcome = await directAsk({
      mode: 'web', question: 'classify ambiguous send',
      outputRoot,
      openCliPath: '/tmp/opencli',
      templatesRoot,
      clock: () => '2026-08-26T17:36:00.000Z',
      newJobId: () => 'job_direct_ambiguous',
      newTurnId: () => 'turn_direct_ambiguous',
      submit: (options) => submitDirectPreparedJob({
        ...options,
        preflight: async () => ({ version: '1.8.7' }),
        ask: async () => { askCalls += 1; const error = new Error('ambiguous transport'); error.code = 'ERR_OPENCLI_TIMEOUT'; throw error; }
      })
    });
    assert.equal(askCalls, 1);
    assert.equal(outcome.result.status, 'ambiguous_effect');
    assert.equal(outcome.result.process_disposition, 'ERR_OPENCLI_TIMEOUT');
    assert.equal(outcome.result.retry_decision, 'prohibited');
    assert.equal(outcome.result.conversation_id, null);
    await assert.rejects(readFile(join(jobPath, 'response', 'handoff.json')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Synthetic historical receipt construction on exact frozen v1 preparation; no transport.
async function historicalStorage(root) {
  const outputRoot = join(root, 'historical');
  const jobRoot = join(outputRoot, 'jobs', 'job_legacy_standard');
  await mkdir(jobRoot, { recursive: true });
  for (const name of ['current.json', 'events.jsonl', 'prompt.txt']) await writeFile(join(jobRoot, name), await readFile(new URL(`./fixtures/standard-prepared-v1/${name}`, import.meta.url)));
  const bundle = await loadPreparedBundle({ outputRoot, jobId: 'job_legacy_standard' });
  const now = '2026-08-26T23:10:00.000Z';
  const executable = { supplied_path: '/tmp/historical-opencli', real_path: '/tmp/historical-opencli', sha256: 'e'.repeat(64), size: 123, device: '1', inode: '2', version: '1.8.7' };
  const intent = createDispatchIntent({ bundle, executable, now });
  return { jobRoot, bundle, now, intent };
}
