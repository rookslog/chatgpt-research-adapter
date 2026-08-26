import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/canonical-json.js';
import { parseStrictJson, parseStrictJsonBuffer } from '../src/strict-json.js';
import { compilePrompt as compilePromptRaw } from '../src/compiler.js';
import { loadRigorProfile } from '../src/rigor-profile.js';
import { loadTemplate } from '../src/template-registry.js';

const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const rigorRoot = new URL('../rigor/', import.meta.url).pathname;
const goldenPath = new URL('./fixtures/golden-prompt.utf8', import.meta.url);
const GOLDEN_SHA256 = 'b0e2a124d2f4cced919c8508cbe22635bb101aedb27427073b9baa30c9ceb81c';
const stableJson = (value) => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

function rigorProfile(overrides = {}) {
  const body = overrides.body ?? 'Answer first. Tag substantive claims [C#]. End with a claim ledger.';
  const semantic = {
    profile_id: overrides.profile_id ?? 'standard', version: overrides.version ?? '1.0.0', status: 'active',
    protocol_id: 'chatgpt-research-epistemic', protocol_version: '1.0.0', claim_coverage: 'substantive', claim_ledger: true,
    body, body_sha256: digest(body)
  };
  return Object.freeze({ ...semantic, profile_sha256: digest(stableJson(semantic)) });
}

const compilePrompt = (options) => compilePromptRaw({ rigorProfile: rigorProfile(), ...options });

test('canonical JSON sorts keys and rejects non-JSON values and ambiguous numbers', () => {
  assert.equal(canonicalJson({ z: [true, { b: 1, a: null }], a: 'x' }), '{"a":"x","z":[true,{"a":null,"b":1}]}');
  for (const value of [undefined, NaN, Infinity, -Infinity, -0, 1n, () => {}]) assert.throws(() => canonicalJson(value), { code: 'ERR_CANONICAL_JSON' });
});

test('strict JSON parser rejects duplicate keys, malformed input, BOM, trailing content, and non-object request roots', () => {
  for (const source of ['{"a":1,"a":2}', '{"a":{"b":1,"b":2}}', '{"a":1} trailing', '\uFEFF{}', '{', '[]', 'null']) assert.throws(() => parseStrictJson(source, { requireObjectRoot: true }), { code: 'ERR_STRICT_JSON' });
  assert.deepEqual(parseStrictJson('{"question":"ok"}', { requireObjectRoot: true }), { question: 'ok' });
  assert.throws(() => parseStrictJsonBuffer(Buffer.from([0xc3, 0x28])), { code: 'ERR_STRICT_JSON' });
  assert.throws(() => parseStrictJsonBuffer(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), { code: 'ERR_STRICT_JSON' });
});

test('loads a pinned active template and compiles exact golden UTF-8 prompt bytes', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  const profile = await loadRigorProfile({ rigorRoot });
  const compiled = compilePromptRaw({ template, rigorProfile: profile, mode: 'web', reason: 'source-supported', question: 'What is 2 + 2?' });
  const golden = await readFile(goldenPath);
  assert.deepEqual(Buffer.from(compiled.prompt, 'utf8'), golden);
  assert.equal(compiled.prompt_sha256, GOLDEN_SHA256);
  assert.ok(Object.isFrozen(compiled));
  assert.deepEqual(Object.keys(compiled).sort(), ['audit_appendix', 'citation_level', 'mode', 'mode_reason', 'prompt', 'prompt_sha256', 'rigor_profile_id', 'rigor_profile_sha256', 'rigor_profile_version', 'rigor_protocol_id', 'rigor_protocol_version', 'template_body_sha256', 'template_id', 'template_sha256', 'template_version']);
});

test('compiler rejects a prompt without an explicit versioned rigor profile', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  assert.throws(() => compilePromptRaw({ template, mode: 'standard', reason: 'default', question: 'No silent omission.' }), { code: 'ERR_RIGOR_PROFILE' });
});

test('default standard rigor stays within an 800-byte prompt-overhead budget', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  const profile = await loadRigorProfile({ rigorRoot });
  const question = 'q'; const mode = 'standard'; const reason = 'default';
  const compiled = compilePromptRaw({ template, rigorProfile: profile, mode, reason, question });
  const withoutRigor = `${template.body.replace('{{question}}', question)}\n\n--- chatgpt-research mode ---\n${canonicalJson({ mode, reason })}\n`;
  assert.ok(Buffer.byteLength(compiled.prompt) - Buffer.byteLength(withoutRigor) <= 800);
});

test('compiler injects versioned epistemic rigor and exposes its exact identity', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  const profile = rigorProfile();
  const compiled = compilePrompt({ template, rigorProfile: profile, citationLevel: 'expanded', auditAppendix: true, mode: 'standard', reason: 'default', question: 'Assess the evidence.' });
  assert.match(compiled.prompt, /--- epistemic rigor ---/);
  assert.match(compiled.prompt, /chatgpt-research-epistemic/);
  assert.match(compiled.prompt, /Tag substantive claims \[C#\]/);
  assert.match(compiled.prompt, /expanded/);
  assert.match(compiled.prompt, /audit appendix/i);
  assert.equal(compiled.rigor_protocol_id, 'chatgpt-research-epistemic');
  assert.equal(compiled.rigor_protocol_version, '1.0.0');
  assert.equal(compiled.rigor_profile_id, 'standard');
  assert.equal(compiled.rigor_profile_version, '1.0.0');
  assert.equal(compiled.rigor_profile_sha256, profile.profile_sha256);
  assert.equal(compiled.citation_level, 'expanded');
  assert.equal(compiled.audit_appendix, true);
});

test('compiler preserves Unicode, line endings, and placeholder-like question data without reparsing', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  for (const question of ['e\u0301', 'é', 'one\r\ntwo', 'a\u2028b\u2029c', '{{question}} {{mode}}']) assert.ok(compilePrompt({ template, mode: 'deep', reason: 'deliberate', question }).prompt.includes(question));
  for (const question of ['a\0b', '\ud800']) assert.throws(() => compilePrompt({ template, mode: 'deep', reason: 'deliberate', question }), { code: 'ERR_TEXT' });
  for (const reason of ['a\0b', '\ud800', 'a\u202eb']) assert.throws(() => compilePrompt({ template, mode: 'deep', reason, question: 'q' }), { code: 'ERR_TEXT' });
});

test('compiler rejects unsupported modes and malformed direct template bodies', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  assert.throws(() => compilePrompt({ template: { ...template, supported_modes: ['web'] }, mode: 'deep', reason: 'why', question: 'q' }), { code: 'ERR_TEMPLATE_MANIFEST' });
  for (const body of ['no placeholder', '{{question}}{{question}}', '{{question}} {{extra}}']) assert.throws(() => compilePrompt({ template: { ...template, body }, mode: 'web', reason: 'why', question: 'q' }), { code: 'ERR_TEMPLATE_MANIFEST' });
});

test('compiler independently rejects empty and whitespace-only question and reason', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  for (const value of ['', ' \t\n']) assert.throws(() => compilePrompt({ template, mode: 'web', reason: 'why', question: value }), { code: 'ERR_TEXT' });
  for (const value of ['', ' \t\n']) assert.throws(() => compilePrompt({ template, mode: 'web', reason: value, question: 'q' }), { code: 'ERR_TEXT' });
});

test('rejects question, reason, template body, and prompt byte-limit violations', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  assert.throws(() => compilePrompt({ template, mode: 'web', reason: 'x'.repeat(2049), question: 'q' }), { code: 'ERR_LIMIT' });
  assert.throws(() => compilePrompt({ template, mode: 'web', reason: 'r', question: 'x'.repeat(32 * 1024 + 1) }), { code: 'ERR_LIMIT' });
  assert.throws(() => compilePrompt({ template: { ...template, body: `{{question}}${'x'.repeat(32 * 1024)}` }, mode: 'web', reason: 'r', question: 'q' }), { code: 'ERR_LIMIT' });
  assert.throws(() => compilePrompt({ template, mode: 'web', reason: 'r', question: 'x'.repeat(64 * 1024) }), { code: 'ERR_LIMIT' });
  assert.doesNotThrow(() => compilePrompt({ template, mode: 'web', reason: 'r'.repeat(2048), question: 'x'.repeat(32 * 1024) }));
  assert.throws(() => compilePrompt({ template, mode: 'web', reason: 'r'.repeat(2049), question: 'q' }), { code: 'ERR_LIMIT' });
  const bodyAtLimit = `{{question}}${'x'.repeat(32 * 1024 - Buffer.byteLength('{{question}}'))}`;
  assert.doesNotThrow(() => compilePrompt({ template: { ...template, body: bodyAtLimit }, mode: 'web', reason: 'r', question: 'q' }));
  assert.throws(() => compilePrompt({ template: { ...template, body: bodyAtLimit }, mode: 'web', reason: 'r', question: 'q'.repeat(32 * 1024) }), { code: 'ERR_LIMIT' });
});

test('accepts an exact 64 KiB combined prompt and rejects the next ASCII byte', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  const placeholder = '{{question}}'; const body = `${placeholder}${'b'.repeat(32 * 1024 - Buffer.byteLength(placeholder))}`;
  const reason = 'r'; const profile = rigorProfile({ body: 'r' });
  const seed = compilePromptRaw({ template: { ...template, body }, rigorProfile: profile, mode: 'web', reason, question: 'q' });
  const question = 'q'.repeat(64 * 1024 - Buffer.byteLength(seed.prompt) + 1);
  assert.ok(Buffer.byteLength(body) <= 32 * 1024); assert.ok(Buffer.byteLength(question) <= 32 * 1024); assert.ok(Buffer.byteLength(reason) <= 2 * 1024);
  const exact = compilePromptRaw({ template: { ...template, body }, rigorProfile: profile, mode: 'web', reason, question });
  assert.equal(Buffer.byteLength(exact.prompt), 64 * 1024);
  assert.throws(() => compilePromptRaw({ template: { ...template, body }, rigorProfile: profile, mode: 'web', reason, question: `${question}x` }), { code: 'ERR_LIMIT' });
});

test('rejects invalid template identifiers and traversal-like version values', async () => {
  for (const templateId of ['Research', '../x', 'a/b', 'a\\b', 'a%2f', 'а']) await assert.rejects(loadTemplate({ templatesRoot, templateId, version: '1.0.0' }), { code: 'ERR_TEMPLATE_ID' });
  for (const version of ['1.0', 'v1.0.0', '../1.0.0', '1.0.0/../x', '1.0.0%2f', '01.0.0']) await assert.rejects(loadTemplate({ templatesRoot, templateId: 'research-question', version }), { code: 'ERR_TEMPLATE_VERSION' });
});

test('rejects symlinked registry, template directory, and manifest file', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'm002-template-'));
  try {
    const registry = new URL('../templates/registry.json', import.meta.url);
    const manifest = new URL('../templates/research-question/1.0.0.json', import.meta.url);
    await symlink(join(templatesRoot, 'registry.json'), join(scratch, 'registry.json'));
    await assert.rejects(loadTemplate({ templatesRoot: scratch, templateId: 'research-question', version: '1.0.0' }), { code: 'ERR_TEMPLATE_PATH' });
    await unlink(join(scratch, 'registry.json')); await writeFile(join(scratch, 'registry.json'), await readFile(registry));
    await symlink(join(templatesRoot, 'research-question'), join(scratch, 'research-question'));
    await assert.rejects(loadTemplate({ templatesRoot: scratch, templateId: 'research-question', version: '1.0.0' }), { code: 'ERR_TEMPLATE_PATH' });
    await unlink(join(scratch, 'research-question')); await mkdir(join(scratch, 'research-question'));
    await symlink(manifest.pathname, join(scratch, 'research-question', '1.0.0.json'));
    await assert.rejects(loadTemplate({ templatesRoot: scratch, templateId: 'research-question', version: '1.0.0' }), { code: 'ERR_TEMPLATE_PATH' });
  }
  finally { await rm(scratch, { recursive: true, force: true }); }
});

test('rejects altered semantic manifest fields against the independent registry pin', async () => {
  const base = JSON.parse(await readFile(new URL('../templates/research-question/1.0.0.json', import.meta.url), 'utf8'));
  const fields = ['template_id', 'version', 'status', 'supersedes', 'body', 'body_sha256', 'allowed_input_keys', 'supported_modes', 'output_expectation'];
  for (const field of fields) {
    const scratch = await mkdtemp(join(tmpdir(), 'm002-template-'));
    try {
      await writeFile(join(scratch, 'registry.json'), await readFile(new URL('../templates/registry.json', import.meta.url)));
      await mkdir(join(scratch, 'research-question'));
      const next = structuredClone(base);
      next[field] = field === 'template_id' ? 'other' : field === 'version' ? '1.0.1' : field === 'status' ? 'retired' : field === 'supersedes' ? '0.9.0' : field === 'body' ? base.body + 'x' : field === 'body_sha256' ? '0'.repeat(64) : field === 'allowed_input_keys' ? [] : field === 'supported_modes' ? ['web'] : 'changed';
      if (field === 'body') next.body_sha256 = digest(next.body);
      const semantic = { ...next }; delete semantic.template_sha256;
      next.template_sha256 = digest(stableJson(semantic));
      await writeFile(join(scratch, 'research-question', '1.0.0.json'), JSON.stringify(next));
      await assert.rejects(loadTemplate({ templatesRoot: scratch, templateId: 'research-question', version: '1.0.0' }), { code: /ERR_TEMPLATE_(HASH|MANIFEST|PIN|PATH)/ });
    } finally { await rm(scratch, { recursive: true, force: true }); }
  }
});

test('rejects an unrecognized manifest key and duplicate matching registry pins even when hashes are recomputed', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'm002-template-'));
  try {
    await mkdir(join(scratch, 'research-question'));
    const base = JSON.parse(await readFile(new URL('../templates/research-question/1.0.0.json', import.meta.url), 'utf8'));
    const withExtra = { ...base, appendix: 'x' }; const semantic = { ...withExtra }; delete semantic.template_sha256; withExtra.template_sha256 = digest(stableJson(semantic));
    await writeFile(join(scratch, 'research-question', '1.0.0.json'), JSON.stringify(withExtra));
    const registry = JSON.parse(await readFile(new URL('../templates/registry.json', import.meta.url), 'utf8')); registry.templates[0].template_sha256 = withExtra.template_sha256;
    await writeFile(join(scratch, 'registry.json'), JSON.stringify(registry));
    await assert.rejects(loadTemplate({ templatesRoot: scratch, templateId: 'research-question', version: '1.0.0' }), { code: 'ERR_TEMPLATE_MANIFEST' });
    await writeFile(join(scratch, 'research-question', '1.0.0.json'), JSON.stringify(base));
    registry.templates.push({ ...registry.templates[0], template_sha256: base.template_sha256 }); await writeFile(join(scratch, 'registry.json'), JSON.stringify(registry));
    await assert.rejects(loadTemplate({ templatesRoot: scratch, templateId: 'research-question', version: '1.0.0' }), { code: 'ERR_TEMPLATE_PIN' });
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test('metamorphic question, reason, and mode changes alter the exact prompt digest', async () => {
  const template = await loadTemplate({ templatesRoot, templateId: 'research-question', version: '1.0.0' });
  const base = compilePrompt({ template, mode: 'web', reason: 'why', question: 'q' });
  assert.notEqual(base.prompt_sha256, compilePrompt({ template, mode: 'web', reason: 'why', question: 'Q' }).prompt_sha256);
  assert.notEqual(base.prompt_sha256, compilePrompt({ template, mode: 'web', reason: 'why!', question: 'q' }).prompt_sha256);
  assert.notEqual(base.prompt_sha256, compilePrompt({ template, mode: 'deep', reason: 'why', question: 'q' }).prompt_sha256);
  const nfd = compilePrompt({ template, mode: 'web', reason: 'why', question: 'e\u0301' }); const nfc = compilePrompt({ template, mode: 'web', reason: 'why', question: 'é' });
  assert.notDeepEqual(Buffer.from(nfd.prompt), Buffer.from(nfc.prompt)); assert.notEqual(nfd.prompt_sha256, nfc.prompt_sha256);
  const lf = compilePrompt({ template, mode: 'web', reason: 'why', question: 'a\nb' }); const crlf = compilePrompt({ template, mode: 'web', reason: 'why', question: 'a\r\nb' });
  assert.notDeepEqual(Buffer.from(lf.prompt), Buffer.from(crlf.prompt)); assert.notEqual(lf.prompt_sha256, crlf.prompt_sha256);
  const changedBody = compilePrompt({ template: { ...template, body: template.body.replace('response.', 'response!') }, mode: 'web', reason: 'why', question: 'q' });
  assert.notEqual(base.prompt_sha256, changedBody.prompt_sha256);
  const golden = await readFile(goldenPath); const changedAppendix = Buffer.from(golden); changedAppendix[changedAppendix.lastIndexOf(Buffer.from('web'))] = 'c'.charCodeAt(0);
  assert.notEqual(digest(golden), digest(changedAppendix));
});
