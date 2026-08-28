import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { collectDeepPreparedJob, directAsk, getDeepPreparedJobStatus, submitDirectPreparedJob, waitDeepPreparedJob } from '../src/direct-ask.js';

const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const preparedAt = '2026-08-24T01:02:03.456Z';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const collectorOwner = (generation, pid, nonce) => `{"acquired_at":"${preparedAt}","generation":${generation},"nonce":"${nonce}","pid":${pid},"schema":"m006.deep-collector-owner.v1"}\n`;
const collectorRelease = (generation, pid, nonce, owner) => `{"generation":${generation},"nonce":"${nonce}","owner_record_sha256":"${hash(owner)}","pid":${pid},"released_at":"${preparedAt}","schema":"m006.deep-collector-release.v1"}\n`;

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

test('publishes one exact completion event only after the durable Deep result and report', async () => withOutputRoot(async (outputRoot) => {
  const running = await directAsk({
    question: 'event ordering', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_event', newTurnId: () => 'turn_event',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-event-1', conversationUrl: 'https://chatgpt.com/c/deep-event-1', tool: 'Deep Research', response: '' }) })
  });
  const responseRoot = join(running.jobPath, 'response');
  const eventPath = join(responseRoot, 'events', 'research.completed.v1.json');
  await assert.rejects(readFile(eventPath), { code: 'ENOENT' });
  const completed = await collectDeepPreparedJob({ outputRoot, jobId: 'job_event', openCliPath: '/tmp/opencli', now: () => preparedAt, preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-event-1', report: '# Event report', sources: [{ title: 'Source', url: 'https://example.com' }] }) });
  const [resultBytes, reportBytes, eventBytes] = await Promise.all([readFile(join(responseRoot, 'result.json')), readFile(join(responseRoot, 'report.md')), readFile(eventPath)]);
  assert.deepEqual(JSON.parse(eventBytes), { schema: 'm006.research-completion-event.v1', type: 'research.completed.v1', job_id: 'job_event', turn_id: 'turn_event', conversation_id: 'deep-event-1', conversation_url: 'https://chatgpt.com/c/deep-event-1', result_path: join(responseRoot, 'result.json'), result_sha256: hash(resultBytes), report_path: join(responseRoot, 'report.md'), report_sha256: hash(reportBytes), source_count: 1, completed_at: completed.finished_at });
  assert.equal(eventBytes.toString('utf8'), `${JSON.stringify(JSON.parse(eventBytes))}\n`);
}));

test('recovers event staging and final-link interruptions without another Deep reader', async () => withOutputRoot(async (outputRoot) => {
  for (const [jobId, conversationId, failAt] of [['job_event_stage', 'deep-event-stage', 'after-completion-event-write'], ['job_event_link', 'deep-event-link', 'after-completion-event-publish']]) {
    const outcome = await directAsk({
      question: jobId, mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
      clock: () => preparedAt, newJobId: () => jobId, newTurnId: () => `turn_${jobId}`,
      submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId, conversationUrl: `https://chatgpt.com/c/${conversationId}`, tool: 'Deep Research', response: '' }) })
    });
    const options = { outputRoot, jobId, openCliPath: '/tmp/opencli', now: () => preparedAt, preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId, report: '# Event recovery', sources: [] }) };
    await assert.rejects(collectDeepPreparedJob({ ...options, receiptTestSeam: { failAt } }), { code: 'ERR_INJECTED_FAULT' });
    const eventPath = join(outcome.jobPath, 'response', 'events', 'research.completed.v1.json');
    if (failAt === 'after-completion-event-write') {
      await assert.rejects(readFile(eventPath), { code: 'ENOENT' });
      assert.equal((await getDeepPreparedJobStatus({ outputRoot, jobId })).status, 'completed');
    }
    if (failAt === 'after-completion-event-publish') {
      await assert.rejects(collectDeepPreparedJob({ outputRoot, jobId, openCliPath: '/tmp/opencli', receiptTestSeam: { failAt: 'after-completion-events-directory-sync' }, preflight: async () => assert.fail('event-directory repair must not preflight'), readStatus: async () => assert.fail('event-directory repair must not read') }), { code: 'ERR_INJECTED_FAULT' });
      await assert.rejects(collectDeepPreparedJob({ outputRoot, jobId, openCliPath: '/tmp/opencli', receiptTestSeam: { failAt: 'after-completion-event-existing-sync' }, preflight: async () => assert.fail('existing-event repair must not preflight'), readStatus: async () => assert.fail('existing-event repair must not read') }), { code: 'ERR_INJECTED_FAULT' });
    }
    await assert.doesNotReject(collectDeepPreparedJob({ outputRoot, jobId, openCliPath: '/tmp/opencli', preflight: async () => assert.fail('completed-event recovery must not preflight'), readStatus: async () => assert.fail('completed-event recovery must not read') }));
    assert.ok((await readFile(eventPath)).length > 0);
  }
}));

test('fails closed for malformed, symlinked, or different preexisting completion events', async () => withOutputRoot(async (outputRoot) => {
  for (const [jobId, mutate] of [
    ['job_event_malformed', async (path) => writeFile(path, '{}\n')],
    ['job_event_symlink', async (path) => { const outside = join(outputRoot, 'outside-event.json'); await writeFile(outside, '{}\n'); await symlink(outside, path); }],
    ['job_event_different', async (path) => writeFile(path, '{"completed_at":"2026-08-24T01:02:03.456Z"}\n')]
  ]) {
    const conversationId = `${jobId}-conversation`;
    const outcome = await directAsk({
      question: jobId, mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
      clock: () => preparedAt, newJobId: () => jobId, newTurnId: () => `turn_${jobId}`,
      submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId, conversationUrl: `https://chatgpt.com/c/${conversationId}`, tool: 'Deep Research', response: '' }) })
    });
    const options = { outputRoot, jobId, openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId, report: '# Event rejection', sources: [] }) };
    await assert.rejects(collectDeepPreparedJob({ ...options, receiptTestSeam: { failAt: 'after-completion-event-write' } }), { code: 'ERR_INJECTED_FAULT' });
    const eventPath = join(outcome.jobPath, 'response', 'events', 'research.completed.v1.json');
    await mutate(eventPath);
    await assert.rejects(getDeepPreparedJobStatus({ outputRoot, jobId }), { code: 'ERR_DIRECT_RECEIPT' });
    await assert.rejects(collectDeepPreparedJob({ outputRoot, jobId, openCliPath: '/tmp/opencli', preflight: async () => assert.fail('event validation must not preflight'), readStatus: async () => assert.fail('event validation must not read') }), { code: 'ERR_DIRECT_RECEIPT' });
  }
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

test('concurrent Deep submissions produce one running handoff and one duplicate before a second ask', async () => withOutputRoot(async (outputRoot) => {
  const prepared = await directAsk({
    question: 'concurrent submit', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_concurrent_submit', newTurnId: () => 'turn_concurrent_submit', submit: async () => Object.freeze({ status: 'prepared' })
  });
  let preflights = 0; let release; const barrier = new Promise((resolve) => { release = resolve; }); let asks = 0;
  const options = { mode: 'deep', outputRoot, jobId: 'job_concurrent_submit', jobPath: prepared.jobPath, openCliPath: '/tmp/opencli', preflight: async () => { preflights += 1; if (preflights === 2) release(); await barrier; return { version: '1.8.7' }; }, ask: async () => { asks += 1; return { conversationId: 'deep-concurrent-1', conversationUrl: 'https://chatgpt.com/c/deep-concurrent-1', tool: 'Deep Research', response: '' }; } };
  const settled = await Promise.allSettled([submitDirectPreparedJob(options), submitDirectPreparedJob(options)]);
  assert.equal(preflights, 2);
  assert.equal(asks, 1);
  assert.equal(settled.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(settled.filter((entry) => entry.status === 'rejected')[0].reason.code, 'ERR_DIRECT_EXISTS');
  const responseRoot = join(prepared.jobPath, 'response');
  const original = await Promise.all(['intent.json', 'handoff.json', 'running.json'].map((name) => readFile(join(responseRoot, name))));
  await assert.rejects(submitDirectPreparedJob({ ...options, preflight: async () => assert.fail('duplicate must fail before provider access'), ask: async () => assert.fail('duplicate must not ask') }), { code: 'ERR_DIRECT_EXISTS' });
  assert.deepEqual(await Promise.all(['intent.json', 'handoff.json', 'running.json'].map((name) => readFile(join(responseRoot, name)))), original);
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
  const eventPath = join(outputRoot, 'jobs', 'job_race', 'response', 'events', 'research.completed.v1.json');
  const eventBytes = await readFile(eventPath);
  assert.deepEqual(await collectDeepPreparedJob(options), left);
  assert.equal(reads, 1);
  assert.deepEqual(await readFile(eventPath), eventBytes);
  assert.deepEqual((await readdir(join(outputRoot, 'jobs', 'job_race', 'response', 'events'))).filter((name) => !name.startsWith('.')), ['research.completed.v1.json']);
}));

test('a collector that waited for a terminal result finalizes its missing event without transport', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'follower event', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_event_follower', newTurnId: () => 'turn_event_follower',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-event-follower-1', conversationUrl: 'https://chatgpt.com/c/deep-event-follower-1', tool: 'Deep Research', response: '' }) })
  });
  let release; const reading = new Promise((resolve) => { release = resolve; }); let started; const startedReading = new Promise((resolve) => { started = resolve; });
  const leader = collectDeepPreparedJob({ outputRoot, jobId: 'job_event_follower', openCliPath: '/tmp/opencli', receiptTestSeam: { failAt: 'after-completion-event-write' }, preflight: async () => ({ version: '1.8.7' }), readStatus: async () => { started(); await reading; return { status: 'completed', conversationId: 'deep-event-follower-1', report: '# Follower event', sources: [] }; } });
  await startedReading;
  const follower = collectDeepPreparedJob({ outputRoot, jobId: 'job_event_follower', openCliPath: '/tmp/opencli', preflight: async () => assert.fail('follower must not preflight'), readStatus: async () => assert.fail('follower must not read') });
  release();
  await assert.rejects(leader, { code: 'ERR_INJECTED_FAULT' });
  assert.equal((await follower).status, 'completed');
  assert.ok((await readFile(join(outcome.jobPath, 'response', 'events', 'research.completed.v1.json'))).length > 0);
}));

test('a wait-null follower rereads and finalizes a result published in that gap', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'wait-null event', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_wait_null', newTurnId: () => 'turn_wait_null',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-wait-null-1', conversationUrl: 'https://chatgpt.com/c/deep-wait-null-1', tool: 'Deep Research', response: '' }) })
  });
  const locks = join(outcome.jobPath, 'response', 'collector-locks'); const owner = collectorOwner(1, process.pid, '33333333-3333-4333-8333-333333333333');
  await mkdir(locks); await writeFile(join(locks, '1.owner.json'), owner);
  let resumeFollower; const followerPaused = new Promise((resolve) => { resumeFollower = resolve; }); let nullSeen; const waitNull = new Promise((resolve) => { nullSeen = resolve; }); let waiting; const waitStarted = new Promise((resolve) => { waiting = resolve; });
  const follower = collectDeepPreparedJob({ outputRoot, jobId: 'job_wait_null', openCliPath: '/tmp/opencli', receiptTestSeam: { afterCollectionWaitStart: waiting, afterCollectionWaitNull: async () => { nullSeen(); await followerPaused; } }, preflight: async () => assert.fail('wait-null follower must not preflight'), readStatus: async () => assert.fail('wait-null follower must not read') });
  await waitStarted;
  await writeFile(join(locks, '1.released.json'), collectorRelease(1, process.pid, '33333333-3333-4333-8333-333333333333', owner));
  await waitNull;
  const publisher = collectDeepPreparedJob({ outputRoot, jobId: 'job_wait_null', openCliPath: '/tmp/opencli', receiptTestSeam: { failAt: 'after-completion-event-write' }, preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-wait-null-1', report: '# Wait null', sources: [] }) });
  await assert.rejects(publisher, { code: 'ERR_INJECTED_FAULT' });
  resumeFollower();
  assert.equal((await follower).status, 'completed');
  assert.ok((await readFile(join(outcome.jobPath, 'response', 'events', 'research.completed.v1.json'))).length > 0);
}));

test('advances beyond a provably dead immutable collector owner without deleting it', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_stale_lock', newTurnId: () => 'turn_stale_lock',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-stale-1', conversationUrl: 'https://chatgpt.com/c/deep-stale-1', tool: 'Deep Research', response: '' }) })
  });
  const locks = join(outcome.jobPath, 'response', 'collector-locks');
  await mkdir(locks);
  await writeFile(join(locks, '1.owner.json'), collectorOwner(1, 2147483647, '00000000-0000-4000-8000-000000000000'));
  const result = await collectDeepPreparedJob({ outputRoot, jobId: 'job_stale_lock', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-stale-1', report: '# Stale lock recovery', sources: [] }) });
  assert.equal(result.status, 'completed');
  assert.deepEqual((await readdir(locks)).filter((name) => !name.startsWith('.')).sort(), ['1.owner.json', '2.owner.json', '2.released.json']);
}));

test('does not steal a live long-running collector owner', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_dead_lock', newTurnId: () => 'turn_dead_lock',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-dead-1', conversationUrl: 'https://chatgpt.com/c/deep-dead-1', tool: 'Deep Research', response: '' }) })
  });
  const locks = join(outcome.jobPath, 'response', 'collector-locks');
  await mkdir(locks);
  await writeFile(join(locks, '1.owner.json'), collectorOwner(1, process.pid, '00000000-0000-4000-8000-000000000000'));
  const result = await collectDeepPreparedJob({ outputRoot, jobId: 'job_dead_lock', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => assert.fail('live collector must not be overlapped') });
  assert.equal(result.status, 'running');
  assert.deepEqual((await readdir(locks)).filter((name) => !name.startsWith('.')).sort(), ['1.owner.json']);
}));

test('an ABA stale generation cannot affect a newer live collector', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'Research this', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_gate_only', newTurnId: () => 'turn_gate_only',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-gate-1', conversationUrl: 'https://chatgpt.com/c/deep-gate-1', tool: 'Deep Research', response: '' }) })
  });
  const locks = join(outcome.jobPath, 'response', 'collector-locks');
  await mkdir(locks);
  const oldOwner = collectorOwner(1, 2147483647, '11111111-1111-4111-8111-111111111111');
  await writeFile(join(locks, '1.owner.json'), oldOwner);
  await writeFile(join(locks, '1.released.json'), collectorRelease(1, 2147483647, '11111111-1111-4111-8111-111111111111', oldOwner));
  await writeFile(join(locks, '2.owner.json'), collectorOwner(2, process.pid, '22222222-2222-4222-8222-222222222222'));
  const result = await collectDeepPreparedJob({ outputRoot, jobId: 'job_gate_only', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => assert.fail('newer collector must remain exclusive') });
  assert.equal(result.status, 'running');
  assert.deepEqual((await readdir(locks)).filter((name) => !name.startsWith('.')).sort(), ['1.owner.json', '1.released.json', '2.owner.json']);
}));

test('keeps owner publication crash states immutable before and after the final link', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'owner crash', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_owner_crash', newTurnId: () => 'turn_owner_crash',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-owner-1', conversationUrl: 'https://chatgpt.com/c/deep-owner-1', tool: 'Deep Research', response: '' }) })
  });
  const base = { outputRoot, jobId: 'job_owner_crash', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-owner-1', report: '# Report', sources: [] }) };
  await assert.rejects(collectDeepPreparedJob({ ...base, receiptTestSeam: { failAt: 'after-collector-owner-write' } }), { code: 'ERR_INJECTED_FAULT' });
  const locks = join(outcome.jobPath, 'response', 'collector-locks');
  assert.deepEqual((await readdir(locks)).filter((name) => !name.startsWith('.')), []);
  await assert.rejects(collectDeepPreparedJob({ ...base, receiptTestSeam: { failAt: 'after-collector-owner-publish' } }), { code: 'ERR_INJECTED_FAULT' });
  assert.deepEqual((await readdir(locks)).filter((name) => !name.startsWith('.')).sort(), ['1.owner.json', '1.released.json']);
  assert.equal((await collectDeepPreparedJob(base)).status, 'completed');
  assert.deepEqual((await readdir(locks)).filter((name) => !name.startsWith('.')).sort(), ['1.owner.json', '1.released.json', '2.owner.json', '2.released.json']);
}));

test('retains a durable release record when release crashes after publication', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'release crash', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_release_crash', newTurnId: () => 'turn_release_crash',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'deep-release-1', conversationUrl: 'https://chatgpt.com/c/deep-release-1', tool: 'Deep Research', response: '' }) })
  });
  await assert.rejects(collectDeepPreparedJob({ outputRoot, jobId: 'job_release_crash', openCliPath: '/tmp/opencli', receiptTestSeam: { failAt: 'after-collector-released-publish' }, preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'deep-release-1', report: '# Report', sources: [] }) }), { code: 'ERR_INJECTED_FAULT' });
  assert.deepEqual((await readdir(join(outcome.jobPath, 'response', 'collector-locks'))).filter((name) => !name.startsWith('.')).sort(), ['1.owner.json', '1.released.json']);
  assert.equal((await getDeepPreparedJobStatus({ outputRoot, jobId: 'job_release_crash' })).status, 'completed');
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

test('never exposes a report after a staging crash and recovers a byte-identical published report', async () => withOutputRoot(async (outputRoot) => {
  const outcome = await directAsk({
    question: 'report crash', mode: 'deep', outputRoot, openCliPath: '/tmp/opencli', templatesRoot,
    clock: () => preparedAt, newJobId: () => 'job_report_crash', newTurnId: () => 'turn_report_crash',
    submit: (options) => submitDirectPreparedJob({ ...options, preflight: async () => ({ version: '1.8.7' }), ask: async () => ({ conversationId: 'report-crash-1', conversationUrl: 'https://chatgpt.com/c/report-crash-1', tool: 'Deep Research', response: '' }) })
  });
  const options = { outputRoot, jobId: 'job_report_crash', openCliPath: '/tmp/opencli', preflight: async () => ({ version: '1.8.7' }), readStatus: async () => ({ status: 'completed', conversationId: 'report-crash-1', report: '# Durable report', sources: [] }) };
  await assert.rejects(collectDeepPreparedJob({ ...options, receiptTestSeam: { failAt: 'after-deep-report-write' } }), { code: 'ERR_INJECTED_FAULT' });
  await assert.rejects(readFile(join(outcome.jobPath, 'response', 'report.md')), { code: 'ENOENT' });
  await assert.rejects(collectDeepPreparedJob({ ...options, receiptTestSeam: { failAt: 'after-deep-report-publish' } }), { code: 'ERR_INJECTED_FAULT' });
  assert.equal(await readFile(join(outcome.jobPath, 'response', 'report.md'), 'utf8'), '# Durable report');
  await assert.rejects(readFile(join(outcome.jobPath, 'response', 'result.json')), { code: 'ENOENT' });
  assert.equal((await collectDeepPreparedJob(options)).status, 'completed');
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
