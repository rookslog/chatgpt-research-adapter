import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('temporary OpenCLI transport digest probe', async () => {
  const bytes = await readFile(new URL('../src/opencli-transport.js', import.meta.url));
  console.log(`OPENCLI_TRANSPORT_SHA256=${createHash('sha256').update(bytes).digest('hex')}`);
});
