import assert from 'node:assert/strict';
import { link, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { collectDeepPreparedJob, directAsk, getDeepPreparedJobStatus, submitDirectPreparedJob, waitDeepPreparedJob } from '../src/direct-ask.js';

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

test('returns an immutable Deep running receipt after one handoff without reading a result', async () => withOutputRoot(async (outputRoot) => {
  const calls = [];
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_report', newTurnId: () => 'turn_report',
    submit: (options) => submitDirectPreparedJob({
      ...options,
      preflight: async () => ({ version: '1.8.7' }),
      ask: async ({ mode }) => { calls.push(mode); return { conversationId: 'deep-1', conversationUrl: 'https://chatgpt.com/c/deep-1', tool: 'Deep Research', response: '' }; },
      readDeep: async () => assert.fail('Deep submission must not read a result')
    })
  });
  assert.deepEqual(calls, ['deep']);
  await assert.rejects(readFile(join(outcome.jobPath, 'response', 'answer.md')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(outcome.jobPath, 'response', 'report.md')), { code: 'ENOENT' });
  assert.equal(outcome.result.status, 'running');
  assert.equal(outcome.result.remote_effect, 'accepted');
  assert.equal(JSON.parse(await readFile(join(outcome.jobPath, 'response', 'running.json'), 'utf8')).conversation_id, 'deep-1');
}));

test('resumes a persisted Deep handoff through pending, collect, and wait without resubmitting', async () => withOutputRoot(async (outputRoot) => {
  const running = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_resume', newTurnId: () => 'turn_resume',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-resume-1', conversationUrl: 'https://chatgpt.com/c/deep-resume-1', tool: 'Deep Research', response: '' }), readDeep: async () => assert.fail('must not read during submit') })
  });
  const before = await getDeepPreparedJobStatus({ outputRoot, jobId: 'job_resume' });
  assert.equal(before.status, 'running');
  const pending = await collectDeepPreparedJob({ outputRoot, jobId: 'job_resume', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'not_ready', conversationId: 'deep-resume-1' }) });
  assert.equal(pending.status, 'running');
  const completed = await waitDeepPreparedJob({ outputRoot, jobId: 'job_resume', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readDeep: async () => ({ status: 'completed', conversationId: 'deep-resume-1', report: '# Resumed report', sources: [{ title: 'Source', url: 'https://example.com' }] }) });
  assert.equal(completed.status, 'completed');
  assert.equal(await readFile(join(running.jobPath, 'response', 'report.md'), 'utf8'), '# Resumed report');
  assert.deepEqual(await getDeepPreparedJobStatus({ outputRoot, jobId: 'job_resume' }), completed);
}));

test('keeps accepted Deep collection failures nonterminal and does not resubmit', async () => withOutputRoot(async (outputRoot) => {
  await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_collect_error', newTurnId: () => 'turn_collect_error',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-error-1', conversationUrl: 'https://chatgpt.com/c/deep-error-1', tool: 'Deep Research', response: '' }) })
  });
  const result = await collectDeepPreparedJob({ outputRoot, jobId: 'job_collect_error', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => { const error = new Error('timeout'); error.code = 'ERR_OPENCLI_TIMEOUT'; throw error; } });
  assert.equal(result.status, 'running');
  assert.equal(result.collection_disposition, 'ERR_OPENCLI_TIMEOUT');
  const durable = await getDeepPreparedJobStatus({ outputRoot, jobId: 'job_collect_error' });
  assert.equal(durable.status, 'running');
  await assert.rejects(readFile(join(outputRoot, 'jobs', 'job_collect_error', 'response', 'result.json')), { code: 'ENOENT' });
}));

test('keeps malformed Deep collection output collectable without terminal publication', async () => withOutputRoot(async (outputRoot) => {
  await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_collect_malformed', newTurnId: () => 'turn_collect_malformed',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-malformed-1', conversationUrl: 'https://chatgpt.com/c/deep-malformed-1', tool: 'Deep Research', response: '' }) })
  });
  const result = await collectDeepPreparedJob({ outputRoot, jobId: 'job_collect_malformed', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-malformed-1', report: '  ', sources: {} }) });
  assert.equal(result.status, 'running');
  assert.equal(result.collection_disposition, 'ERR_OPENCLI_OUTPUT');
  await assert.rejects(readFile(join(outputRoot, 'jobs', 'job_collect_malformed', 'response', 'result.json')), { code: 'ENOENT' });
}));

test('refuses a Deep terminal result that would exceed its own reader limit', async () => withOutputRoot(async (outputRoot) => {
  await directAsk({
    question: 'oversized result', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_oversized_result', newTurnId: () => 'turn_oversized_result',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-oversized-1', conversationUrl: 'https://chatgpt.com/c/deep-oversized-1', tool: 'Deep Research', response: '' }) })
  });
  await assert.rejects(collectDeepPreparedJob({ outputRoot, jobId: 'job_oversized_result', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-oversized-1', report: '# Report', sources: ['x'.repeat(130 * 1024)] }) }), { code: 'ERR_DIRECT_RECEIPT' });
  assert.equal((await getDeepPreparedJobStatus({ outputRoot, jobId: 'job_oversized_result' })).status, 'running');
}));

test('retains an ambiguous Deep ask failure as terminal instead of treating it as a resubmittable intent', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_ambiguous', newTurnId: () => 'turn_ambiguous',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => { const error = new Error('exit'); error.code = 'ERR_OPENCLI_EXIT'; throw error; } })
  });
  assert.equal(outcome.result.status, 'ambiguous_effect');
  assert.equal((await getDeepPreparedJobStatus({ outputRoot, jobId: 'job_ambiguous' })).status, 'ambiguous_effect');
}));

test('rejects duplicate Deep submission before preflight or provider spawn', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_duplicate', newTurnId: () => 'turn_duplicate',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-duplicate-1', conversationUrl: 'https://chatgpt.com/c/deep-duplicate-1', tool: 'Deep Research', response: '' }) })
  });
  await assert.rejects(submitDirectPreparedJob({ mode: 'deep', outputRoot, jobId: 'job_duplicate', jobPath: outcome.jobPath, openCliPath: '/tmp/opencli', preflight: async () => assert.fail('must not preflight'), ask: async () => assert.fail('must not spawn') }), { code: 'ERR_DIRECT_EXISTS' });
}));

test('serializes concurrent Deep collectors onto one immutable completed result', async () => withOutputRoot(async (outputRoot) => {
  await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_race', newTurnId: () => 'turn_race',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-race-1', conversationUrl: 'https://chatgpt.com/c/deep-race-1', tool: 'Deep Research', response: '' }) })
  });
  let reads = 0;
  const options = { outputRoot, jobId: 'job_race', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => { reads += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { status: 'completed', conversationId: 'deep-race-1', report: '# Race report', sources: [{ title: 'Source', url: 'https://example.com' }] }; } };
  const [left, right] = await Promise.all([collectDeepPreparedJob(options), collectDeepPreparedJob(options)]);
  assert.equal(reads, 1);
  assert.deepEqual(left, right);
  const bytes = await readFile(join(outputRoot, 'jobs', 'job_race', 'response', 'result.json'));
  assert.deepEqual(await readFile(join(outputRoot, 'jobs', 'job_race', 'response', 'result.json')), bytes);
}));

test('reclaims an empty legacy Deep collector lock after its owner is gone', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_stale_lock', newTurnId: () => 'turn_stale_lock',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-stale-1', conversationUrl: 'https://chatgpt.com/c/deep-stale-1', tool: 'Deep Research', response: '' }) })
  });
  await writeFile(join(outcome.jobPath, 'response', '.collect.lock'), '');
  const result = await collectDeepPreparedJob({ outputRoot, jobId: 'job_stale_lock', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-stale-1', report: '# Stale lock recovery', sources: [] }) });
  assert.equal(result.status, 'completed');
}));

test('reclaims a canonical Deep collector lock only after its process is provably absent', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_dead_lock', newTurnId: () => 'turn_dead_lock',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-dead-1', conversationUrl: 'https://chatgpt.com/c/deep-dead-1', tool: 'Deep Research', response: '' }) })
  });
  const lockPath = join(outcome.jobPath, 'response', '.collect.lock');
  await writeFile(lockPath, '{"acquired_at":"2026-08-24T01:02:03.456Z","nonce":"00000000-0000-4000-8000-000000000000","pid":2147483647,"schema":"m006.deep-collector-lock.v1"}\n');
  await link(lockPath, `${lockPath}.reclaim`);
  const result = await collectDeepPreparedJob({ outputRoot, jobId: 'job_dead_lock', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-dead-1', report: '# Dead lock recovery', sources: [] }) });
  assert.equal(result.status, 'completed');
}));

test('reclaims a gate-only Deep lock left after its original pathname was removed', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_gate_only', newTurnId: () => 'turn_gate_only',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-gate-1', conversationUrl: 'https://chatgpt.com/c/deep-gate-1', tool: 'Deep Research', response: '' }) })
  });
  await writeFile(join(outcome.jobPath, 'response', '.collect.lock.reclaim'), '{"acquired_at":"2026-08-24T01:02:03.456Z","nonce":"22222222-2222-4222-8222-222222222222","pid":2147483647,"schema":"m006.deep-collector-lock.v1"}\n');
  const result = await collectDeepPreparedJob({ outputRoot, jobId: 'job_gate_only', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-gate-1', report: '# Gate recovery', sources: [] }) });
  assert.equal(result.status, 'completed');
}));

test('does not unlink a replacement collector lock when releasing its own token', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'protect replacement lock', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_lock_token', newTurnId: () => 'turn_lock_token',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-token-1', conversationUrl: 'https://chatgpt.com/c/deep-token-1', tool: 'Deep Research', response: '' }) })
  });
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const collecting = collectDeepPreparedJob({ outputRoot, jobId: 'job_lock_token', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => { await gate; return { status: 'completed', conversationId: 'deep-token-1', report: '# Report', sources: [] }; } });
  const lockPath = join(outcome.jobPath, 'response', '.collect.lock');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await readFile(lockPath); break; } catch { await new Promise((resolve) => setTimeout(resolve, 5)); }
  }
  const replacement = '{"acquired_at":"2026-08-24T01:02:03.456Z","nonce":"11111111-1111-4111-8111-111111111111","pid":2147483647,"schema":"m006.deep-collector-lock.v1"}\n';
  await writeFile(lockPath, replacement);
  release();
  await collecting;
  assert.equal(await readFile(lockPath, 'utf8'), replacement);
}));

test('rolls back only its post-link result before publishing Standard recovery', async () => withOutputRoot(async (outputRoot) => {
  await assert.rejects(directAsk({
    question: 'recover result publish', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_result_rollback', newTurnId: () => 'turn_result_rollback',
    submit: (options) => submitDirectPreparedJob({ ...options, receiptTestSeam: { failAt: 'after-direct-result-publish' }, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'rollback-1', conversationUrl: 'https://chatgpt.com/c/rollback-1', tool: '', response: '' }), readDetail: async () => ({ response: 'answer' }) })
  }), { code: 'ERR_INJECTED_FAULT' });
  const result = JSON.parse(await readFile(join(outputRoot, 'jobs', 'job_result_rollback', 'response', 'result.json'), 'utf8'));
  assert.equal(result.status, 'recovery_required');
}));

test('rolls back only its post-link result before publishing Web recovery', async () => withOutputRoot(async (outputRoot) => {
  await assert.rejects(directAsk({
    question: 'recover web result publish', mode: 'web', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_web_result_rollback', newTurnId: () => 'turn_web_result_rollback',
    submit: (options) => submitDirectPreparedJob({ ...options, receiptTestSeam: { failAt: 'after-direct-result-publish' }, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'rollback-web-1', conversationUrl: 'https://chatgpt.com/c/rollback-web-1', tool: 'Web Search', response: '' }), readDetail: async () => ({ response: 'answer' }) })
  }), { code: 'ERR_INJECTED_FAULT' });
  const result = JSON.parse(await readFile(join(outputRoot, 'jobs', 'job_web_result_rollback', 'response', 'result.json'), 'utf8'));
  assert.equal(result.status, 'recovery_required');
}));

test('rolls back only its post-link Deep result and leaves the handoff collectable', async () => withOutputRoot(async (outputRoot) => {
  await directAsk({
    question: 'recover deep result publish', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_deep_result_rollback', newTurnId: () => 'turn_deep_result_rollback',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'rollback-deep-1', conversationUrl: 'https://chatgpt.com/c/rollback-deep-1', tool: 'Deep Research', response: '' }) })
  });
  await assert.rejects(collectDeepPreparedJob({ outputRoot, jobId: 'job_deep_result_rollback', openCliPath: '/tmp/opencli', receiptTestSeam: { failAt: 'after-direct-result-publish' }, preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'rollback-deep-1', report: '# Report', sources: [] }) }), { code: 'ERR_INJECTED_FAULT' });
  assert.equal((await getDeepPreparedJobStatus({ outputRoot, jobId: 'job_deep_result_rollback' })).status, 'running');
}));

test('refuses a preexisting symlinked Deep report instead of following it', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'protect report', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_report_symlink', newTurnId: () => 'turn_report_symlink',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'report-symlink-1', conversationUrl: 'https://chatgpt.com/c/report-symlink-1', tool: 'Deep Research', response: '' }) })
  });
  const outside = join(outputRoot, 'outside-report.md');
  await writeFile(outside, 'outside');
  await symlink(outside, join(outcome.jobPath, 'response', 'report.md'));
  await assert.rejects(collectDeepPreparedJob({ outputRoot, jobId: 'job_report_symlink', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'report-symlink-1', report: '# Report', sources: [] }) }), { code: 'ERR_DIRECT_RECEIPT' });
  assert.equal(await readFile(outside, 'utf8'), 'outside');
}));
