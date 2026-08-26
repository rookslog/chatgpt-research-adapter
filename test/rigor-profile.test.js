import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const rigorRoot = new URL('../rigor/', import.meta.url).pathname;

async function loader() {
  try { return await import('../src/rigor-profile.js'); }
  catch (error) { assert.fail(`expected rigor profile loader module: ${error.code ?? error.message}`); }
}

test('loads the pinned standard profile by default and the explicit light and strict profiles', async () => {
  const { loadRigorProfile } = await loader();
  const standard = await loadRigorProfile({ rigorRoot });
  assert.equal(standard.profile_id, 'standard');
  assert.equal(standard.version, '1.0.0');
  assert.equal(standard.protocol_id, 'chatgpt-research-epistemic');
  assert.equal(standard.protocol_version, '1.0.0');
  assert.equal(standard.claim_coverage, 'substantive');
  assert.equal(standard.claim_ledger, true);
  assert.match(standard.body, /claim ledger/i);
  assert.match(standard.body_sha256, /^[0-9a-f]{64}$/);
  assert.match(standard.profile_sha256, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(standard));

  const light = await loadRigorProfile({ rigorRoot, profileId: 'light', version: '1.0.0' });
  const strict = await loadRigorProfile({ rigorRoot, profileId: 'strict', version: '1.0.0' });
  assert.equal(light.claim_coverage, 'conclusions');
  assert.equal(light.claim_ledger, false);
  assert.equal(strict.claim_coverage, 'all-claims');
  assert.equal(strict.claim_ledger, true);
});

test('loads an absolute custom profile and computes its reproducible content identity', async () => {
  const { loadRigorProfile } = await loader();
  const root = await mkdtemp(join(tmpdir(), 'rigor-custom-'));
  try {
    const path = join(root, 'custom.json');
    await writeFile(path, JSON.stringify({
      profile_id: 'owner-rigor', version: '2.1.0', status: 'active', protocol_id: 'chatgpt-research-epistemic', protocol_version: '1.0.0',
      claim_coverage: 'substantive', claim_ledger: true, body: 'Answer first. Mark claims [C#]. Include a claim ledger and distinguish interpretations from facts.'
    }));
    const first = await loadRigorProfile({ rigorRoot, profilePath: path });
    const second = await loadRigorProfile({ rigorRoot, profilePath: path });
    assert.equal(first.profile_id, 'owner-rigor');
    assert.equal(first.profile_sha256, second.profile_sha256);
    assert.equal(first.body_sha256, second.body_sha256);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects unknown, altered, malformed, ambiguous, and symlinked profiles', async () => {
  const { loadRigorProfile } = await loader();
  await assert.rejects(loadRigorProfile({ rigorRoot, profileId: 'unknown', version: '1.0.0' }), { code: 'ERR_RIGOR_PIN' });
  await assert.rejects(loadRigorProfile({ rigorRoot, profileId: '../standard', version: '1.0.0' }), { code: 'ERR_RIGOR_ID' });

  const root = await mkdtemp(join(tmpdir(), 'rigor-invalid-'));
  try {
    const custom = join(root, 'custom.json');
    await writeFile(custom, '{"profile_id":"x","profile_id":"y"}');
    await assert.rejects(loadRigorProfile({ rigorRoot, profilePath: custom }), { code: 'ERR_STRICT_JSON' });
    await assert.rejects(loadRigorProfile({ rigorRoot, profilePath: custom, profileId: 'standard' }), { code: 'ERR_RIGOR_SELECTION' });

    const target = new URL('../rigor/profiles/standard/1.0.0.json', import.meta.url).pathname;
    const link = join(root, 'link.json'); await symlink(target, link);
    await assert.rejects(loadRigorProfile({ rigorRoot, profilePath: link }), { code: 'ERR_RIGOR_PATH' });

    const registry = JSON.parse(await readFile(new URL('../rigor/registry.json', import.meta.url), 'utf8'));
    registry.profiles.find((item) => item.profile_id === 'standard').profile_sha256 = '0'.repeat(64);
    await writeFile(join(root, 'registry.json'), JSON.stringify(registry));
    await symlink(new URL('../rigor/profiles/', import.meta.url).pathname, join(root, 'profiles'));
    await assert.rejects(loadRigorProfile({ rigorRoot: root }), { code: /ERR_RIGOR_(PATH|PIN)/ });
  } finally { await rm(root, { recursive: true, force: true }); }
});
