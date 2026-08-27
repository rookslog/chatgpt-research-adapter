import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { OPENCLI_COMMAND_CONTRACT_SHA256, parseOpenCliAnswer, preflightOpenCli, runOpenCliAsk, runOpenCliDeepResearchResult, runOpenCliDetail, runOpenCliStandard } from '../src/opencli-transport.js';

async function withFake(body, run) {
  const root = await mkdtemp(join(tmpdir(), 'm003-opencli-'));
  const path = join(root, 'fake-opencli');
  await writeFile(path, `#!/usr/bin/env node\n${body}\n`, { mode: 0o700 });
  try { return await run({ root, path }); } finally { await rm(root, { recursive: true, force: true }); }
}

const validRow = { conversationId: 'abc-123_DEF', conversationUrl: 'https://chatgpt.com/c/abc-123_DEF', tool: '', response: 'CHATGPT_RESEARCH_LIVE_SMOKE_OK' };

test('preflights one absolute executable as exact OpenCLI v1.8.7 identity', async () => withFake("if (process.argv[2] === '--version') console.log('1.8.7'); else process.exit(9);", async ({ path }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  assert.equal(identity.supplied_path, path);
  assert.equal(identity.version, '1.8.7');
  assert.match(identity.sha256, /^[0-9a-f]{64}$/);
  assert.ok(identity.size > 0);
  assert.match(OPENCLI_COMMAND_CONTRACT_SHA256, /^[0-9a-f]{64}$/);
}));

test('rejects relative, non-executable, wrong-version, nonzero, and changed executable identities', async () => {
  await assert.rejects(preflightOpenCli({ executablePath: 'opencli' }), { code: 'ERR_OPENCLI_PATH' });
  await withFake("console.log('1.8.6');", async ({ path }) => assert.rejects(preflightOpenCli({ executablePath: path }), { code: 'ERR_OPENCLI_VERSION' }));
  await withFake('process.exit(7);', async ({ path }) => assert.rejects(preflightOpenCli({ executablePath: path }), { code: 'ERR_OPENCLI_PREFLIGHT' }));
  await withFake("console.log('1.8.7');", async ({ path }) => {
    const identity = await preflightOpenCli({ executablePath: path });
    await writeFile(path, "#!/usr/bin/env node\nconsole.log('changed');\n", { mode: 0o700 });
    await assert.rejects(runOpenCliStandard({ executablePath: path, identity, prompt: 'x' }), { code: 'ERR_OPENCLI_IDENTITY' });
  });
});

test('passes the exact fixed argv and opaque prompt once without a shell', async () => withFake('', async ({ root, path }) => {
  const capture = join(root, 'argv.json');
  await writeFile(path, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else { writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2))); console.log(${JSON.stringify(JSON.stringify([validRow]))}); }
`, { mode: 0o700 });
  const identity = await preflightOpenCli({ executablePath: path });
  const prompt = 'line 1\n$HOME `echo nope` "quoted" --web-search';
  const result = await runOpenCliStandard({ executablePath: path, identity, prompt });
  assert.equal(result.response, validRow.response);
  assert.deepEqual(JSON.parse(await readFile(capture, 'utf8')), ['chatgpt', 'ask', prompt, '--new', 'true', '--site-session', 'ephemeral', '--timeout', '120', '--format', 'json']);
}));

test('passes the temporary OpenCLI config root but excludes unrelated environment values', async () => withFake('', async ({ root, path }) => {
  const capture = join(root, 'environment.json');
  await writeFile(path, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else { writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.env)); console.log(${JSON.stringify(JSON.stringify([validRow]))}); }
`, { mode: 0o700 });
  const environment = { HOME: process.env.HOME, PATH: process.env.PATH, OPENCLI_CONFIG_DIR: join(root, 'config'), CHATGPT_RESEARCH_SECRET_PROBE: 'must-not-pass' };
  const identity = await preflightOpenCli({ executablePath: path, environment });
  await runOpenCliStandard({ executablePath: path, identity, prompt: 'x', environment });
  const received = JSON.parse(await readFile(capture, 'utf8'));
  assert.equal(received.OPENCLI_CONFIG_DIR, environment.OPENCLI_CONFIG_DIR);
  assert.equal(received.CHATGPT_RESEARCH_SECRET_PROBE, undefined);
}));

test('maps standard, web, and deep modes to practical OpenCLI ask arguments', async () => withFake('', async ({ root, path }) => {
  const capture = join(root, 'argv.jsonl');
  await writeFile(path, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else {
  const args = process.argv.slice(2); appendFileSync(${JSON.stringify(capture)}, JSON.stringify(args) + '\\n');
  const tool = args.includes('--web-search') ? 'Web Search' : args.includes('--deep-research') ? 'Deep Research' : '';
  console.log(JSON.stringify([{conversationId:'mode-1',conversationUrl:'https://chatgpt.com/c/mode-1',tool,response:'done'}]));
}
`, { mode: 0o700 });
  const identity = await preflightOpenCli({ executablePath: path });
  for (const mode of ['standard', 'web', 'deep']) await runOpenCliAsk({ executablePath: path, identity, prompt: 'research this', mode, timeoutSeconds: 600 });
  const calls = (await readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls[0], ['chatgpt', 'ask', 'research this', '--new', 'true', '--site-session', 'persistent', '--timeout', '600', '--format', 'json', '--wait', 'false']);
  assert.deepEqual(calls[1], [...calls[0], '--web-search', 'true']);
  assert.deepEqual(calls[2], [...calls[0], '--deep-research', 'true']);
}));

test('accepts blank handoff rows for read-after-submit collection', () => {
  for (const [mode, tool] of [['standard', ''], ['web', 'Web Search'], ['deep', 'Deep Research']]) {
    const row = { conversationId: `${mode}-async`, conversationUrl: `https://chatgpt.com/c/${mode}-async`, tool, response: '' };
    assert.deepEqual(parseOpenCliAnswer(Buffer.from(JSON.stringify([row])), { mode }), row);
  }
});

test('collects the full structured assistant response through a fresh Markdown read', async () => withFake('', async ({ root, path }) => {
  const capture = join(root, 'detail-argv.json');
  const fullResponse = '# Capability audit\n\n| Item | Answer |\n|---|---|\n| GitHub | yes |\n\nDone.';
  const rows = [{ Index: 1, Role: 'User', Text: 'question', Generating: false, StableSeconds: 3 }, { Index: 2, Role: 'Assistant', Text: fullResponse, Generating: false, StableSeconds: 3 }];
  await writeFile(path, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else { writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2))); console.log(${JSON.stringify(JSON.stringify(rows))}); }
`, { mode: 0o700 });
  const identity = await preflightOpenCli({ executablePath: path });
  const result = await runOpenCliDetail({ executablePath: path, identity, conversationId: 'detail-1', timeoutSeconds: 600 });
  assert.equal(result.response, fullResponse);
  assert.deepEqual(await readFile(capture, 'utf8').then(JSON.parse), ['chatgpt', 'detail', 'detail-1', '--markdown', 'true', '--wait', 'true', '--timeout', '600', '--stable', '3', '--site-session', 'ephemeral', '--format', 'json']);
}));

test('collects one completed Deep Research report by conversation id', async () => withFake('', async ({ root, path }) => {
  const capture = join(root, 'deep-argv.json');
  const deepRow = { conversationId: 'deep-1', status: 'completed', report: '# Report\n\nFindings.', sources: [{ title: 'Source', url: 'https://example.com' }], progress: {}, asyncTaskConversationId: '', widgetSessionId: '', asyncStatus: '', venusMessageType: '', venusStatus: '', waitingForUserUntil: '', planTitle: '', planId: '', url: 'https://chatgpt.com/c/deep-1', method: 'conversation', diagnostics: {} };
  await writeFile(path, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else { writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2))); console.log(${JSON.stringify(JSON.stringify([deepRow]))}); }
`, { mode: 0o700 });
  const identity = await preflightOpenCli({ executablePath: path });
  const result = await runOpenCliDeepResearchResult({ executablePath: path, identity, conversationId: 'deep-1', timeoutSeconds: 1200 });
  assert.equal(result.report, deepRow.report);
  assert.deepEqual(await readFile(capture, 'utf8').then(JSON.parse), ['chatgpt', 'deep-research-result', 'deep-1', '--wait', 'true', '--timeout', '1200', '--stable', '6', '--site-session', 'persistent', '--format', 'json']);
}));

test('strictly validates the one-row standard ChatGPT output contract', () => {
  assert.deepEqual(parseOpenCliAnswer(Buffer.from(JSON.stringify([validRow]))), validRow);
  const invalid = [[], [validRow, validRow], [{ ...validRow, tool: 'web-search' }], [{ ...validRow, conversationUrl: 'http://chatgpt.com/c/abc-123_DEF' }], [{ ...validRow, conversationId: 'other' }], [{ ...validRow, extra: true }]];
  for (const value of invalid) assert.throws(() => parseOpenCliAnswer(Buffer.from(JSON.stringify(value))), { code: 'ERR_OPENCLI_OUTPUT' });
  assert.throws(() => parseOpenCliAnswer(Buffer.from('[{"x":1,"x":2}]')), { code: 'ERR_OPENCLI_OUTPUT' });
});

test('bounds output and turns nonzero exit and timeout into typed transport failures', async () => {
  await withFake("if (process.argv[2] === '--version') console.log('1.8.7'); else { console.error('bad'); process.exit(4); }", async ({ path }) => {
    const identity = await preflightOpenCli({ executablePath: path });
    await assert.rejects(runOpenCliStandard({ executablePath: path, identity, prompt: 'x' }), { code: 'ERR_OPENCLI_EXIT' });
  });
  await withFake("if (process.argv[2] === '--version') console.log('1.8.7'); else process.stdout.write('x'.repeat(300000));", async ({ path }) => {
    const identity = await preflightOpenCli({ executablePath: path });
    await assert.rejects(runOpenCliStandard({ executablePath: path, identity, prompt: 'x' }), { code: 'ERR_OPENCLI_OUTPUT_LIMIT' });
  });
  await withFake("if (process.argv[2] === '--version') console.log('1.8.7'); else setInterval(() => {}, 1000);", async ({ path }) => {
    const identity = await preflightOpenCli({ executablePath: path });
    await assert.rejects(runOpenCliStandard({ executablePath: path, identity, prompt: 'x', timeoutMs: 80 }), { code: 'ERR_OPENCLI_TIMEOUT' });
  });
  await withFake("if (process.argv[2] === '--version') console.log('1.8.7'); else { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }", async ({ path }) => {
    const identity = await preflightOpenCli({ executablePath: path }); const started = Date.now();
    await assert.rejects(runOpenCliStandard({ executablePath: path, identity, prompt: 'x', timeoutMs: 80, killGraceMs: 80 }), { code: 'ERR_OPENCLI_TIMEOUT' });
    assert.ok(Date.now() - started < 1500);
  });
});
