import assert from 'node:assert/strict';
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
