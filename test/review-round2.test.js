import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { directAsk, submitDirectPreparedJob } from '../src/direct-ask.js';
import { loadRigorProfile } from '../src/rigor-profile.js';

const rigorRoot = new URL('../rigor/', import.meta.url).pathname;
const templatesRoot = new URL('../templates/', import.meta.url).pathname;

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

test('REQ-DISPATCH-007 rejects transport options that can replace authoritative dispatch inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-round2-transport-'));
  let askCalls = 0;
  try {
    await assert.rejects(
      directAsk({
        question: 'preserve the prepared prompt',
        outputRoot: join(root, 'output'),
        openCliPath: '/tmp/opencli',
        templatesRoot,
        clock: () => '2026-08-26T22:00:00.000Z',
        newJobId: () => 'job_transport_options',
        newTurnId: () => 'turn_transport_options',
        transportOptions: { prompt: 'OVERRIDDEN' },
        submit: (options) => submitDirectPreparedJob({
          ...options,
          preflight: async () => ({ version: '1.8.7' }),
          ask: async () => {
            askCalls += 1;
            return { conversationId: 'transport-1', conversationUrl: 'https://chatgpt.com/c/transport-1', tool: '', response: '' };
          },
          readDetail: async () => ({ response: 'answer' })
        })
      }),
      { code: 'ERR_DIRECT_TRANSPORT_OPTIONS' }
    );
    assert.equal(askCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-DISPATCH-008 binds durable direct answer and report bytes into the completed result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-round2-output-hash-'));
  const cases = [
    { kind: 'answer', mode: undefined, payload: 'standard bytes\n', conversationId: 'hash-standard-1', tool: '' },
    { kind: 'report', mode: 'deep', payload: '# report\n', conversationId: 'hash-deep-1', tool: 'Deep Research' }
  ];
  try {
    for (const item of cases) {
      const outcome = await directAsk({
        question: `bind ${item.kind} bytes`,
        ...(item.mode === undefined ? {} : { mode: item.mode }),
        outputRoot: join(root, item.kind),
        openCliPath: '/tmp/opencli',
        templatesRoot,
        clock: () => '2026-08-26T22:10:00.000Z',
        newJobId: () => `job_${item.kind}_hash`,
        newTurnId: () => `turn_${item.kind}_hash`,
        submit: (options) => submitDirectPreparedJob({
          ...options,
          preflight: async () => ({ version: '1.8.7' }),
          ask: async () => ({ conversationId: item.conversationId, conversationUrl: `https://chatgpt.com/c/${item.conversationId}`, tool: item.tool, response: '' }),
          readDetail: async () => ({ response: item.payload }),
          readDeep: async () => ({ conversationId: item.conversationId, status: 'completed', report: item.payload, sources: [] })
        })
      });
      const result = outcome.result;
      const artifactPath = result[`${item.kind}_path`];
      const bytes = await readFile(artifactPath);
      assert.equal(result[`${item.kind}_sha256`], createHash('sha256').update(bytes).digest('hex'));
      assert.equal(result[`${item.kind}_bytes`], bytes.length);
      const other = item.kind === 'answer' ? 'report' : 'answer';
      assert.equal(result[`${other}_sha256`], null);
      assert.equal(result[`${other}_bytes`], null);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
