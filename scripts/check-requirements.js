import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictJsonBuffer } from '../src/strict-json.js';

const TYPES = new Set(['test', 'integration', 'static-check', 'live-qualification', 'manual-gate']);
const DETERMINISTIC = new Set(['test', 'integration', 'static-check']);
const EXTERNAL = new Set(['live-qualification', 'manual-gate']);
const fail = (violations, code, id, detail) => violations.push({ code, id: id ?? null, detail: detail ?? null });

async function readableFile(root, path) {
  if (typeof path !== 'string' || path.length === 0 || isAbsolute(path) || path.split('/').includes('..')) return null;
  const full = join(root, path);
  const entry = await lstat(full).catch(() => null);
  if (!entry?.isFile() || entry.isSymbolicLink()) return null;
  return full;
}

export async function checkRequirements({ registryPath = fileURLToPath(new URL('../verification/requirements.json', import.meta.url)), root = fileURLToPath(new URL('..', import.meta.url)) } = {}) {
  const violations = [];
  let registry;
  try { registry = parseStrictJsonBuffer(await readFile(registryPath), { requireObjectRoot: true }); }
  catch { return { ok: false, code: 'REQUIREMENTS_FAILED', violations: [{ code: 'REQ_REGISTRY', id: null, detail: null }] }; }
  if (registry.schema !== 'verification.requirements.v1' || !Array.isArray(registry.requirements)) fail(violations, 'REQ_REGISTRY_SCHEMA');
  const seen = new Set();
  for (const requirement of Array.isArray(registry.requirements) ? registry.requirements : []) {
    const id = requirement?.id;
    if (!requirement || Array.isArray(requirement) || typeof requirement !== 'object' || typeof id !== 'string' || !/^REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(id) || requirement.level !== 'hard' || typeof requirement.external !== 'boolean' || typeof requirement.statement !== 'string' || requirement.statement.trim().length === 0) { fail(violations, 'REQ_SCHEMA', typeof id === 'string' ? id : null); continue; }
    if (seen.has(id)) fail(violations, 'REQ_DUPLICATE_ID', id); else seen.add(id);
    if (!Array.isArray(requirement.bindings) || requirement.bindings.length === 0) { fail(violations, 'REQ_BINDINGS', id); continue; }
    let hasExternal = false;
    for (const verification of requirement.bindings) {
      if (!verification || Array.isArray(verification) || typeof verification !== 'object' || !TYPES.has(verification.type)) { fail(violations, 'REQ_BINDING_TYPE', id); continue; }
      if (EXTERNAL.has(verification.type)) hasExternal = true;
      const full = await readableFile(root, verification.path);
      if (!full) { fail(violations, 'REQ_BINDING_PATH', id, verification.path); continue; }
      if (DETERMINISTIC.has(verification.type) && ['test', 'integration'].includes(verification.type)) {
        if (typeof verification.test !== 'string' || verification.test.length === 0 || !(await readFile(full, 'utf8')).includes(verification.test)) fail(violations, 'REQ_BINDING_TEST', id, verification.test);
      }
    }
    if (requirement.external && !hasExternal) fail(violations, 'REQ_EXTERNAL_BINDING', id);
  }
  violations.sort((left, right) => `${left.code}:${left.id ?? ''}:${left.detail ?? ''}`.localeCompare(`${right.code}:${right.id ?? ''}:${right.detail ?? ''}`));
  return { ok: violations.length === 0, code: violations.length === 0 ? 'REQUIREMENTS_OK' : 'REQUIREMENTS_FAILED', violations };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await checkRequirements({ registryPath: process.argv[2], root: process.argv[3] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
