import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { directAsk, submitDirectPreparedJob } from '../src/direct-ask.js';
import { parseOpenCliAnswer } from '../src/opencli-transport.js';
import { prepareResearchJob } from '../src/prepare.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';
import { loadTemplate } from '../src/template-registry.js';

const templatesRoot = new URL('../templates/', import.meta.url).pathname;

async function preparedSubmitCase(run) {
  const root = await mkdtemp(join(tmpdir(), 'review-round3-submit-'));
  const outputRoot = join(root, 'output');
  const opencli = join(root, 'opencli');
  try {
    await mkdir(outputRoot);
    await prepareResearchJob({
      request: { question: 'preserve provenance', template_id: 'research-question', template_version: '1.0.0' },
      outputRoot,
      templatesRoot,
      now: '2026-08-26T22:40:00.000Z',
      newJobId: () => 'job_round3_submit',
      newTurnId: () => 'turn_round3_submit'
    });
    await writeFile(opencli, `#!/usr/bin/env node\nif (process.argv[2] === '--version') console.log('1.8.7');\nelse console.log(JSON.stringify([{conversationId:'round3-submit-1',conversationUrl:'https://chatgpt.com/c/round3-submit-1',tool:'',response:'ok'}]));\n`, { mode: 0o700 });
    return await run({ outputRoot, opencli, jobRoot: join(outputRoot, 'jobs', 'job_round3_submit') });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('REQ-DISPATCH-007 submit-once rejects transport options that can replace provenance-bound inputs', async () => preparedSubmitCase(async ({ outputRoot, opencli, jobRoot }) => {
  await assert.rejects(
    submitPreparedJobOnce({
      outputRoot,
      jobId: 'job_round3_submit',
      openCliPath: opencli,
      now: () => '2026-08-26T22:41:00.000Z',
      transportOptions: { prompt: 'OVERRIDDEN' }
    }),
    { code: 'ERR_SUBMIT_TRANSPORT_OPTIONS' }
  );
  await assert.rejects(stat(join(jobRoot, 'dispatch')), { code: 'ENOENT' });
}));

test('REQ-DISPATCH-009 canonicalizes semantically accepted ChatGPT conversation URLs', () => {
  const row = {
    conversationId: 'canonical-1',
    conversationUrl: 'https://CHATGPT.COM:443/c/canonical-1',
    tool: '',
    response: 'ok'
  };
  const parsed = parseOpenCliAnswer(Buffer.from(JSON.stringify([row])));
  assert.equal(parsed.conversationUrl, 'https://chatgpt.com/c/canonical-1');
});

test('REQ-DISPATCH-003 records recovery when Deep Research result canonicalization fails after handoff', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-round3-deep-'));
  const outputRoot = join(root, 'output');
  try {
    await assert.rejects(
      directAsk({
        question: 'deep canonicalization',
        mode: 'deep',
        outputRoot,
        openCliPath: '/tmp/opencli',
        templatesRoot,
        clock: () => '2026-08-26T22:42:00.000Z',
        newJobId: () => 'job_round3_deep',
        newTurnId: () => 'turn_round3_deep',
        submit: (options) => submitDirectPreparedJob({
          ...options,
          preflight: async () => ({ version: '1.8.7' }),
          ask: async () => ({ conversationId: 'deep-canonical-1', conversationUrl: 'https://chatgpt.com/c/deep-canonical-1', tool: 'Deep Research', response: '' }),
          readDeep: async () => ({ conversationId: 'deep-canonical-1', status: 'completed', report: '# Report\n', sources: [{ rank: -0 }] })
        })
      }),
      { code: 'ERR_CANONICAL_JSON' }
    );
    const responseRoot = join(outputRoot, 'jobs', 'job_round3_deep', 'response');
    const result = JSON.parse(await readFile(join(responseRoot, 'result.json'), 'utf8'));
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.process_disposition, 'ERR_CANONICAL_JSON');
    assert.equal(result.conversation_id, 'deep-canonical-1');
    assert.equal(result.retry_decision, 'prohibited');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-TEMPLATE-001 rejects an oversized template registry before reading it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-round3-registry-limit-'));
  try {
    await writeFile(join(root, 'registry.json'), Buffer.alloc(256 * 1024 + 1, 0x20));
    await assert.rejects(loadTemplate({ templatesRoot: root, templateId: 'research-question', version: '1.0.0' }), { code: 'ERR_TEMPLATE_LIMIT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-TEMPLATE-001 rejects an oversized template manifest before reading it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-round3-manifest-limit-'));
  try {
    await writeFile(join(root, 'registry.json'), await readFile(new URL('../templates/registry.json', import.meta.url)));
    await mkdir(join(root, 'research-question'));
    await writeFile(join(root, 'research-question', '1.0.0.json'), Buffer.alloc(64 * 1024 + 1, 0x20));
    await assert.rejects(loadTemplate({ templatesRoot: root, templateId: 'research-question', version: '1.0.0' }), { code: 'ERR_TEMPLATE_LIMIT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
