import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

import { canonicalJson } from './canonical-json.js';
import { parseStrictJsonBuffer } from './strict-json.js';

const ID = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HASH = /^[0-9a-f]{64}$/;
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const MANIFEST_KEYS = ['body', 'claim_coverage', 'claim_ledger', 'profile_id', 'protocol_id', 'protocol_version', 'status', 'version'];
const fail = (message, code) => { const error = new TypeError(message); error.code = code; throw error; };
const sha256 = (value) => createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');

async function regularBytes(path) {
  const before = await lstat(path).catch(() => fail('rigor profile path missing', 'ERR_RIGOR_PATH'));
  if (!before.isFile() || before.isSymbolicLink()) fail('rigor profile path is not a regular file', 'ERR_RIGOR_PATH');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => fail('cannot open rigor profile without following links', 'ERR_RIGOR_PATH'));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 16 * 1024) fail('rigor profile file is invalid', stat.size > 16 * 1024 ? 'ERR_RIGOR_LIMIT' : 'ERR_RIGOR_PATH');
    return await handle.readFile();
  } finally { await handle.close(); }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || Object.keys(manifest).sort().join('\0') !== [...MANIFEST_KEYS].sort().join('\0')) fail('rigor profile manifest is invalid', 'ERR_RIGOR_PROFILE');
  if (!ID.test(manifest.profile_id ?? '') || !VERSION.test(manifest.version ?? '') || manifest.status !== 'active' || manifest.protocol_id !== 'chatgpt-research-epistemic' || manifest.protocol_version !== '1.0.0' || !['conclusions', 'substantive', 'all-claims'].includes(manifest.claim_coverage) || typeof manifest.claim_ledger !== 'boolean' || typeof manifest.body !== 'string' || manifest.body.trim().length === 0 || Buffer.byteLength(manifest.body, 'utf8') > 12 * 1024 || manifest.body.includes('\0') || BIDI.test(manifest.body)) fail('rigor profile manifest is invalid', 'ERR_RIGOR_PROFILE');
  const body_sha256 = sha256(manifest.body);
  const semantic = { ...manifest, body_sha256 };
  return Object.freeze({ ...semantic, profile_sha256: sha256(canonicalJson(semantic)) });
}

export async function loadRigorProfile({ rigorRoot, profileId, version, profilePath } = {}) {
  if (profilePath !== undefined) {
    if (profileId !== undefined || version !== undefined) fail('custom profile cannot be combined with built-in identity', 'ERR_RIGOR_SELECTION');
    if (typeof profilePath !== 'string' || !isAbsolute(profilePath)) fail('custom rigor profile path must be absolute', 'ERR_RIGOR_PATH');
    return validateManifest(parseStrictJsonBuffer(await regularBytes(profilePath), { requireObjectRoot: true }));
  }

  const selectedId = profileId ?? 'standard'; const selectedVersion = version ?? '1.0.0';
  if (!ID.test(selectedId)) fail('invalid rigor profile id', 'ERR_RIGOR_ID');
  if (!VERSION.test(selectedVersion)) fail('invalid rigor profile version', 'ERR_RIGOR_VERSION');
  if (typeof rigorRoot !== 'string') fail('rigor root is required', 'ERR_RIGOR_PATH');
  const root = await realpath(rigorRoot).catch(() => fail('rigor root unavailable', 'ERR_RIGOR_PATH'));
  const pathWithin = (...parts) => { const path = resolve(root, ...parts); if (path !== root && !path.startsWith(`${root}${sep}`)) fail('rigor path escapes root', 'ERR_RIGOR_PATH'); return path; };
  const registry = parseStrictJsonBuffer(await regularBytes(pathWithin('registry.json')), { requireObjectRoot: true });
  if (Object.keys(registry).length !== 1 || !Array.isArray(registry.profiles)) fail('rigor registry is invalid', 'ERR_RIGOR_PIN');
  const pins = registry.profiles.filter((item) => item?.profile_id === selectedId && item?.version === selectedVersion);
  if (pins.length !== 1 || !HASH.test(pins[0].profile_sha256 ?? '') || Object.keys(pins[0]).sort().join('\0') !== ['profile_id', 'profile_sha256', 'version'].sort().join('\0')) fail('rigor profile is not pinned', 'ERR_RIGOR_PIN');
  const directory = pathWithin('profiles', selectedId);
  const directoryStat = await lstat(directory).catch(() => fail('rigor profile directory missing', 'ERR_RIGOR_PATH'));
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('rigor profile directory is unsafe', 'ERR_RIGOR_PATH');
  const profile = validateManifest(parseStrictJsonBuffer(await regularBytes(pathWithin('profiles', selectedId, `${selectedVersion}.json`)), { requireObjectRoot: true }));
  if (profile.profile_id !== selectedId || profile.version !== selectedVersion || profile.profile_sha256 !== pins[0].profile_sha256) fail('rigor profile registry pin mismatch', 'ERR_RIGOR_PIN');
  return profile;
}
