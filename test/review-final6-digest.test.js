import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

for (const path of ['src/direct-ask.js', 'src/opencli-transport.js', 'src/submit-once.js']) {
  test(`digest ${path}`, async () => {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    console.log(`FINAL6_SOURCE_SHA256 ${path} ${createHash('sha256').update(bytes).digest('hex')}`);
  });
}
