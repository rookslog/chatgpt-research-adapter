import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { directAsk, submitDirectPreparedJob } from '../src/direct-ask.js';

const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const preparedAt = '2026-08-24T01:02:03.456Z';

async function withOutputRoot(run) {
  const root = await mkdtemp(join(tmpdir(), 'direct-ask-'));
  const outputRoot = join(root, 'output');
  await mkdir(outputRoot);
  try { return await run(outputRoot); } finally { await rm(root, { recursive: true, force: true }); }
}

test('prepares the versioned default question, dispatches once, and returns its result and job path', async () => withOutputRoot(async (outputRoot) => {
  const completed = Object.freeze({ status: 'completed', job_id: 'job_default' });
  const calls = [];
  const outcome = await directAsk({
    question: 'What changed?', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_default', newTurnId: () => 'turn_default',
    submit: async (options) => { calls.push(options); return completed; }
  });

  const jobPath = join(outputRoot, 'jobs', 'job_default');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'standard');
  assert.equal(calls[0].jobId, 'job_default');
  assert.equal(calls[0].jobPath, jobPath);
  assert.equal(calls[0].openCliPath, '/tmp/opencli');
  assert.equal(outcome.result, completed);
  assert.equal(outcome.jobPath, jobPath);
  assert.equal(outcome.job.mode, 'standard');
  assert.deepEqual(JSON.parse(await readFile(join(jobPath, 'current.json'), 'utf8')).job, {
    audit_appendix: false, caller: 'codex', citation_level: 'principal', created_at: preparedAt, job_id: 'job_default', mode: 'standard', mode_reason: 'default',
    pacing_decision: 'not_applicable_pre_dispatch', state: 'prepared', template_body_sha256: 'dea7e330736babc68f4039926fb867b4782e9e67e2700ff7a062b05fcf5e129d',
    rigor_profile_id: 'standard', rigor_profile_sha256: '3ac667a01fadbb23a139ab0f45adb70c996f79adc389ee8183c6c7daac29a031', rigor_profile_version: '1.0.0',
    rigor_protocol_id: 'chatgpt-research-epistemic', rigor_protocol_version: '1.0.0',
    template_id: 'research-question', template_sha256: '3b56a8140a82615a3064213abefb4a776234b50ae0403c7648626572d1cb38b3', template_version: '1.0.0'
  });
}));

test('creates the requested output root for one-command use', async () => {
  const root = await mkdtemp(join(tmpdir(), 'direct-ask-root-')); const outputRoot = join(root, 'created');
  try {
    await directAsk({ question: 'Create output', outputRoot, openCliPath: '/tmp/opencli', templatesRoot, clock: () => preparedAt, newJobId: () => 'job_created', newTurnId: () => 'turn_created', submit: async () => ({ status: 'completed' }) });
    assert.equal((await stat(outputRoot)).isDirectory(), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('forwards explicit web and deep modes through the injected submit seam', async () => withOutputRoot(async (outputRoot) => {
  const calls = [];
  for (const [mode, jobId] of [['web', 'job_web'], ['deep', 'job_deep']]) {
    await directAsk({
      prompt: `Use ${mode}`, mode, outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
      clock: () => preparedAt, newJobId: () => jobId, newTurnId: () => `turn_${mode}`,
      submit: async (options) => { calls.push(options); return { status: 'completed', job_id: jobId }; }
    });
  }
  assert.deepEqual(calls.map(({ mode, jobId, jobPath, openCliPath }) => ({ mode, jobId, jobPath, openCliPath })), [
    { mode: 'web', jobId: 'job_web', jobPath: join(outputRoot, 'jobs', 'job_web'), openCliPath: '/tmp/opencli' },
    { mode: 'deep', jobId: 'job_deep', jobPath: join(outputRoot, 'jobs', 'job_deep'), openCliPath: '/tmp/opencli' }
  ]);
}));

test('direct ask forwards explicit rigor controls into the prepared prompt and receipt', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Audit the warrant', rigorProfile: 'strict', citationLevel: 'expanded', auditAppendix: true,
    outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_rigor', newTurnId: () => 'turn_rigor', submit: async () => ({ status: 'completed' })
  });
  const prompt = await readFile(join(outcome.jobPath, 'prompt.txt'), 'utf8');
  const current = JSON.parse(await readFile(join(outcome.jobPath, 'current.json'), 'utf8'));
  assert.match(prompt, /profile=strict\/1\.0\.0/);
  assert.match(prompt, /Expanded citations:/);
  assert.match(prompt, /Audit appendix:/);
  assert.equal(current.job.rigor_profile_id, 'strict');
  assert.equal(current.job.citation_level, 'expanded');
  assert.equal(current.job.audit_appendix, true);
}));

test('persists a standard answer from one mode-aware OpenCLI ask', async () => withOutputRoot(async (outputRoot) => {
  await directAsk({
    question: 'What changed?', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_live', newTurnId: () => 'turn_live',
    submit: (options) => submitDirectPreparedJob({
      ...options,
      preflight: async () => ({ version: '1.8.7' }),
      ask: async () => ({ conversationId: 'live-1', conversationUrl: 'https://chatgpt.com/c/live-1', tool: '', response: '' }),
      readDetail: async ({ timeoutSeconds }) => ({ response: `standard:${timeoutSeconds}:answer` })
    })
  });
  const responseRoot = join(outputRoot, 'jobs', 'job_live', 'response');
  assert.equal(await readFile(join(responseRoot, 'answer.md'), 'utf8'), 'standard:600:answer');
  const result = JSON.parse(await readFile(join(responseRoot, 'result.json'), 'utf8'));
  assert.equal(result.status, 'completed');
  assert.equal(result.mode, 'standard');
  assert.equal(result.conversation_url, 'https://chatgpt.com/c/live-1');
}));

test('persists a Web answer only after the same conversation repeats its grown final content', async () => withOutputRoot(async (outputRoot) => {
  const responses = ['partial answer', 'complete answer\n\n## Claim ledger\n\n## Audit appendix', 'complete answer\n\n## Claim ledger\n\n## Audit appendix'];
  const readConversationIds = [];
  let askCalls = 0;
  const answerPath = join(outputRoot, 'jobs', 'job_web_stable', 'response', 'answer.md');

  await directAsk({
    question: 'Research current evidence', mode: 'web', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_web_stable', newTurnId: () => 'turn_web_stable',
    submit: (options) => submitDirectPreparedJob({
      ...options,
      preflight: async () => ({ version: '1.8.7' }),
      ask: async () => {
        askCalls += 1;
        return { conversationId: 'web-stable-1', conversationUrl: 'https://chatgpt.com/c/web-stable-1', tool: 'Web Search', response: '' };
      },
      readDetail: async ({ conversationId }) => {
        readConversationIds.push(conversationId);
        await assert.rejects(readFile(answerPath), { code: 'ENOENT' });
        return { response: responses[readConversationIds.length - 1] };
      }
    })
  });

  assert.equal(askCalls, 1);
  assert.deepEqual(readConversationIds, ['web-stable-1', 'web-stable-1', 'web-stable-1']);
  assert.equal(await readFile(answerPath, 'utf8'), responses[2]);
}));

test('requires recovery without publishing when duplicate Web reads grow on the final bounded read', async () => withOutputRoot(async (outputRoot) => {
  const responses = ['partial', 'partial', 'grown after duplicate'];
  let askCalls = 0;
  let detailCalls = 0;
  const responseRoot = join(outputRoot, 'jobs', 'job_web_unstable', 'response');

  await assert.rejects(directAsk({
    question: 'Research current evidence', mode: 'web', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_web_unstable', newTurnId: () => 'turn_web_unstable',
    submit: (options) => submitDirectPreparedJob({
      ...options,
      preflight: async () => ({ version: '1.8.7' }),
      ask: async () => {
        askCalls += 1;
        return { conversationId: 'web-unstable-1', conversationUrl: 'https://chatgpt.com/c/web-unstable-1', tool: 'Web Search', response: '' };
      },
      readDetail: async ({ conversationId }) => {
        assert.equal(conversationId, 'web-unstable-1');
        const response = responses[detailCalls];
        detailCalls += 1;
        return { response };
      }
    })
  }), { code: 'ERR_OPENCLI_DETAIL_UNSTABLE' });

  assert.equal(askCalls, 1);
  assert.equal(detailCalls, 3);
  await assert.rejects(readFile(join(responseRoot, 'answer.md')), { code: 'ENOENT' });
  const result = JSON.parse(await readFile(join(responseRoot, 'result.json'), 'utf8'));
  assert.equal(result.status, 'recovery_required');
  assert.equal(result.remote_effect, 'accepted');
  assert.equal(result.retry_decision, 'prohibited');
}));

test('persists the completed report after one Deep Research submission', async () => withOutputRoot(async (outputRoot) => {
  const calls = [];
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_report', newTurnId: () => 'turn_report',
    submit: (options) => submitDirectPreparedJob({
      ...options,
      preflight: async () => ({ version: '1.8.7' }),
      ask: async ({ mode }) => { calls.push(mode); return { conversationId: 'deep-1', conversationUrl: 'https://chatgpt.com/c/deep-1', tool: 'Deep Research', response: '' }; },
      readDeep: async ({ conversationId }) => ({ conversationId, status: 'completed', report: '# Completed report', sources: [{ title: 'Example', url: 'https://example.com' }] })
    })
  });
  assert.deepEqual(calls, ['deep']);
  await assert.rejects(readFile(join(outcome.jobPath, 'response', 'answer.md')), { code: 'ENOENT' });
  assert.equal(await readFile(join(outcome.jobPath, 'response', 'report.md'), 'utf8'), '# Completed report');
  assert.equal(outcome.result.report_path, join(outcome.jobPath, 'response', 'report.md'));
}));
