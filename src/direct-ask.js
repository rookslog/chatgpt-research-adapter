import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open, rename, rm, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from './canonical-json.js';
import { preflightOpenCli, runOpenCliAsk, runOpenCliDeepResearchResult, runOpenCliDetail } from './opencli-transport.js';
import { prepareResearchJob } from './prepare.js';
import { loadPreparedBundle } from './prepared-bundle.js';

const templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url));
const rigorRoot = fileURLToPath(new URL('../rigor/', import.meta.url));
const fail = (message, code) => { const error = new TypeError(message); error.code = code; throw error; };
const fault = (seam, point) => { if (seam?.failAt === point) fail(`injected fault at ${point}`, 'ERR_INJECTED_FAULT'); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MODE_TO_TOOL = Object.freeze({ standard: '', web: 'Web Search', deep: 'Deep Research' });
const CHATGPT_CONVERSATION_ROOT = ['https:', '', 'chatgpt.com', 'c'].join('/');
const TRANSPORT_OPTION_KEYS = new Set(['askTimeoutSeconds', 'deepTimeoutSeconds', 'spawnImpl', 'environment', 'timeoutMs', 'killGraceMs']);

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } catch (error) { if (!['EINVAL', 'ENOTSUP', 'ENOSYS'].includes(error?.code)) throw error; } finally { await handle.close(); }
}

async function writeDurableExclusive(path, bytes, directory) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await handle.writeFile(payload); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(directory);
  return hash(payload);
}

async function writeDurableJson(path, value, directory) {
  return writeDurableExclusive(path, Buffer.from(`${canonicalJson(value)}\n`), directory);
}

async function publishDirectIntent({ jobPath, responseRoot, intent, receiptTestSeam }) {
  const stagingRoot = join(jobPath, `.response-staging-${randomUUID()}`);
  await mkdir(stagingRoot, { mode: 0o700 });
  let published = false;
  try {
    const intentSha256 = await writeDurableJson(join(stagingRoot, 'intent.json'), intent, stagingRoot);
    fault(receiptTestSeam, 'after-direct-intent-write');
    try { await rename(stagingRoot, responseRoot); }
    catch (error) { if (['EEXIST', 'ENOTEMPTY'].includes(error?.code)) fail('direct response already exists', 'ERR_DIRECT_EXISTS'); throw error; }
    published = true;
    await syncDirectory(jobPath);
    return intentSha256;
  } finally {
    if (!published) await rm(stagingRoot, { recursive: true, force: true });
  }
}

function directTransportOptions(value) {
  const options = value ?? {};
  if (!options || Array.isArray(options) || typeof options !== 'object' || Object.keys(options).some((key) => !TRANSPORT_OPTION_KEYS.has(key))) fail('direct transport options are invalid', 'ERR_DIRECT_TRANSPORT_OPTIONS');
  const { askTimeoutSeconds = 600, deepTimeoutSeconds = 1200, spawnImpl, environment, timeoutMs, killGraceMs } = options;
  const runtimeOptions = {};
  if (spawnImpl !== undefined) runtimeOptions.spawnImpl = spawnImpl;
  if (environment !== undefined) runtimeOptions.environment = environment;
  if (timeoutMs !== undefined) runtimeOptions.timeoutMs = timeoutMs;
  if (killGraceMs !== undefined) runtimeOptions.killGraceMs = killGraceMs;
  return Object.freeze({ askTimeoutSeconds, deepTimeoutSeconds, runtimeOptions: Object.freeze(runtimeOptions) });
}

function validateHandoff(answer, mode) {
  if (!answer || typeof answer !== 'object' || typeof answer.conversationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(answer.conversationId) || answer.conversationUrl !== `${CHATGPT_CONVERSATION_ROOT}/${answer.conversationId}` || answer.tool !== MODE_TO_TOOL[mode]) fail('direct ask provider handoff is invalid', 'ERR_DIRECT_HANDOFF');
}

function disposition(error) {
  return typeof error?.code === 'string' && /^ERR_[A-Z0-9_]+$/.test(error.code) ? error.code : 'ERR_OPENCLI_UNKNOWN';
}

function directResultBase({ bundle, jobId, mode, intentSha256, handoffSha256 = null, conversationId = null, conversationUrl = null, tool = null, now }) {
  return { schema: 'm004.direct-result.v1', job_id: jobId, mode, rigor_protocol_id: bundle.rigor_protocol_id, rigor_protocol_version: bundle.rigor_protocol_version, rigor_profile_id: bundle.rigor_profile_id, rigor_profile_version: bundle.rigor_profile_version, rigor_profile_sha256: bundle.rigor_profile_sha256, citation_level: bundle.citation_level, audit_appendix: bundle.audit_appendix, intent_sha256: intentSha256, handoff_sha256: handoffSha256, conversation_id: conversationId, conversation_url: conversationUrl, tool, answer_path: null, answer_sha256: null, answer_bytes: null, report_path: null, report_sha256: null, report_bytes: null, sources: [], finished_at: now };
}

async function persistDirectResult(responseRoot, result, testSeam) {
  const finalPath = join(responseRoot, 'result.json');
  const stagingPath = join(responseRoot, `.result-staging-${randomUUID()}.json`);
  const payload = Buffer.from(`${canonicalJson(Object.freeze(result))}\n`);
  let handle;
  let published = false;
  try {
    handle = await open(stagingPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await handle.writeFile(payload);
      fault(testSeam, 'after-direct-result-write');
      await handle.sync();
    } finally {
      await handle.close();
      handle = undefined;
    }
    try { await link(stagingPath, finalPath); }
    catch (error) { if (error?.code === 'EEXIST') fail('direct response already exists', 'ERR_DIRECT_EXISTS'); throw error; }
    published = true;
    await unlink(stagingPath);
    fault(testSeam, 'after-direct-result-publish');
    await syncDirectory(responseRoot);
    return Object.freeze(result);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (published) {
      await rm(finalPath, { force: true });
      await syncDirectory(responseRoot);
    } else {
      await rm(stagingPath, { force: true });
    }
    throw error;
  }
}

async function readStableWebDetail(readDetail, detailOptions) {
  const first = await readDetail(detailOptions);
  const second = await readDetail(detailOptions);
  if (second.response === first.response) return second;
  const third = await readDetail(detailOptions);
  if (third.response !== second.response) {
    fail('ChatGPT Web answer did not stabilize before the bounded read limit', 'ERR_OPENCLI_DETAIL_UNSTABLE');
  }
  return third;
}

export async function submitDirectPreparedJob({ mode, outputRoot, jobId, jobPath, openCliPath, transportOptions = {}, now = () => new Date().toISOString(), preflight = preflightOpenCli, ask = runOpenCliAsk, readDetail = runOpenCliDetail, readDeep = runOpenCliDeepResearchResult, receiptTestSeam } = {}) {
  const bundle = await loadPreparedBundle({ outputRoot, jobId, allowedModes: [mode] });
  if (bundle.mode !== mode || bundle.job_root !== jobPath) fail('prepared job does not match direct ask', 'ERR_DIRECT_ASK_JOB');
  const { askTimeoutSeconds, deepTimeoutSeconds, runtimeOptions } = directTransportOptions(transportOptions);
  const identity = await preflight({ ...runtimeOptions, executablePath: openCliPath });
  const responseRoot = join(jobPath, 'response');
  const intent = Object.freeze({
    schema: 'm004.direct-intent.v1',
    status: 'dispatching',
    job_id: jobId,
    mode,
    prompt_sha256: bundle.prompt_sha256,
    opencli_path: openCliPath,
    opencli_version: identity.version,
    intent_recorded_at: now()
  });
  const intentSha256 = await publishDirectIntent({ jobPath, responseRoot, intent, receiptTestSeam });
  let answer;
  try {
    answer = await ask({ ...runtimeOptions, executablePath: openCliPath, identity, prompt: bundle.prompt, mode, timeoutSeconds: askTimeoutSeconds });
    validateHandoff(answer, mode);
  } catch (error) {
    return persistDirectResult(responseRoot, { ...directResultBase({ bundle, jobId, mode, intentSha256, now: now() }), status: 'ambiguous_effect', process_disposition: disposition(error), remote_effect: 'unknown', retry_decision: 'prohibited' });
  }
  const handoff = Object.freeze({
    schema: 'm004.direct-handoff.v1',
    status: 'accepted',
    job_id: jobId,
    mode,
    intent_sha256: intentSha256,
    conversation_id: answer.conversationId,
    conversation_url: answer.conversationUrl,
    tool: answer.tool,
    accepted_at: now()
  });
  const handoffSha256 = await writeDurableJson(join(responseRoot, 'handoff.json'), handoff, responseRoot);
  let answerPath = null; let answerSha256 = null; let answerBytes = null; let report; let reportPath = null; let reportSha256 = null; let reportBytes = null;
  try {
    if (mode === 'deep') {
      report = await readDeep({ ...runtimeOptions, executablePath: openCliPath, identity, conversationId: answer.conversationId, timeoutSeconds: deepTimeoutSeconds });
      canonicalJson(report.sources);
      const reportPayload = Buffer.from(report.report);
      reportPath = join(responseRoot, 'report.md');
      reportSha256 = await writeDurableExclusive(reportPath, reportPayload, responseRoot);
      reportBytes = reportPayload.length;
    } else {
      const detailOptions = { ...runtimeOptions, executablePath: openCliPath, identity, conversationId: answer.conversationId, timeoutSeconds: askTimeoutSeconds };
      const detail = mode === 'web'
        ? await readStableWebDetail(readDetail, detailOptions)
        : await readDetail(detailOptions);
      const answerPayload = Buffer.from(detail.response);
      answerPath = join(responseRoot, 'answer.md');
      answerSha256 = await writeDurableExclusive(answerPath, answerPayload, responseRoot);
      answerBytes = answerPayload.length;
    }
    const result = { ...directResultBase({ bundle, jobId, mode, intentSha256, handoffSha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, tool: answer.tool, now: now() }), status: 'completed', process_disposition: 'exit_0_validated', remote_effect: 'completed', retry_decision: 'not_applicable', answer_path: answerPath, answer_sha256: answerSha256, answer_bytes: answerBytes, report_path: reportPath, report_sha256: reportSha256, report_bytes: reportBytes, sources: report?.sources ?? [] };
    canonicalJson(result);
    return await persistDirectResult(responseRoot, result, receiptTestSeam);
  } catch (error) {
    await persistDirectResult(responseRoot, { ...directResultBase({ bundle, jobId, mode, intentSha256, handoffSha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, tool: answer.tool, now: now() }), status: 'recovery_required', process_disposition: disposition(error), remote_effect: 'accepted', retry_decision: 'prohibited' });
    throw error;
  }
}

export async function directAsk({ question, prompt, mode, rigorProfile, rigorProfileVersion, rigorProfileFile, citationLevel, auditAppendix, outputRoot, openCliPath, transportOptions, clock = () => new Date().toISOString(), newJobId, newTurnId, submit = submitDirectPreparedJob, templatesRoot: templateRoot = templatesRoot, rigorRoot: profileRoot = rigorRoot } = {}) {
  if (question !== undefined && prompt !== undefined) fail('provide question or prompt, not both', 'ERR_DIRECT_ASK_INPUT');
  if (typeof outputRoot !== 'string' || !isAbsolute(outputRoot)) fail('output root must be absolute', 'ERR_DIRECT_ASK_OUTPUT');
  if (typeof openCliPath !== 'string' || !isAbsolute(openCliPath)) fail('OpenCLI path must be absolute', 'ERR_OPENCLI_PATH');
  const requestedMode = mode ?? 'standard';
  if (!['standard', 'web', 'deep'].includes(requestedMode)) fail('mode must be standard, web, or deep', 'ERR_DIRECT_ASK_MODE');
  const request = { question: question ?? prompt, template_id: 'research-question', template_version: '1.0.0' };
  if (mode !== undefined) request.mode = mode;
  if (requestedMode !== 'standard') request.mode_reason = 'direct-ask';
  if (rigorProfile !== undefined) request.rigor_profile = rigorProfile;
  if (rigorProfileVersion !== undefined) request.rigor_profile_version = rigorProfileVersion;
  if (rigorProfileFile !== undefined) request.rigor_profile_file = rigorProfileFile;
  if (citationLevel !== undefined) request.citation_level = citationLevel;
  if (auditAppendix !== undefined) request.audit_appendix = auditAppendix;
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const job = await prepareResearchJob({ request, outputRoot, templatesRoot: templateRoot, rigorRoot: profileRoot, now: clock(), newJobId, newTurnId });
  const jobPath = join(outputRoot, 'jobs', job.job_id);
  const result = await submit({ mode: job.mode, outputRoot, jobId: job.job_id, jobPath, openCliPath, transportOptions, now: clock });
  return Object.freeze({ job, jobPath, result });
}
