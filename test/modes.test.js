import assert from 'node:assert/strict';
import test from 'node:test';

import { MODES, resolveMode } from '../src/modes.js';

test('declares the frozen supported mode list', () => {
  assert.deepEqual(MODES, ['standard', 'web', 'deep', 'image']);
  assert.ok(Object.isFrozen(MODES));
});

test('defaults only when mode and reason are both omitted', () => {
  const result = resolveMode(undefined, undefined);
  assert.deepEqual(result, { mode: 'standard', reason: 'default' });
  assert.ok(Object.isFrozen(result));
});

test('rejects a reason when mode is omitted', () => {
  assert.throws(() => resolveMode(undefined, 'because'), { code: 'ERR_MODE_REASON' });
});

test('records explicit standard and preserves its nonblank reason', () => {
  assert.deepEqual(resolveMode('standard', undefined), { mode: 'standard', reason: 'explicit-standard' });
  assert.deepEqual(resolveMode('standard', 'research policy'), { mode: 'standard', reason: 'research policy' });
});

test('requires explicit nonblank reasons for non-standard modes', () => {
  for (const mode of ['web', 'deep', 'image']) {
    assert.deepEqual(resolveMode(mode, 'source-supported'), { mode, reason: 'source-supported' });
    assert.throws(() => resolveMode(mode, undefined), { code: 'ERR_MODE_REASON' });
  }
});

test('rejects invalid modes and reasons without substitution', () => {
  for (const mode of ['', ' ', 'Web', 'STANDARD', 'unknown', 1, null, {}]) {
    assert.throws(() => resolveMode(mode, undefined), { code: 'ERR_MODE' });
  }
  for (const reason of ['', ' ', '\t', 1, null, {}]) {
    assert.throws(() => resolveMode('web', reason), { code: 'ERR_MODE_REASON' });
  }
});
