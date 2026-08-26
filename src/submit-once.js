import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import { createDispatchIntent, persistAmbiguousResult, persistCompletedResult, persistDispatchHandoff, persistDispatchIntent, persistRecoveryRequiredResult } from './dispatch-receipts.js';
import { preflightOpenCli, runOpenCliStandard } from './opencli-transport.js';
import { loadPreparedBundle } from './prepared-bundle.js';

const fail = (message, code) => { const error = new Error(message); error.code = code; throw error; };

async function requireUnusedDispatch(jobRoot) {
  try { await lstat(join(jobRoot, 'dispatch')); fail('dispatch already exists', 'ERR_DISPATCH_EXISTS'); }
  catch (error) { if (error?.code === 'ERR_DISPATCH_EXISTS') throw error; if (error?.code !== 'ENOENT') throw error; }
}

export async function submitPreparedJobOnce({ outputRoot, jobId, openCliPath, now = () => new Date().toISOString(), transportOptions, receiptTestSeam } = {}) {
  if (typeof now !== 'function') fail('dispatch clock must be a function', 'ERR_DISPATCH_TIME');
  const bundle = await loadPreparedBundle({ outputRoot, jobId });
  await requireUnusedDispatch(bundle.job_root);
  const executable = await preflightOpenCli({ executablePath: openCliPath, ...transportOptions });
  const intent = createDispatchIntent({ bundle, executable, now: now() });
  const saved = await persistDispatchIntent({ jobRoot: bundle.job_root, intent, testSeam: receiptTestSeam });
  let answer;
  try { answer = await runOpenCliStandard({ executablePath: openCliPath, identity: executable, prompt: bundle.prompt, ...transportOptions }); }
  catch (error) {
    const disposition = typeof error?.code === 'string' && /^ERR_[A-Z0-9_]+$/.test(error.code) ? error.code : 'ERR_OPENCLI_UNKNOWN';
    return persistAmbiguousResult({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, disposition, now: now(), testSeam: receiptTestSeam });
  }
  const handoff = await persistDispatchHandoff({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, tool: answer.tool, now: now(), testSeam: receiptTestSeam });
  if (typeof answer.response !== 'string' || answer.response.trim().length === 0) return persistRecoveryRequiredResult({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, handoffSha256: handoff.handoff_sha256, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, disposition: 'ERR_OPENCLI_OUTPUT', now: now(), testSeam: receiptTestSeam });
  return persistCompletedResult({ jobRoot: bundle.job_root, bundle, intentSha256: saved.intent_sha256, handoffSha256: handoff.handoff_sha256, answer: answer.response, conversationId: answer.conversationId, conversationUrl: answer.conversationUrl, now: now(), testSeam: receiptTestSeam });
}
