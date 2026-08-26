import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';
import { directAsk, submitDirectPreparedJob } from '../src/direct-ask.js';
import { createDispatchIntent, persistDispatchIntent } from '../src/dispatch-receipts.js';
import { prepareResearchJob } from '../src/prepare.js';
import { persistPreparedJob } from '../src/receipts.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';

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

test('REQ-DISPATCH-002 persists direct intent before ask and provider handoff before collection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-hardening-handoff-'));
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  const jobPath = join(outputRoot, 'jobs', 'job_handoff');
  let askCalls = 0;
  try {
    await assert.rejects(
      directAsk({
        question: 'preserve handoff',
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
            assert.equal(intent.mode, 'standard');
            return { conversationId: 'handoff-1', conversationUrl: 'https://chatgpt.com/c/handoff-1', tool: '', response: '' };
          },
          readDetail: async () => { const error = new Error('reader failed after provider handoff'); error.code = 'ERR_TEST_READ'; throw error; }
        })
      }),
      { code: 'ERR_TEST_READ' }
    );
    assert.equal(askCalls, 1);
    const handoff = JSON.parse(await readFile(join(jobPath, 'response', 'handoff.json'), 'utf8'));
    assert.equal(handoff.conversation_id, 'handoff-1');
    assert.equal(handoff.conversation_url, 'https://chatgpt.com/c/handoff-1');
    assert.equal(handoff.status, 'accepted');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-006 blank successful submit becomes durable ambiguous effect instead of escaping unclassified', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-hardening-blank-'));
  const outputRoot = join(root, 'output');
  const opencli = join(root, 'opencli');
  await mkdir(outputRoot);
  await prepareResearchJob({
    request: { question: 'blank answer', template_id: 'research-question', template_version: '1.0.0' },
    outputRoot,
    templatesRoot,
    now: '2026-08-26T17:33:00.000Z',
    newJobId: () => 'job_blank',
    newTurnId: () => 'turn_blank'
  });
  await writeFile(opencli, `#!/usr/bin/env node\nif (process.argv[2] === '--version') console.log('1.8.7');\nelse console.log(JSON.stringify([{conversationId:'blank-1',conversationUrl:'https://chatgpt.com/c/blank-1',tool:'',response:''}]));\n`, { mode: 0o700 });
  const moments = ['2026-08-26T17:34:00.000Z', '2026-08-26T17:35:00.000Z'];
  try {
    const result = await submitPreparedJobOnce({ outputRoot, jobId: 'job_blank', openCliPath: opencli, now: () => moments.shift() });
    assert.equal(result.status, 'ambiguous_effect');
    assert.equal(result.process_disposition, 'ERR_OPENCLI_OUTPUT');
    assert.equal(result.retry_decision, 'prohibited');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
