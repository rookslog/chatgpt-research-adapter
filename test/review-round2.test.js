import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadRigorProfile } from '../src/rigor-profile.js';

const rigorRoot = new URL('../rigor/', import.meta.url).pathname;

test('REQ-RIGOR-001 rejects a symlinked built-in profiles container', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-round2-rigor-'));
  try {
    await writeFile(join(root, 'registry.json'), await readFile(new URL('../rigor/registry.json', import.meta.url)));
    await symlink(new URL('../rigor/profiles/', import.meta.url).pathname, join(root, 'profiles'));
    await assert.rejects(loadRigorProfile({ rigorRoot: root }), { code: 'ERR_RIGOR_PATH' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
