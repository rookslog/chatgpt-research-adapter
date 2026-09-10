import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import { createDispatchIntent, persistAmbiguousResult, persistCompletedResult, persistDispatchHandoff, persistDispatchIntent, persistRecoveryRequiredResult } from './dispatch-receipts.js';
import { preflightOpenCli, runOpenCliStandard } from './opencli-transport.js';
import { loadPreparedBundle } from './prepared-bundle.js';
import { admitStandardJob } from './standard-runtime.js';

const fail = (message, code) => { const error = new Error(message); error.code = code; throw error; };
const TRANSPORT_OPTION_KEYS = new Set(['spawnImpl', 'environment', 'timeoutMs', 'killGraceMs']);

function submitTransportOptions(value) {
  const options = value ?? {};
  if (!options || Array.isArray(options) || typeof options !== 'object' || Object.keys(options).some((key) => !TRANSPORT_OPTION_KEYS.has(key))) fail('submit transport options are invalid', 'ERR_SUBMIT_TRANSPORT_OPTIONS');
  const runtimeOptions = {};
  for (const key of TRANSPORT_OPTION_KEYS) if (options[key] !== undefined) runtimeOptions[key] = options[key];
  return Object.freeze(runtimeOptions);
}

function disposition(error) {
  return typeof error?.code === 'string' && /^ERR_[A-Z0-9_]+$/.test(error.code) ? error.code : 'ERR_OPENCLI_UNKNOWN';
}

async function requireUnusedDispatch(jobRoot) {
  for (const name of ['dispatch', 'response', 'standard']) {
    try { await lstat(join(jobRoot, name)); }
    catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    fail('prior dispatch evidence prevents submission; its outcome requires inspection', 'ERR_STANDARD_PRIOR_DISPATCH');
  }
}

export async function submitPreparedJobOnce({ outputRoot, jobId, openCliPath, now = () => new Date().toISOString(), transportOptions, receiptTestSeam, runtime, requestKey, context } = {}) {
  if (typeof now !== 'function') fail('dispatch clock must be a function', 'ERR_DISPATCH_TIME');
  const runtimeOptions = submitTransportOptions(transportOptions);
  const bundle = await loadPreparedBundle({ outputRoot, jobId });
  await requireUnusedDispatch(bundle.job_root);
  if (runtime) {
    if (bundle.current.schema !== 'standard.prepared.v2') fail('Standard driver is not qualified for this prepared bundle', 'ERR_STANDARD_DRIVER_UNQUALIFIED');
    return await admitStandardJob({ runtime, outputRoot, bundle, requestKey, context });
  }
  if (bundle.current.schema === 'standard.prepared.v2') fail('Standard driver is not qualified for this prepared bundle', 'ERR_STANDARD_DRIVER_UNQUALIFIED');
  fail('prepare a new job with explicit Standard model family and effort', 'ERR_STANDARD_LEGACY_INTENT_REQUIRED');
  const executable = await preflightOpenCli({ ...runtimeOptions, executablePath: openCliPath });
  const intent = createDispatchIntent({ bundle, executable, now: now() });
  const saved = await persistDispatchIntent({ jobRoot: bundle.job_root, intent, testSeam: receiptTestSeam });
  let answer;
  try { answer = await runOpenCliStandard({ ...runtimeOptions, executablePath: openCliPath, identity: executable, prompt: bundle.prompt }); }
  catch (error) {
    return persistAmbiguousResult({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, disposition: disposition(error), now: now(), testSeam: receiptTestSeam });
  }
  const handoff = await persistDispatchHandoff({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, tool: answer.tool, now: now(), testSeam: receiptTestSeam });
  if (typeof answer.response !== 'string' || answer.response.trim().length === 0) return persistRecoveryRequiredResult({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, handoffSha256: handoff.handoff_sha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, disposition: 'ERR_OPENCLI_OUTPUT', now: now(), testSeam: receiptTestSeam });
  try {
    return await persistCompletedResult({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, handoffSha256: handoff.handoff_sha256, answer: answer.response, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, now: now(), testSeam: receiptTestSeam });
  } catch (error) {
    return persistRecoveryRequiredResult({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, handoffSha256: handoff.handoff_sha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, disposition: disposition(error), now: now() });
  }
}
