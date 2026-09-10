import { parseArgs } from 'node:util';
import { dispatchNextStandard } from '../../../src/standard-runtime.js';

const { values } = parseArgs({
  options: {
    'runtime-root': { type: 'string' },
    'runtime-epoch': { type: 'string' },
    'delay-send-ms': { type: 'string', default: '40' }
  }
});

const runtime = { root: values['runtime-root'], epoch: values['runtime-epoch'] };
const delaySendMs = parseInt(values['delay-send-ms'], 10);

let now = 10_000_000;
const context = {
  authorize: () => true,
  deliveryReady: () => true,
  clock: { now: () => now, sleep: async (ms) => { now += ms; } },
  random: () => 0
};

const driver = {
  prepare: async () => ({ status: 'ready', target: 'endpoint-dispatch-worker', evidenceRef: 'ev-prep' }),
  send: async (op) => {
    if (delaySendMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySendMs));
    }
    return {
      status: 'accepted',
      binding: { conversationId: `conv-${op.operation_ref}`, userMessageId: `msg-${op.operation_ref}` },
      evidenceRef: 'ev-send'
    };
  }
};

try {
  const result = await dispatchNextStandard({ runtime, context, driver });
  process.stdout.write(JSON.stringify({ status: result?.status, operation_ref: result?.operation_ref }));
  process.exit(0);
} catch (err) {
  if (err?.code === 'ERR_RUNTIME_BUSY') {
    process.stdout.write(JSON.stringify({ status: 'busy', code: 'ERR_RUNTIME_BUSY' }));
    process.exit(0);
  }
  process.stderr.write(JSON.stringify({ code: err?.code, message: err?.message }));
  process.exit(1);
}
