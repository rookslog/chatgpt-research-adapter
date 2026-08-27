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
import { submitPreparedJobOnce } from '../src/submit-once.js';

const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const sha = (value) => createHash('sha256').update(Buffer.from(value)).digest('hex');

async function prepareStandard(root, jobId) {
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  await prepareResearchJob({
    request: { question: 'assurance review', template_id: 'research-question', template_version: '1.0.0' },
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

test('REQ-DISPATCH-003 submit-once recovers when completed result fails after result bytes are written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-assurance6-result-'));
  try {
    const { outputRoot, jobRoot } = await prepareStandard(root, 'job_assurance_result');
    const opencli = join(root, 'opencli');
    await writeOpenCli(opencli, 'assurance-result-1');
    const result = await submitPreparedJobOnce({
      outputRoot,
      jobId: 'job_assurance_result',
      openCliPath: opencli,
      now: (() => { const values = ['2026-08-26T23:55:00.000Z', '2026-08-26T23:56:00.000Z', '2026-08-26T23:57:00.000Z', '2026-08-26T23:58:00.000Z']; return () => values.shift(); })(),
      receiptTestSeam: { failAt: 'after-result-write' }
    });
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.process_disposition, 'ERR_INJECTED_FAULT');
    assert.equal(result.conversation_id, 'assurance-result-1');
    assert.equal(JSON.parse(await readFile(join(jobRoot, 'dispatch', 'result.json'), 'utf8')).status, 'recovery_required');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-003 direct ask preserves recovery when completed result fails after result bytes are written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-assurance6-direct-result-'));
  try {
    const { outputRoot, jobRoot } = await prepareStandard(root, 'job_assurance_direct_result');
    await assert.rejects(submitDirectPreparedJob({
      mode: 'standard',
      outputRoot,
      jobId: 'job_assurance_direct_result',
      jobPath: jobRoot,
      openCliPath: '/tmp/opencli',
      now: () => '2026-08-26T23:59:00.000Z',
      preflight: async () => ({ version: '1.8.7' }),
      ask: async () => ({ conversationId: 'assurance-direct-result-1', conversationUrl: 'https://chatgpt.com/c/assurance-direct-result-1', tool: '', response: '' }),
      readDetail: async () => ({ response: 'durable direct answer' }),
      receiptTestSeam: { failAt: 'after-direct-result-write' }
    }), { code: 'ERR_INJECTED_FAULT' });
    const result = JSON.parse(await readFile(join(jobRoot, 'response', 'result.json'), 'utf8'));
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.process_disposition, 'ERR_INJECTED_FAULT');
    assert.equal(result.conversation_id, 'assurance-direct-result-1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-004 post-rename intent failure does not wedge a known-unsent submit', async () => {
  for (const failAt of ['after-dispatch-directory', 'after-dispatch-parent-sync']) {
    const root = await mkdtemp(join(tmpdir(), 'review-assurance6-intent-'));
    try {
      const jobId = `job_${failAt.replaceAll('-', '_')}`;
      const { outputRoot, jobRoot } = await prepareStandard(root, jobId);
      const opencli = join(root, 'opencli');
      await writeOpenCli(opencli, `assurance-${failAt.replaceAll('-', '_')}`);
      await assert.rejects(submitPreparedJobOnce({
        outputRoot,
        jobId,
        openCliPath: opencli,
        now: () => '2026-08-27T00:00:00.000Z',
        receiptTestSeam: { failAt }
      }), { code: 'ERR_INJECTED_FAULT' });
      await assert.rejects(stat(join(jobRoot, 'dispatch')), { code: 'ENOENT' });
      const result = await submitPreparedJobOnce({
        outputRoot,
        jobId,
        openCliPath: opencli,
        now: (() => { const values = ['2026-08-27T00:01:00.000Z', '2026-08-27T00:02:00.000Z', '2026-08-27T00:03:00.000Z']; return () => values.shift(); })()
      });
      assert.equal(result.status, 'completed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
