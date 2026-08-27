import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('M006 temporary option-review authority digest probe', async () => {
  const bytes = await readFile(new URL('../src/opencli-transport.js', import.meta.url));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.fail(`M006_OPTION_REVIEW_TRANSPORT_SHA256=${sha256}`);
});
