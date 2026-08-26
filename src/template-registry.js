import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { canonicalJson } from './canonical-json.js';
import { parseStrictJsonBuffer } from './strict-json.js';

const ID = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;
const REGISTRY_LIMIT = 256 * 1024;
const MANIFEST_LIMIT = 64 * 1024;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message, code) => { const error = new Error(message); error.code = code; throw error; };

async function regularBytes(path, limit) {
  const before = await lstat(path).catch(() => fail('template path missing', 'ERR_TEMPLATE_PATH'));
  if (!before.isFile() || before.isSymbolicLink()) fail('template path is not a regular file', 'ERR_TEMPLATE_PATH');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => fail('cannot open template without following links', 'ERR_TEMPLATE_PATH'));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail('template path is not regular', 'ERR_TEMPLATE_PATH');
    if (stat.size > limit) fail('template file exceeds byte limit', 'ERR_TEMPLATE_LIMIT');
    return await handle.readFile();
  } finally { await handle.close(); }
}

function validateManifest(manifest, expected) {
  const required = ['template_id', 'version', 'status', 'supersedes', 'body', 'body_sha256', 'allowed_input_keys', 'supported_modes', 'output_expectation', 'template_sha256'];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || required.some((key) => !(key in manifest)) || Object.keys(manifest).length !== required.length || Object.keys(manifest).some((key) => !required.includes(key))) fail('invalid template manifest', 'ERR_TEMPLATE_MANIFEST');
  if (manifest.template_id !== expected.templateId || manifest.version !== expected.version || manifest.status !== 'active' || (manifest.supersedes !== null && !VERSION.test(manifest.supersedes)) || typeof manifest.body !== 'string' || !Array.isArray(manifest.allowed_input_keys) || !Array.isArray(manifest.supported_modes) || typeof manifest.output_expectation !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.body_sha256) || !/^[0-9a-f]{64}$/.test(manifest.template_sha256)) fail('invalid template manifest', 'ERR_TEMPLATE_MANIFEST');
  if (canonicalJson(manifest.allowed_input_keys) !== '["question"]' || canonicalJson(manifest.supported_modes) !== '["standard","web","deep","image"]') fail('invalid template manifest', 'ERR_TEMPLATE_MANIFEST');
  const placeholders = manifest.body.match(/\{\{[^}]*\}\}/g) ?? [];
  if (placeholders.length !== 1 || placeholders[0] !== '{{question}}' || manifest.body.split('{{question}}').length !== 2 || /\{\{|\}\}/.test(manifest.body.replace('{{question}}', ''))) fail('invalid template placeholder', 'ERR_TEMPLATE_MANIFEST');
  if (sha256(Buffer.from(manifest.body, 'utf8')) !== manifest.body_sha256) fail('template body hash mismatch', 'ERR_TEMPLATE_HASH');
  const semantic = { ...manifest }; delete semantic.template_sha256;
  if (sha256(Buffer.from(canonicalJson(semantic), 'utf8')) !== manifest.template_sha256) fail('template semantic hash mismatch', 'ERR_TEMPLATE_HASH');
}

export async function loadTemplate({ templatesRoot, templateId, version }) {
  if (typeof templateId !== 'string' || !ID.test(templateId)) fail('invalid template id', 'ERR_TEMPLATE_ID');
  if (typeof version !== 'string' || !VERSION.test(version)) fail('invalid template version', 'ERR_TEMPLATE_VERSION');
  const root = await realpath(templatesRoot).catch(() => fail('templates root unavailable', 'ERR_TEMPLATE_PATH'));
  const pathWithin = (...parts) => { const path = resolve(root, ...parts); if (path !== root && !path.startsWith(`${root}${sep}`)) fail('template escapes root', 'ERR_TEMPLATE_PATH'); return path; };
  const registry = parseStrictJsonBuffer(await regularBytes(pathWithin('registry.json'), REGISTRY_LIMIT), { requireObjectRoot: true });
  const pins = Array.isArray(registry.templates) ? registry.templates.filter((item) => item?.template_id === templateId && item?.version === version) : [];
  if (pins.length !== 1 || !/^[0-9a-f]{64}$/.test(pins[0].template_sha256)) fail('template is not pinned', 'ERR_TEMPLATE_PIN');
  const [pin] = pins;
  const directory = pathWithin(templateId);
  const directoryStat = await lstat(directory).catch(() => fail('template directory missing', 'ERR_TEMPLATE_PATH'));
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('template directory is unsafe', 'ERR_TEMPLATE_PATH');
  const manifest = parseStrictJsonBuffer(await regularBytes(pathWithin(templateId, `${version}.json`), MANIFEST_LIMIT), { requireObjectRoot: true });
  validateManifest(manifest, { templateId, version });
  if (manifest.template_sha256 !== pin.template_sha256) fail('template registry pin mismatch', 'ERR_TEMPLATE_PIN');
  return Object.freeze({ ...manifest, allowed_input_keys: Object.freeze([...manifest.allowed_input_keys]), supported_modes: Object.freeze([...manifest.supported_modes]) });
}
