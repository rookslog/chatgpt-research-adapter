import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { preflightOpenCli, runOpenCliDeepResearchResult } from '../src/opencli-transport.js';

function pinnedDeepResearchSource() {
  return `class CommandExecutionError extends Error {}
function pickFirstObject(...values) { return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}; }
function extractDeepResearchFromWidgetState() { return null; }
function deepResearchCandidateScore() { return 0; }

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

export async function getChatGPTDeepResearchResult(page, { conversationId = '' } = {}) {
    const conversation = await page.fetchConversation();
    const extracted = extractDeepResearchFromConversationPayload(conversation.payload, { expectedConversationId: conversationId });
    if (extracted) return extracted;
    return page.existingFallback();
}
`;
}

function driftedDeepResearchSource(drift) {
  const source = pinnedDeepResearchSource();
  if (drift === '') return source;
  if (drift === 'target-anchor') return source.replace('missing mapping.', 'mapping unavailable.');
  if (drift === 'id-binding') return source.replace('payloadConversationId !== expectedConversationId', 'payloadConversationId === expectedConversationId');
  if (drift === 'mismatch-guard') return source.replace('if (expectedConversationId && payloadConversationId && payloadConversationId !== expectedConversationId) {', 'if (false) {');
  if (drift === 'malformed-payload-guard') return source.replace("if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {", 'if (false) {');
  throw new Error(`unknown source drift: ${drift}`);
}

function compatibilityWorkspace(executable) {
  return dirname(dirname(dirname(dirname(executable))));
}

async function assertCompatibilityCopyRemoved(observed) {
  await assert.rejects(lstat(observed.executable), { code: 'ENOENT' });
  await assert.rejects(lstat(compatibilityWorkspace(observed.executable)), { code: 'ENOENT' });
}

async function withDeepResultOpenCli(run, { payload = { conversation_id: 'deep-current-1' }, sourceDrift = '' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'm006-deep-result-'));
  const packageRoot = join(root, 'install', 'node_modules', '@jackwener', 'opencli');
  const sourcePath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  const executablePath = join(packageRoot, 'dist', 'src', 'main.js');
  const capturePath = join(root, 'capture.json');
  const source = driftedDeepResearchSource(sourceDrift);
  await mkdir(join(packageRoot, 'clis', 'chatgpt'), { recursive: true });
  await mkdir(join(packageRoot, 'dist', 'src'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: '1.8.7', type: 'module' })}\n`);
  await writeFile(sourcePath, source);
  await writeFile(executablePath, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { getChatGPTDeepResearchResult } from '../../clis/chatgpt/utils.js';
const capturePath = ${JSON.stringify(capturePath)};
const payload = ${JSON.stringify(payload)};
let fallbackCalls = 0;
const page = {
  async fetchConversation() { return { payload }; },
  async existingFallback() {
    fallbackCalls += 1;
    return {
      status: 'completed',
      report: '# Completed report\\n\\nA complete Deep Research report from the existing fallback.',
      sources: [{ title: 'Existing fallback source', url: 'https://example.com/source' }],
    };
  },
};
if (process.argv[2] === '--version') {
  console.log('1.8.7');
} else {
  try {
    const result = await getChatGPTDeepResearchResult(page, { conversationId: process.argv[4] });
    writeFileSync(capturePath, JSON.stringify({ args: process.argv.slice(2), executable: process.argv[1], fallbackCalls, environment: { HOME: process.env.HOME, OPENCLI_CONFIG_DIR: process.env.OPENCLI_CONFIG_DIR } }));
    console.log(JSON.stringify([{ conversationId: process.argv[4], ...result }]));
  } catch (error) {
    writeFileSync(capturePath, JSON.stringify({ args: process.argv.slice(2), executable: process.argv[1], fallbackCalls, error: error?.message || String(error) }));
    console.error(error?.message || String(error));
    process.exit(4);
  }
}
`, { mode: 0o700 });
  try { return await run({ root, sourcePath, executablePath, capturePath }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('deep reader reaches an existing completed fallback when its matching conversation has no mapping', async () => withDeepResultOpenCli(async ({ root, sourcePath, executablePath, capturePath }) => {
  const installedBefore = await readFile(sourcePath);
  const environment = { HOME: join(root, 'persistent-home'), PATH: process.env.PATH, OPENCLI_CONFIG_DIR: join(root, 'opencli-config') };
  const identity = await preflightOpenCli({ executablePath, environment });
  const result = await runOpenCliDeepResearchResult({ executablePath, identity, conversationId: 'deep-current-1', timeoutSeconds: 60, environment });
  const observed = JSON.parse(await readFile(capturePath, 'utf8'));
  assert.equal(result.report, '# Completed report\n\nA complete Deep Research report from the existing fallback.');
  assert.deepEqual(result.sources, [{ title: 'Existing fallback source', url: 'https://example.com/source' }]);
  assert.equal(observed.fallbackCalls, 1);
  assert.notEqual(observed.executable, identity.real_path);
  assert.deepEqual(observed.args, ['chatgpt', 'deep-research-result', 'deep-current-1', '--wait', 'true', '--timeout', '60', '--stable', '6', '--site-session', 'persistent', '--format', 'json']);
  assert.deepEqual(observed.environment, { HOME: environment.HOME, OPENCLI_CONFIG_DIR: environment.OPENCLI_CONFIG_DIR });
  assert.deepEqual(await readFile(sourcePath), installedBefore);
  await assertCompatibilityCopyRemoved(observed);
}));

test('deep reader fails closed before child execution when the pinned extractor source drifts', async () => withDeepResultOpenCli(async ({ executablePath, capturePath }) => {
  const identity = await preflightOpenCli({ executablePath });
  await assert.rejects(runOpenCliDeepResearchResult({ executablePath, identity, conversationId: 'deep-current-1', timeoutSeconds: 60 }), { code: 'ERR_OPENCLI_DEEP_RESULT_COMPAT' });
  await assert.rejects(readFile(capturePath), { code: 'ENOENT' });
}, { sourceDrift: 'target-anchor' }));

for (const [drift, name] of [
  ['id-binding', 'changes conversation ID binding'],
  ['mismatch-guard', 'disables the mismatch guard'],
  ['malformed-payload-guard', 'disables the malformed-payload guard'],
]) {
  test(`deep reader fails closed before child execution when the pinned extractor ${name}`, async () => withDeepResultOpenCli(async ({ executablePath, capturePath }) => {
    const identity = await preflightOpenCli({ executablePath });
    await assert.rejects(runOpenCliDeepResearchResult({ executablePath, identity, conversationId: 'deep-current-1', timeoutSeconds: 60 }), { code: 'ERR_OPENCLI_DEEP_RESULT_COMPAT' });
    await assert.rejects(readFile(capturePath), { code: 'ENOENT' });
  }, { sourceDrift: drift }));
}

test('deep reader preserves a mismatched conversation failure without probing the existing fallback', async () => withDeepResultOpenCli(async ({ executablePath, capturePath }) => {
  const identity = await preflightOpenCli({ executablePath });
  await assert.rejects(runOpenCliDeepResearchResult({ executablePath, identity, conversationId: 'deep-current-1', timeoutSeconds: 60 }), { code: 'ERR_OPENCLI_EXIT' });
  const observed = JSON.parse(await readFile(capturePath, 'utf8'));
  assert.equal(observed.fallbackCalls, 0);
  assert.match(observed.error, /conversation payload id mismatch/);
  assert.notEqual(observed.executable, identity.real_path);
  await assertCompatibilityCopyRemoved(observed);
}, { payload: { conversation_id: 'another-conversation' } }));

test('deep reader preserves a mapping-less envelope without a conversation id as a failure', async () => withDeepResultOpenCli(async ({ executablePath, capturePath }) => {
  const identity = await preflightOpenCli({ executablePath });
  await assert.rejects(runOpenCliDeepResearchResult({ executablePath, identity, conversationId: 'deep-current-1', timeoutSeconds: 60 }), { code: 'ERR_OPENCLI_EXIT' });
  const observed = JSON.parse(await readFile(capturePath, 'utf8'));
  assert.equal(observed.fallbackCalls, 0);
  assert.match(observed.error, /missing mapping/);
  assert.notEqual(observed.executable, identity.real_path);
}, { payload: {} }));

test('deep reader preserves an own invalid mapping as a failure without probing the existing fallback', async () => withDeepResultOpenCli(async ({ executablePath, capturePath }) => {
  const identity = await preflightOpenCli({ executablePath });
  await assert.rejects(runOpenCliDeepResearchResult({ executablePath, identity, conversationId: 'deep-current-1', timeoutSeconds: 60 }), { code: 'ERR_OPENCLI_EXIT' });
  const observed = JSON.parse(await readFile(capturePath, 'utf8'));
  assert.equal(observed.fallbackCalls, 0);
  assert.match(observed.error, /missing mapping/);
  assert.notEqual(observed.executable, identity.real_path);
  await assertCompatibilityCopyRemoved(observed);
}, { payload: { conversation_id: 'deep-current-1', mapping: [] } }));
