import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { submitDirectPreparedJob } from '../src/direct-ask.js';
import { preflightOpenCli, runOpenCliStandard } from '../src/opencli-transport.js';
import { prepareResearchJob } from '../src/prepare.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';

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

async function prepareStandard(root, jobId) {
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  await prepareResearchJob({
    request: { question: 'final review', template_id: 'research-question', template_version: '1.0.0' },
    outputRoot,
    templatesRoot,
    now: '2026-08-26T23:10:00.000Z',
    newJobId: () => jobId,
    newTurnId: () => `turn_${jobId}`
  });
  return { outputRoot, jobRoot: join(outputRoot, 'jobs', jobId) };
}

test('REQ-DISPATCH-003 submit-once records recovery when completed-result persistence fails after handoff', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-final6-complete-'));
  try {
    const { outputRoot, jobRoot } = await prepareStandard(root, 'job_final_complete');
    const opencli = join(root, 'opencli');
    await writeFile(opencli, `#!/usr/bin/env node\nif (process.argv[2] === '--version') console.log('1.8.7');\nelse console.log(JSON.stringify([{conversationId:'final-complete-1',conversationUrl:'https://chatgpt.com/c/final-complete-1',tool:'',response:'durable answer'}]));\n`, { mode: 0o700 });
    const result = await submitPreparedJobOnce({
      outputRoot,
      jobId: 'job_final_complete',
      openCliPath: opencli,
      now: (() => { const values = ['2026-08-26T23:11:00.000Z', '2026-08-26T23:12:00.000Z', '2026-08-26T23:13:00.000Z', '2026-08-26T23:14:00.000Z']; return () => values.shift(); })(),
      receiptTestSeam: { failAt: 'after-answer-directory-sync' }
    });
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.process_disposition, 'ERR_INJECTED_FAULT');
    assert.equal(result.conversation_id, 'final-complete-1');
    assert.equal(result.retry_decision, 'prohibited');
    assert.equal(JSON.parse(await readFile(join(jobRoot, 'dispatch', 'result.json'), 'utf8')).status, 'recovery_required');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-004 direct intent publication failure does not wedge a known-unsent job', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-final6-direct-intent-'));
  let askCalls = 0;
  try {
    const { outputRoot, jobRoot } = await prepareStandard(root, 'job_final_direct');
    const common = {
      mode: 'standard',
      outputRoot,
      jobId: 'job_final_direct',
      jobPath: jobRoot,
      openCliPath: '/tmp/opencli',
      now: () => '2026-08-26T23:15:00.000Z',
      preflight: async () => ({ version: '1.8.7' }),
      ask: async () => {
        askCalls += 1;
        return { conversationId: 'final-direct-1', conversationUrl: 'https://chatgpt.com/c/final-direct-1', tool: '', response: '' };
      },
      readDetail: async () => ({ response: 'answer' })
    };
    await assert.rejects(
      submitDirectPreparedJob({ ...common, receiptTestSeam: { failAt: 'after-direct-intent-write' } }),
      { code: 'ERR_INJECTED_FAULT' }
    );
    assert.equal(askCalls, 0);
    await assert.rejects(stat(join(jobRoot, 'response')), { code: 'ENOENT' });
    const result = await submitDirectPreparedJob(common);
    assert.equal(result.status, 'completed');
    assert.equal(askCalls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-OPENCLI-001 executes the verified real OpenCLI path rather than a mutable supplied alias', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-final6-opencli-path-'));
  try {
    const real = join(root, 'real-opencli');
    const alias = join(root, 'opencli');
    await writeFile(real, `#!/usr/bin/env node\nif (process.argv[2] === '--version') console.log('1.8.7');\n`, { mode: 0o700 });
    await symlink(real, alias);
    const identity = await preflightOpenCli({ executablePath: alias });
    let spawnedPath;
    const row = [{ conversationId: 'identity-path-1', conversationUrl: 'https://chatgpt.com/c/identity-path-1', tool: '', response: 'ok' }];
    const result = await runOpenCliStandard({
      executablePath: alias,
      identity,
      prompt: 'x',
      spawnImpl: (file) => {
        spawnedPath = file;
        return completedChild(JSON.stringify(row));
      }
    });
    assert.equal(result.response, 'ok');
    assert.equal(spawnedPath, identity.real_path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
