import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';
import { persistPreparedJob } from '../src/receipts.js';

test('REQ-CLI-001 rejects a relative prepare output root at the CLI boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-hardening-cli-'));
  const requestPath = join(root, 'request.json');
  await writeFile(requestPath, JSON.stringify({ question: 'x', template_id: 'research-question', template_version: '1.0.0' }));
  try {
    await assert.rejects(
      runCli(['prepare', '--request', requestPath, '--output-root', './out'], { stdout: { write() { throw new Error('unexpected stdout'); } } }),
      { code: 'ERR_CLI_USAGE' }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('REQ-PREPARED-001 syncs the jobs directory after publishing a prepared job', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'review-hardening-receipt-'));
  const prompt = 'prepared prompt\n';
  const compiled = {
    prompt,
    prompt_sha256: createHash('sha256').update(prompt).digest('hex'),
    template_id: 'research-question',
    template_version: '1.0.0',
    template_sha256: 'b'.repeat(64),
    template_body_sha256: 'c'.repeat(64),
    mode: 'standard',
    mode_reason: 'default',
    rigor_protocol_id: 'chatgpt-research-epistemic',
    rigor_protocol_version: '1.0.0',
    rigor_profile_id: 'standard',
    rigor_profile_version: '1.0.0',
    rigor_profile_sha256: 'd'.repeat(64),
    citation_level: 'principal',
    audit_appendix: false
  };
  try {
    await assert.rejects(
      persistPreparedJob({
        outputRoot,
        job: { job_id: 'job_sync' },
        turn: { turn_id: 'turn_sync' },
        compiled,
        now: '2026-08-26T17:30:00.000Z',
        testSeam: { failAt: 'after-jobs-directory-sync' }
      }),
      { code: 'ERR_INJECTED_FAULT' }
    );
    const current = JSON.parse(await readFile(join(outputRoot, 'jobs', 'job_sync', 'current.json'), 'utf8'));
    assert.equal(current.turn.transport_status, 'not_dispatched');
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
