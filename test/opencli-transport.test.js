import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

async function withMarkdownFixtureOpenCli(run, { converterDrift = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'm006-opencli-'));
  const installRoot = join(root, 'install');
  const packageRoot = join(installRoot, 'node_modules', '@jackwener', 'opencli');
  const pluginRoot = join(installRoot, 'node_modules', 'turndown-plugin-gfm');
  const capture = join(root, 'argv.json');
  const html = await readFile(new URL('./fixtures/chatgpt-markdown.html', import.meta.url), 'utf8');
  const expected = (await readFile(new URL('./fixtures/chatgpt-markdown.gfm.md', import.meta.url), 'utf8')).trim();
  const linearized = expected.replace('| Key | Value |\n| --- | --- |\n| alpha | one |\n| beta | two |', 'Key\n\nValue\n\nalpha\n\none\n\nbeta\n\ntwo');
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module', exports: { './utils': './dist/src/utils.js' } })}\n`);
  await writeFile(join(packageRoot, 'dist', 'src', 'utils.js'), `export function htmlToMarkdown(value, configure) {\n  let tablesEnabled = false;\n  const service = { use(plugin) { if (plugin?.fixture === 'gfm-tables') tablesEnabled = true; }, escape(text) { return text.replace(/\\[/g, '\\\\[').replace(/\\]/g, '\\\\]'); } };\n  configure?.(service);\n  if (value !== ${JSON.stringify(html)}) throw new Error('unexpected fixture');\n  const markdown = tablesEnabled ? ${JSON.stringify(expected)} : ${JSON.stringify(linearized)};\n  return markdown.replace('**[C-001]**', '**' + service.escape('[C-001]') + '**');\n}\n`);
  const converterCall = converterDrift ? 'htmlToMarkdown(String(html)).trim()' : 'htmlToMarkdown(html).trim()';
  await writeFile(join(packageRoot, 'clis', 'chatgpt', 'utils.js'), `import { htmlToMarkdown } from '@jackwener/opencli/utils';\n\nexport function messageHtmlToMarkdown(html) {\n    try {\n        return ${converterCall};\n    } catch {\n        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();\n    }\n}\n`);
  await writeFile(join(pluginRoot, 'package.json'), `${JSON.stringify({ name: 'turndown-plugin-gfm', version: '1.0.2', type: 'module', exports: './index.js' })}\n`);
  await writeFile(join(pluginRoot, 'index.js'), "export const tables = Object.freeze({ fixture: 'gfm-tables' });\n");
  const path = join(packageRoot, 'dist', 'src', 'main.js');
  await writeFile(path, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nimport { messageHtmlToMarkdown } from '../../clis/chatgpt/utils.js';\nif (process.argv[2] === '--version') console.log('1.8.7');\nelse { writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify([{ Index: 1, Role: 'User', Text: 'question', Generating: false, StableSeconds: 3 }, { Index: 2, Role: 'Assistant', Text: messageHtmlToMarkdown(${JSON.stringify(html)}), Generating: false, StableSeconds: 3, Executable: process.argv[1] }])); }\n`, { mode: 0o700 });
  try { return await run({ root, path, expected, capture }); } finally { await rm(root, { recursive: true, force: true }); }
}

async function withDeepResultFixtureOpenCli(run) {
  const root = await mkdtemp(join(tmpdir(), 'm006-deep-result-transport-'));
  const packageRoot = join(root, 'install', 'node_modules', '@jackwener', 'opencli');
  const sourcePath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  const path = join(packageRoot, 'dist', 'src', 'main.js');
  const capture = join(root, 'deep-argv.json');
  const deepRow = { conversationId: 'deep-1', status: 'completed', report: '# Report\n\nFindings.', sources: [{ title: 'Source', url: 'https://example.com' }], progress: {}, asyncTaskConversationId: '', widgetSessionId: '', asyncStatus: '', venusMessageType: '', venusStatus: '', waitingForUserUntil: '', planTitle: '', planId: '', url: 'https://chatgpt.com/c/deep-1', method: 'conversation', diagnostics: {} };
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module' })}\n`);
  await writeFile(sourcePath, `class CommandExecutionError extends Error {}

function extractDeepResearchFromConversationPayload(payload, { expectedConversationId = '' } = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new CommandExecutionError('Malformed ChatGPT conversation payload for Deep Research extraction.');
    }
    const payloadConversationId = String(payload.conversation_id || payload.conversationId || payload.id || '').trim();
    if (expectedConversationId && payloadConversationId && payloadConversationId !== expectedConversationId) {
        throw new CommandExecutionError(
            \`ChatGPT conversation payload id mismatch: expected \${expectedConversationId}, got \${payloadConversationId}.\`,
        );
    }
    const mapping = payload?.mapping && typeof payload.mapping === 'object' ? payload.mapping : {};
    if (!payload.mapping || typeof payload.mapping !== 'object' || Array.isArray(payload.mapping)) {
        throw new CommandExecutionError('Malformed ChatGPT conversation payload for Deep Research extraction: missing mapping.');
    }
    const candidates = [];
    for (const [messageId, node] of Object.entries(mapping)) {
        const message = node?.message || {};
        const metadata = message?.metadata || {};
        const sdk = metadata?.chatgpt_sdk || {};
        const responseMetadata = pickFirstObject(
            sdk?.response_metadata,
            sdk?.responseMetadata,
            metadata?.response_metadata,
            metadata?.responseMetadata,
        );
        let sawWidgetState = false;
        for (const widgetState of [
            sdk?.widget_state,
            sdk?.widgetState,
            metadata?.widget_state,
            metadata?.widgetState,
        ]) {
            if (widgetState === undefined || widgetState === null) continue;
            sawWidgetState = true;
            const extracted = extractDeepResearchFromWidgetState(widgetState, 'conversation-widget-state', responseMetadata);
            if (extracted) {
                candidates.push({
                    ...extracted,
                    conversationMessageId: messageId,
                });
            }
        }
        if (!sawWidgetState && Object.keys(responseMetadata).length) {
            const extracted = extractDeepResearchFromWidgetState(null, 'conversation-widget-state', responseMetadata);
            if (extracted) {
                candidates.push({
                    ...extracted,
                    conversationMessageId: messageId,
                });
            }
        }
    }
    candidates.sort((a, b) => deepResearchCandidateScore(b) - deepResearchCandidateScore(a));
    return candidates[0] || null;
}

function extractDeepResearchFromNetworkEntries(entries, { expectedConversationId = '' } = {}) {
    const candidates = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
        const url = String(entry?.url || '');
        if (!/\\/backend-api\\/conversation\\//.test(url)) continue;
        const entryConversationId = conversationIdFromBackendConversationUrl(url);
        if (expectedConversationId && entryConversationId !== expectedConversationId) continue;
        const body = parseJsonMaybe(entry?.responsePreview) || parseJsonMaybe(entry?.body) || null;
        if (!body) {
            throw new CommandExecutionError(\`Malformed ChatGPT conversation network payload for \${entryConversationId || 'unknown conversation'}.\`);
        }
        const extracted = extractDeepResearchFromConversationPayload(body, { expectedConversationId });
        if (extracted) {
            candidates.push({
                ...extracted,
                method: extracted.status === 'completed'
                    ? 'network-conversation-widget-state'
                    : 'network-conversation-widget-progress',
                networkUrl: url,
            });
        }
    }
    candidates.sort((a, b) => deepResearchCandidateScore(b) - deepResearchCandidateScore(a));
    return candidates[0] || null;
}
`);
  await writeFile(path, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else { writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2))); console.log(${JSON.stringify(JSON.stringify([deepRow]))}); }
`, { mode: 0o700 });
  try { return await run({ path, capture, deepRow }); } finally { await rm(root, { recursive: true, force: true }); }
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

test('maps standard mode to the original practical OpenCLI ask arguments', async () => withFake('', async ({ root, path }) => {
  const capture = join(root, 'argv.jsonl');
  await writeFile(path, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
if (process.argv[2] === '--version') console.log('1.8.7');
else {
  const args = process.argv.slice(2); appendFileSync(${JSON.stringify(capture)}, JSON.stringify({ args, executable: process.argv[1] }) + '\\n');
  console.log(JSON.stringify([{conversationId:'mode-1',conversationUrl:'https://chatgpt.com/c/mode-1',tool:'',response:'done'}]));
}
`, { mode: 0o700 });
  const identity = await preflightOpenCli({ executablePath: path });
  await runOpenCliAsk({ executablePath: path, identity, prompt: 'research this', mode: 'standard', timeoutSeconds: 600 });
  const calls = (await readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
  const base = ['chatgpt', 'ask', 'research this', '--new', 'true', '--site-session', 'persistent', '--timeout', '600', '--format', 'json', '--wait', 'false'];
  assert.deepEqual(calls, [{ args: base, executable: identity.real_path }]);
}));

test('accepts blank handoff rows for read-after-submit collection', () => {
  for (const [mode, tool] of [['standard', ''], ['web', 'Web Search'], ['deep', 'Deep Research']]) {
    const row = { conversationId: `${mode}-async`, conversationUrl: `https://chatgpt.com/c/${mode}-async`, tool, response: '' };
    assert.deepEqual(parseOpenCliAnswer(Buffer.from(JSON.stringify([row])), { mode }), row);
  }
});

test('collects the full structured assistant response through a fresh Markdown read', async () => withMarkdownFixtureOpenCli(async ({ path, expected, capture }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  const result = await runOpenCliDetail({ executablePath: path, identity, conversationId: 'detail-1', timeoutSeconds: 600 });
  assert.equal(result.response, expected);
  assert.deepEqual(await readFile(capture, 'utf8').then(JSON.parse), ['chatgpt', 'detail', 'detail-1', '--markdown', 'true', '--wait', 'true', '--timeout', '600', '--stable', '3', '--site-session', 'ephemeral', '--format', 'json']);
}));

test('preserves GFM tables and readable claim IDs across one full assistant-message read', async () => withMarkdownFixtureOpenCli(async ({ path, expected }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  const result = await runOpenCliDetail({ executablePath: path, identity, conversationId: 'markdown-1', timeoutSeconds: 600 });
  assert.equal(result.response, expected);
  assert.match(result.response, /\| Key \| Value \|\n\| --- \| --- \|/);
  assert.match(result.response, /\*\*\[C-001\]\*\*/);
  assert.match(result.response, /Ordinary bracket text: \\\[note\\\]/);
  assert.match(result.response, /- \[source\]\(https:\/\/example\.com\/source\)/);
  assert.match(result.response, /```\nconst claim = "\[C-002\]";/);
}));

test('fails closed when the pinned OpenCLI Markdown converter source drifts', async () => withMarkdownFixtureOpenCli(async ({ path }) => {
  const identity = await preflightOpenCli({ executablePath: path });
  await assert.rejects(runOpenCliDetail({ executablePath: path, identity, conversationId: 'markdown-drift', timeoutSeconds: 600 }), { code: 'ERR_OPENCLI_MARKDOWN_COMPAT' });
}, { converterDrift: true }));

test('collects one completed Deep Research report by conversation id', async () => withDeepResultFixtureOpenCli(async ({ path, capture, deepRow }) => {
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
