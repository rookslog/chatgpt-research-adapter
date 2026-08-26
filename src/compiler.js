import { createHash } from 'node:crypto';

import { canonicalJson } from './canonical-json.js';

const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const fail = (message, code) => { const error = new TypeError(message); error.code = code; throw error; };

function opaqueText(value, label, limit) {
  if (typeof value !== 'string') fail(`${label} must be a string`, 'ERR_TEXT');
  if (value.trim().length === 0) fail(`${label} must be nonblank`, 'ERR_TEXT');
  if (Buffer.byteLength(value, 'utf8') > limit) fail(`${label} exceeds byte limit`, 'ERR_LIMIT');
  if (value.includes('\0') || BIDI.test(value)) fail(`${label} contains forbidden controls`, 'ERR_TEXT');
  for (let index = 0; index < value.length; index += 1) { const unit = value.charCodeAt(index); if ((unit >= 0xd800 && unit <= 0xdbff && (index + 1 === value.length || value.charCodeAt(index + 1) < 0xdc00 || value.charCodeAt(index + 1) > 0xdfff)) || (unit >= 0xdc00 && unit <= 0xdfff && (index === 0 || value.charCodeAt(index - 1) < 0xd800 || value.charCodeAt(index - 1) > 0xdbff))) fail(`${label} contains unpaired surrogate`, 'ERR_TEXT'); }
}

function sha256(value) { return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex'); }

function compileRigor({ rigorProfile, citationLevel, auditAppendix }) {
  if (rigorProfile === undefined) fail('versioned rigor profile is required', 'ERR_RIGOR_PROFILE');
  const keys = ['body', 'body_sha256', 'claim_coverage', 'claim_ledger', 'profile_id', 'profile_sha256', 'protocol_id', 'protocol_version', 'status', 'version'];
  if (!rigorProfile || typeof rigorProfile !== 'object' || Array.isArray(rigorProfile) || Object.keys(rigorProfile).sort().join('\0') !== keys.sort().join('\0')) fail('rigor profile is invalid', 'ERR_RIGOR_PROFILE');
  opaqueText(rigorProfile.body, 'rigor profile body', 16 * 1024);
  if (rigorProfile.status !== 'active' || rigorProfile.protocol_id !== 'chatgpt-research-epistemic' || rigorProfile.protocol_version !== '1.0.0' || !/^[a-z][a-z0-9-]{0,63}$/.test(rigorProfile.profile_id) || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(rigorProfile.version) || !['conclusions', 'substantive', 'all-claims'].includes(rigorProfile.claim_coverage) || typeof rigorProfile.claim_ledger !== 'boolean' || !/^[0-9a-f]{64}$/.test(rigorProfile.body_sha256) || !/^[0-9a-f]{64}$/.test(rigorProfile.profile_sha256)) fail('rigor profile is invalid', 'ERR_RIGOR_PROFILE');
  if (sha256(rigorProfile.body) !== rigorProfile.body_sha256) fail('rigor profile body hash mismatch', 'ERR_RIGOR_HASH');
  const semantic = { ...rigorProfile }; delete semantic.profile_sha256;
  if (sha256(canonicalJson(semantic)) !== rigorProfile.profile_sha256) fail('rigor profile semantic hash mismatch', 'ERR_RIGOR_HASH');
  if (!['principal', 'expanded'].includes(citationLevel) || typeof auditAppendix !== 'boolean') fail('rigor options are invalid', 'ERR_RIGOR_OPTIONS');
  const config = `protocol=${rigorProfile.protocol_id}/${rigorProfile.protocol_version} profile=${rigorProfile.profile_id}/${rigorProfile.version} citations=${citationLevel} audit=${auditAppendix}`;
  const citation = citationLevel === 'expanded' ? '\nExpanded citations: cite every supported substantive claim directly and name material source roles; no arbitrary count.' : '';
  const appendix = auditAppendix ? '\nAudit appendix: add evidence cutoff, source inventory/dependencies, contrary evidence, coverage gaps, scope, unresolved conflicts, unchecked items, and revision triggers.' : '';
  return {
    suffix: `\n\n--- epistemic rigor ---\n${config}\n${rigorProfile.body}${citation}${appendix}\n`,
    identity: { rigor_protocol_id: rigorProfile.protocol_id, rigor_protocol_version: rigorProfile.protocol_version, rigor_profile_id: rigorProfile.profile_id, rigor_profile_version: rigorProfile.version, rigor_profile_sha256: rigorProfile.profile_sha256, citation_level: citationLevel, audit_appendix: auditAppendix }
  };
}

export function compilePrompt({ template, rigorProfile, citationLevel = 'principal', auditAppendix = false, mode, reason, question }) {
  if (!template || typeof template.body !== 'string') fail('template is required', 'ERR_TEMPLATE_MANIFEST');
  const placeholders = template.body.match(/\{\{[^}]*\}\}/g) ?? [];
  if (placeholders.length !== 1 || placeholders[0] !== '{{question}}' || template.body.split('{{question}}').length !== 2 || /\{\{|\}\}/.test(template.body.replace('{{question}}', '')) || !Array.isArray(template.supported_modes) || !template.supported_modes.includes(mode)) fail('template body or mode is invalid', 'ERR_TEMPLATE_MANIFEST');
  opaqueText(template.body, 'template body', 32 * 1024);
  opaqueText(question, 'question', 32 * 1024);
  opaqueText(reason, 'mode reason', 2 * 1024);
  const rigor = compileRigor({ rigorProfile, citationLevel, auditAppendix });
  const modeSuffix = `\n\n--- chatgpt-research mode ---\n${canonicalJson({ mode, reason })}\n`;
  const prompt = template.body.replace('{{question}}', question) + rigor.suffix + modeSuffix;
  if (Buffer.byteLength(prompt, 'utf8') > 64 * 1024) fail('prompt exceeds byte limit', 'ERR_LIMIT');
  return Object.freeze({ prompt, prompt_sha256: sha256(prompt), template_id: template.template_id, template_version: template.version, template_sha256: template.template_sha256, template_body_sha256: template.body_sha256, mode, mode_reason: reason, ...rigor.identity });
}
