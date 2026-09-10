import { randomUUID } from 'node:crypto';
import { inspectStandardRuntime, recordStandardEvent } from './standard-runtime.js';

const fail = (message, code = 'ERR_RUNTIME_EVENTS') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

function operationEvents(snapshot, operationRef) {
  return (snapshot.events ?? [])
    .filter((event) => event.operation_ref === operationRef)
    .sort((a, b) => a.cursor - b.cursor);
}

export async function recordOperationEvent({
  config,
  operationRef,
  jobRef,
  type,
  resultRef = null,
  payload = null
} = {}) {
  if (!config?.runtime?.root || !config.runtime.epoch) fail('valid runtime config is required', 'ERR_RUNTIME_CONFIG');
  const snapshot = await inspectStandardRuntime({ runtime: config.runtime, operationRef });
  const operation = snapshot.operations[0];
  if (!operation) fail(`operation ${operationRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
  if (jobRef !== undefined && jobRef !== operation.job_ref) fail('event job does not own operation', 'ERR_RUNTIME_EVENTS');
  return await recordStandardEvent({
    runtime: config.runtime,
    operationRef,
    type,
    resultRef,
    payload
  });
}

export async function readOperationEvents({ config, operationRef, after = 0 } = {}) {
  if (!config?.runtime?.root || !config.runtime.epoch || !operationRef) fail('config and operationRef are required');
  if (!Number.isInteger(after) || after < 0) fail('event cursor must be a non-negative integer', 'ERR_EVENT_CURSOR_OUT_OF_RANGE');
  const snapshot = await inspectStandardRuntime({ runtime: config.runtime, operationRef });
  const operation = snapshot.operations[0];
  if (!operation) fail(`operation ${operationRef} not found`, 'ERR_RUNTIME_NOT_FOUND');
  const persisted = operationEvents(snapshot, operationRef);
  const events = persisted.length > 0 ? persisted : [{
    schema: 'research.event.v1',
    event_id: `evt_state_${operation.operation_ref}_1`,
    cursor: 1,
    operation_ref: operation.operation_ref,
    job_ref: operation.job_ref,
    type: `operation.${operation.phase}`
  }];
  const maxCursor = events.at(-1).cursor;
  if (after > maxCursor) fail(`event cursor ${after} is beyond available event range ${maxCursor}`, 'ERR_EVENT_CURSOR_OUT_OF_RANGE');
  return events.filter((event) => event.cursor > after).map((event) => structuredClone(event));
}

export async function watchOperation({
  config,
  operationRef,
  observerId,
  after = 0,
  timeoutMs = 0,
  emit,
  clock
} = {}) {
  if (typeof emit !== 'function') fail('emit function is required', 'ERR_RUNTIME_EVENTS_EMIT');
  if (typeof observerId !== 'string' || observerId.trim().length === 0) fail('observerId is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0) fail('timeoutMs must be a non-negative integer');
  let lastCursor = after;
  const startedAt = typeof clock?.now === 'function' ? clock.now() : Date.now();
  const now = () => typeof clock?.now === 'function' ? clock.now() : Date.now();
  const sleep = (ms) => typeof clock?.sleep === 'function'
    ? clock.sleep(ms)
    : new Promise((resolve) => setTimeout(resolve, ms));

  while (true) {
    const events = await readOperationEvents({ config, operationRef, after: lastCursor });
    for (const event of events) {
      emit(event);
      lastCursor = Math.max(lastCursor, event.cursor);
    }
    const elapsed = now() - startedAt;
    if (timeoutMs === 0 || elapsed >= timeoutMs) break;
    await sleep(Math.min(25, timeoutMs - elapsed));
  }

  if (timeoutMs > 0) {
    const snapshot = await inspectStandardRuntime({ runtime: config.runtime, operationRef });
    const operation = snapshot.operations[0];
    emit({
      schema: 'research.event.v1',
      event_id: `evt_timeout_${randomUUID().replace(/-/g, '')}`,
      cursor: lastCursor,
      operation_ref: operationRef,
      job_ref: operation?.job_ref ?? 'unknown',
      type: 'watch.timeout'
    });
  }
}
