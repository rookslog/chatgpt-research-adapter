import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { compilePrompt } from './compiler.js';
import { resolveMode } from './modes.js';
import { persistPreparedJob } from './receipts.js';
import { loadRigorProfile } from './rigor-profile.js';
import { loadTemplate } from './template-registry.js';

const defaultRigorRoot = fileURLToPath(new URL('../rigor/', import.meta.url));
const REQUEST_KEYS = new Set(['question', 'mode', 'mode_reason', 'template_id', 'template_version', 'rigor_profile', 'rigor_profile_version', 'rigor_profile_file', 'citation_level', 'audit_appendix', 'model_family', 'effort']);
const fail = (message, code) => { const error = new TypeError(message); error.code = code; throw error; };

function validateRequest(request) {
  if (!request || Array.isArray(request) || typeof request !== 'object' || Object.keys(request).some((key) => !REQUEST_KEYS.has(key))) fail('request must be a supported object shape', 'ERR_REQUEST');
  if (typeof request.question !== 'string' || request.question.trim().length === 0) fail('request question must be nonblank text', 'ERR_REQUEST');
  for (const key of ['mode', 'mode_reason', 'template_id', 'template_version', 'rigor_profile', 'rigor_profile_version', 'rigor_profile_file', 'citation_level']) if (request[key] !== undefined && typeof request[key] !== 'string') fail(`request ${key} must be a string`, 'ERR_REQUEST');
  if (request.audit_appendix !== undefined && typeof request.audit_appendix !== 'boolean') fail('request audit_appendix must be a boolean', 'ERR_REQUEST');
  if (typeof request.template_id !== 'string' || request.template_id.trim().length === 0 || typeof request.template_version !== 'string' || request.template_version.trim().length === 0) fail('request template identity is required', 'ERR_REQUEST');
  return request;
}

function standardIntent(request, mode) {
  const hasFamily = Object.hasOwn(request, 'model_family');
  const hasEffort = Object.hasOwn(request, 'effort');
  if (mode !== 'standard' && !hasFamily && !hasEffort) return undefined;
  if (mode !== 'standard') fail('model family and effort are only supported in Standard mode', 'ERR_STANDARD_INTENT_UNSUPPORTED');
  if (!hasFamily || !hasEffort) fail('Standard model family and effort are both required', 'ERR_STANDARD_INTENT_REQUIRED');
  if (request.model_family !== 'gpt-5.6-pro' || !['standard', 'extended'].includes(request.effort)) fail('Standard model family or effort is unsupported', 'ERR_STANDARD_INTENT_UNSUPPORTED');
  return Object.freeze({ model_family: request.model_family, effort: request.effort });
}

export async function compileResearchRequest({ request, templatesRoot, rigorRoot = defaultRigorRoot } = {}) {
  const valid = validateRequest(request);
  const resolved = resolveMode(valid.mode, valid.mode_reason);
  const template = await loadTemplate({ templatesRoot, templateId: valid.template_id, version: valid.template_version });
  const intent = standardIntent(valid, resolved.mode);
  const rigorProfile = await loadRigorProfile({ rigorRoot, profileId: valid.rigor_profile, version: valid.rigor_profile_version, profilePath: valid.rigor_profile_file });
  const compiled = compilePrompt({ template, rigorProfile, citationLevel: valid.citation_level ?? 'principal', auditAppendix: valid.audit_appendix ?? false, mode: resolved.mode, reason: resolved.reason, question: valid.question });
  return Object.freeze({ compiled, intent, mode: resolved.mode, mode_reason: resolved.reason });
}

export async function prepareResearchJob({ request, outputRoot, templatesRoot, rigorRoot = defaultRigorRoot, now = new Date().toISOString(), newJobId = () => `job_${randomUUID().replaceAll('-', '')}`, newTurnId = () => `turn_${randomUUID().replaceAll('-', '')}` } = {}) {
  const { compiled, intent, mode, mode_reason } = await compileResearchRequest({ request, templatesRoot, rigorRoot });
  const job = { job_id: newJobId() };
  const turn = { turn_id: newTurnId() };
  const persisted = await persistPreparedJob({ outputRoot, job, turn, compiled, now, intent });
  return Object.freeze({ ...persisted, mode, mode_reason });
}
