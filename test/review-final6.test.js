import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { submitDirectPreparedJob } from '../src/direct-ask.js';
import { preflightOpenCli } from '../src/opencli-transport.js';
import { prepareResearchJob } from '../src/prepare.js';
import { createDispatchIntent, persistDispatchIntent, persistDispatchHandoff, persistCompletedResult, persistRecoveryRequiredResult } from '../src/dispatch-receipts.js';
import { loadPreparedBundle } from '../src/prepared-bundle.js';


const templatesRoot = new URL('../templates/', import.meta.url).pathname;

function completedChild(stdout) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  queueMicrotask(() => {
    child.stdout.end(stdout);
    child.stderr.end();
    child.emit('close', 0, null);
  });
  return child;
}

async function prepareWeb(root, jobId) {
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  await prepareResearchJob({
    request: { mode: 'web', mode_reason: 'explicit-web', question: 'final review', template_id: 'research-question', template_version: '1.0.0' },
    outputRoot,
    templatesRoot,
    now: '2026-08-26T23:10:00.000Z',
    newJobId: () => jobId,
    newTurnId: () => `turn_${jobId}`
  });
  return { outputRoot, jobRoot: join(outputRoot, 'jobs', jobId) };
}

test('REQ-DISPATCH-003 legacy receipt storage preserves accepted recovery after after-answer-directory-sync fault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacy-receipt-fault-'));
  try {
    const { jobRoot, bundle, now, intent } = await historicalStorage(root);
    const saved = await persistDispatchIntent({ jobRoot, intent });
    const common = { jobRoot, bundle, now, intentSha256: saved.intent_sha256, conversationId: 'final-complete-1', conversationUrl: 'https://chatgpt.com/c/final-complete-1' };
    const handoff = await persistDispatchHandoff({ ...common, tool: '' });
    await assert.rejects(persistCompletedResult({ ...common, handoffSha256: handoff.handoff_sha256, answer: 'durable answer', testSeam: { failAt: 'after-answer-directory-sync' } }), { code: 'ERR_INJECTED_FAULT' });
    await assert.rejects(stat(join(jobRoot, 'dispatch', 'result.json')), { code: 'ENOENT' });
    assert.equal(await readFile(join(jobRoot, 'dispatch', 'answer.md'), 'utf8'), 'durable answer');
    const result = await persistRecoveryRequiredResult({ ...common, handoffSha256: handoff.handoff_sha256, disposition: 'ERR_INJECTED_FAULT' });
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.remote_effect, 'accepted');
    assert.equal(result.process_disposition, 'ERR_INJECTED_FAULT');
    assert.equal(result.conversation_id, 'final-complete-1');
    assert.equal(result.retry_decision, 'prohibited');
    assert.equal(result.intent_sha256, saved.intent_sha256);
    assert.equal(result.handoff_sha256, handoff.handoff_sha256);
    assert.deepEqual(JSON.parse(await readFile(join(jobRoot, 'dispatch', 'result.json'), 'utf8')), result);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('REQ-DISPATCH-004 Web pre-input intent publication failure permits later completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-final6-direct-intent-'));
  let askCalls = 0;
  let detailCalls = 0;
  try {
    const { outputRoot, jobRoot } = await prepareWeb(root, 'job_final_direct');
    const common = {
      mode: 'web',
      outputRoot,
      jobId: 'job_final_direct',
      jobPath: jobRoot,
      openCliPath: '/tmp/opencli',
      now: () => '2026-08-26T23:15:00.000Z',
      preflight: async () => ({ version: '1.8.7' }),
      ask: async () => {
        askCalls += 1;
        return { conversationId: 'final-direct-1', conversationUrl: 'https://chatgpt.com/c/final-direct-1', tool: 'Web Search', response: '' };
      },
      readDetail: async () => { detailCalls += 1; return { response: 'answer' }; }
    };
    await assert.rejects(
      submitDirectPreparedJob({ ...common, receiptTestSeam: { failAt: 'after-direct-intent-write' } }),
      { code: 'ERR_INJECTED_FAULT' }
    );
    assert.equal(askCalls, 0);
    await assert.rejects(stat(join(jobRoot, 'response')), { code: 'ENOENT' });
    const result = await submitDirectPreparedJob(common);
    assert.equal(detailCalls, 3);
    assert.equal(result.status, 'completed');
    assert.equal(askCalls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-OPENCLI-001 preflight executes the resolved real OpenCLI path rather than a mutable supplied alias', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-final6-opencli-path-'));
  try {
    const real = join(root, 'real-opencli');
    const alias = join(root, 'opencli');
    await writeFile(real, `#!/usr/bin/env node\nconsole.log('1.8.7');\n`, { mode: 0o700 });
    await symlink(real, alias);
    let spawnedPath;
    let spawnedArgs;
    const identity = await preflightOpenCli({ executablePath: alias, spawnImpl: (file, args) => {
      spawnedPath = file;
      spawnedArgs = args;
      return completedChild('1.8.7\n');
    } });
    assert.equal(identity.supplied_path, alias);
    assert.equal(identity.version, '1.8.7');
    assert.deepEqual(spawnedArgs, ['--version']);
    assert.equal(spawnedPath, identity.real_path);
    assert.notEqual(spawnedPath, alias);
  } finally { await rm(root, { recursive: true, force: true }); }
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
