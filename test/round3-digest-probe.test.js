import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('prints reviewed source digests for authority repin', async () => {
  for (const path of ['src/direct-ask.js', 'src/opencli-transport.js', 'src/submit-once.js', 'src/template-registry.js']) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    const digest = createHash('sha256').update(bytes).digest('hex');
    console.log(`ROUND3_SOURCE_SHA256 ${path} ${digest}`);
  }
});
