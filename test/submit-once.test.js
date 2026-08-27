import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareResearchJob } from '../src/prepare.js';
import { submitPreparedJobOnce } from '../src/submit-once.js';

const templatesRoot = new URL('../templates/', import.meta.url).pathname;
const preparedAt = '2026-08-24T01:02:03.456Z';
const times = () => { const values = ['2026-08-24T01:03:03.456Z', '2026-08-24T01:04:03.456Z', '2026-08-24T01:05:03.456Z']; return () => values.shift(); };

async function withCase(fakeAskSource, run) {
  const root = await mkdtemp(join(tmpdir(), 'm003-submit-')); const outputRoot = join(root, 'output'); const opencli = join(root, 'opencli');
  await (await import('node:fs/promises')).mkdir(outputRoot);
  await prepareResearchJob({ request: { question: 'Reply with exactly CHATGPT_RESEARCH_LIVE_SMOKE_OK', template_id: 'research-question', template_version: '1.0.0' }, outputRoot, templatesRoot, now: preparedAt, newJobId: () => 'job_smoke', newTurnId: () => 'turn_smoke' });
  const intentPath = join(outputRoot, 'jobs', 'job_smoke', 'dispatch', 'intent.json');
  await writeFile(opencli, `#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else { if (!existsSync(${JSON.stringify(intentPath)})) process.exit(91); ${fakeAskSource} }
`, { mode: 0o700 });
  try { return await run({ root, outputRoot, opencli, jobRoot: join(outputRoot, 'jobs', 'job_smoke') }); } finally { await rm(root, { recursive: true, force: true }); }
}

test('submits once only after intent and persists one validated completed answer', async () => withCase("console.log(JSON.stringify([{conversationId:'smoke-1',conversationUrl:'https://chatgpt.com/c/smoke-1',tool:'',response:'CHATGPT_RESEARCH_LIVE_SMOKE_OK'}]));", async ({ outputRoot, opencli, jobRoot }) => {
  const result = await submitPreparedJobOnce({ outputRoot, jobId: 'job_smoke', openCliPath: opencli, now: times() });
  assert.equal(result.status, 'completed'); assert.equal(result.conversation_url, 'https://chatgpt.com/c/smoke-1');
  assert.equal(await readFile(join(jobRoot, 'dispatch', 'answer.md'), 'utf8'), 'CHATGPT_RESEARCH_LIVE_SMOKE_OK');
  assert.equal(JSON.parse(await readFile(join(jobRoot, 'dispatch', 'result.json'), 'utf8')).status, 'completed');
}));

test('post-intent malformed output becomes one terminal ambiguous effect without retry', async () => withCase("console.log('{bad');", async ({ outputRoot, opencli, jobRoot }) => {
  const result = await submitPreparedJobOnce({ outputRoot, jobId: 'job_smoke', openCliPath: opencli, now: times() });
  assert.equal(result.status, 'ambiguous_effect'); assert.equal(result.retry_decision, 'prohibited'); assert.equal(result.process_disposition, 'ERR_OPENCLI_OUTPUT');
  await assert.rejects(stat(join(jobRoot, 'dispatch', 'answer.md')), { code: 'ENOENT' });
}));

test('duplicate submit refuses before any executable process and preserves prior bytes', async () => withCase("console.log(JSON.stringify([{conversationId:'smoke-2',conversationUrl:'https://chatgpt.com/c/smoke-2',tool:'',response:'ok'}]));", async ({ outputRoot, opencli, jobRoot }) => {
  await submitPreparedJobOnce({ outputRoot, jobId: 'job_smoke', openCliPath: opencli, now: times() });
  const before = await Promise.all(['intent.json', 'answer.md', 'result.json'].map((name) => readFile(join(jobRoot, 'dispatch', name))));
  await writeFile(opencli, "#!/usr/bin/env node\nprocess.exit(88);\n", { mode: 0o700 });
  await assert.rejects(submitPreparedJobOnce({ outputRoot, jobId: 'job_smoke', openCliPath: opencli, now: times() }), { code: 'ERR_DISPATCH_EXISTS' });
  assert.deepEqual(await Promise.all(['intent.json', 'answer.md', 'result.json'].map((name) => readFile(join(jobRoot, 'dispatch', name)))), before);
}));

test('wrong OpenCLI version fails before intent and ask', async () => withCase("console.log('should-not-run');", async ({ outputRoot, opencli, jobRoot }) => {
  await writeFile(opencli, "#!/usr/bin/env node\nconsole.log('1.8.6');\n", { mode: 0o700 });
  await assert.rejects(submitPreparedJobOnce({ outputRoot, jobId: 'job_smoke', openCliPath: opencli, now: times() }), { code: 'ERR_OPENCLI_VERSION' });
  await assert.rejects(stat(join(jobRoot, 'dispatch')), { code: 'ENOENT' });
}));
