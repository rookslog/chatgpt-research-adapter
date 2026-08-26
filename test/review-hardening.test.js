import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';

test('REQ-CLI-001 rejects a relative prepare output root at the CLI boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-hardening-cli-'));
  const requestPath = join(root, 'request.json');
  await writeFile(requestPath, JSON.stringify({ question: 'x', template_id: 'research-question', template_version: '1.0.0' }));
  try {
    await assert.rejects(
      runCli(['prepare', '--request', requestPath, '--output-root', './out'], { stdout: { write() { throw new Error('unexpected stdout'); } } }),
      { code: 'ERR_CLI_USAGE' }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
