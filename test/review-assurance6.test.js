import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { submitDirectPreparedJob } from '../src/direct-ask.js';
import { preflightOpenCli } from '../src/opencli-transport.js';
import { prepareResearchJob } from '../src/prepare.js';
import { persistPreparedJob } from '../src/receipts.js';
import { createDispatchIntent, persistDispatchIntent, persistDispatchHandoff, persistCompletedResult, persistRecoveryRequiredResult } from '../src/dispatch-receipts.js';
import { loadPreparedBundle } from '../src/prepared-bundle.js';


const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const sha = (value) => createHash('sha256').update(Buffer.from(value)).digest('hex');

async function prepareWeb(root, jobId) {
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  await prepareResearchJob({
    request: { mode: 'web', mode_reason: 'explicit-web', question: 'assurance review', template_id: 'research-question', template_version: '1.0.0' },
    outputRoot,
    templatesRoot,
    now: '2026-08-26T23:54:00.000Z',
    newJobId: () => jobId,
    newTurnId: () => `turn_${jobId}`
  });
  return { outputRoot, jobRoot: join(outputRoot, 'jobs', jobId) };
}

async function writeOpenCli(path, conversationId = 'assurance-1') {
  await writeFile(path, `#!/usr/bin/env node\nif (process.argv[2] === '--version') console.log('1.8.7');\nelse console.log(JSON.stringify([{conversationId:'${conversationId}',conversationUrl:'https://chatgpt.com/c/${conversationId}',tool:'',response:'durable answer'}]));\n`, { mode: 0o700 });
}

test('REQ-DISPATCH-003 legacy receipt storage preserves accepted recovery after after-result-write fault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacy-receipt-fault-'));
  try {
    const { jobRoot, bundle, now, intent } = await historicalStorage(root);
    const saved = await persistDispatchIntent({ jobRoot, intent });
    const common = { jobRoot, bundle, now, intentSha256: saved.intent_sha256, conversationId: 'assurance-result-1', conversationUrl: 'https://chatgpt.com/c/assurance-result-1' };
    const handoff = await persistDispatchHandoff({ ...common, tool: '' });
    await assert.rejects(persistCompletedResult({ ...common, handoffSha256: handoff.handoff_sha256, answer: 'durable answer', testSeam: { failAt: 'after-result-write' } }), { code: 'ERR_INJECTED_FAULT' });
    await assert.rejects(stat(join(jobRoot, 'dispatch', 'result.json')), { code: 'ENOENT' });
    assert.equal(await readFile(join(jobRoot, 'dispatch', 'answer.md'), 'utf8'), 'durable answer');
    const result = await persistRecoveryRequiredResult({ ...common, handoffSha256: handoff.handoff_sha256, disposition: 'ERR_INJECTED_FAULT' });
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.remote_effect, 'accepted');
    assert.equal(result.process_disposition, 'ERR_INJECTED_FAULT');
    assert.equal(result.conversation_id, 'assurance-result-1');
    assert.equal(result.retry_decision, 'prohibited');
    assert.equal(result.intent_sha256, saved.intent_sha256);
    assert.equal(result.handoff_sha256, handoff.handoff_sha256);
    assert.deepEqual(JSON.parse(await readFile(join(jobRoot, 'dispatch', 'result.json'), 'utf8')), result);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('REQ-DISPATCH-003 Web direct ask preserves recovery when completed result fails after result bytes are written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-assurance6-direct-result-'));
  let detailCalls = 0;
  try {
    const { outputRoot, jobRoot } = await prepareWeb(root, 'job_assurance_direct_result');
    await assert.rejects(submitDirectPreparedJob({
      mode: 'web',
      outputRoot,
      jobId: 'job_assurance_direct_result',
      jobPath: jobRoot,
      openCliPath: '/tmp/opencli',
      now: () => '2026-08-26T23:59:00.000Z',
      preflight: async () => ({ version: '1.8.7' }),
      ask: async () => ({ conversationId: 'assurance-direct-result-1', conversationUrl: 'https://chatgpt.com/c/assurance-direct-result-1', tool: 'Web Search', response: '' }),
      readDetail: async () => { detailCalls += 1; return { response: 'durable direct answer' }; },
      receiptTestSeam: { failAt: 'after-direct-result-write' }
    }), { code: 'ERR_INJECTED_FAULT' });
    assert.equal(detailCalls, 3);
    const result = JSON.parse(await readFile(join(jobRoot, 'response', 'result.json'), 'utf8'));
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.process_disposition, 'ERR_INJECTED_FAULT');
    assert.equal(result.conversation_id, 'assurance-direct-result-1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-004 legacy intent storage removes failed publication and permits exclusive storage write', async () => {
  for (const failAt of ['after-dispatch-directory', 'after-dispatch-parent-sync']) {
    const root = await mkdtemp(join(tmpdir(), 'legacy-intent-storage-'));
    try {
      const { jobRoot, intent } = await historicalStorage(root);
      await assert.rejects(persistDispatchIntent({ jobRoot, intent, testSeam: { failAt } }), { code: 'ERR_INJECTED_FAULT' });
      await assert.rejects(stat(join(jobRoot, 'dispatch')), { code: 'ENOENT' });
      const saved = await persistDispatchIntent({ jobRoot, intent });
      assert.equal(saved.intent_sha256, sha(await readFile(saved.intent_path)));
      assert.deepEqual(JSON.parse(await readFile(saved.intent_path, 'utf8')), intent);
      // This is an exclusive storage write, never authorization to retry a provider operation.
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});


test('REQ-PREPARED-001 syncs output root after first jobs directory publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-assurance6-jobs-root-'));
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  try {
    const prompt = 'bounded prompt';
    const compiled = {
      prompt,
      template_id: 'research-question',
      template_version: '1.0.0',
      template_sha256: sha('template'),
      template_body_sha256: sha('template-body'),
      prompt_sha256: sha(prompt),
      mode: 'standard',
      mode_reason: 'default',
      rigor_protocol_id: 'chatgpt-research-epistemic',
      rigor_protocol_version: '1.0.0',
      rigor_profile_id: 'standard',
      rigor_profile_version: '1.0.0',
      rigor_profile_sha256: sha('rigor'),
      citation_level: 'principal',
      audit_appendix: false
    };
    await assert.rejects(persistPreparedJob({
      outputRoot,
      job: { job_id: 'job_parent_sync' },
      turn: { turn_id: 'turn_parent_sync' },
      compiled,
      now: '2026-08-27T00:04:00.000Z',
      testSeam: { failAt: 'after-jobs-root-parent-sync' }
    }), { code: 'ERR_INJECTED_FAULT' });
    assert.equal((await stat(join(outputRoot, 'jobs'))).isDirectory(), true);
    await assert.rejects(stat(join(outputRoot, 'jobs', 'job_parent_sync')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-OPENCLI-002 rejects oversized executable bytes before reading the executable', async (t) => {
  if (process.platform === 'win32') { t.skip('POSIX executable regression'); return; }
  const root = await mkdtemp(join(tmpdir(), 'review-assurance6-opencli-size-'));
  try {
    const opencli = join(root, 'opencli');
    await writeFile(opencli, '#!/usr/bin/env node\n');
    await truncate(opencli, (16 * 1024 * 1024) + 1);
    await chmod(opencli, 0o700);
    await assert.rejects(preflightOpenCli({ executablePath: opencli }), { code: 'ERR_OPENCLI_EXECUTABLE_LIMIT' });
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
