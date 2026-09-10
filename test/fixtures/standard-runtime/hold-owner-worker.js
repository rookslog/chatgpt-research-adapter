// Node discovers files below test/; this executable fixture acts only with an explicit runtime argument.
if (!process.argv.includes('--runtime-root')) process.exit(0);
import { parseArgs } from 'node:util';
import { dispatchNextStandard } from '../../../src/standard-runtime.js';

const { values } = parseArgs({
  options: {
    'runtime-root': { type: 'string' },
    'runtime-epoch': { type: 'string' }
  }
});

const runtime = { root: values['runtime-root'], epoch: values['runtime-epoch'] };

let now = 10_000_000;
const context = {
  authorize: () => true,
  deliveryReady: () => true,
  clock: { now: () => now, sleep: async (ms) => { now += ms; } },
  random: () => 0
};

const driver = {
  prepare: async () => {
    // Signal to parent that driver.prepare has entered effect ownership
    process.stdout.write('READY_HOLDING_OWNERSHIP\n');
    // Block indefinitely until terminated by parent process
    await new Promise(() => { setInterval(() => {}, 1000); });
    return { status: 'ready', target: 'endpoint-never' };
  },
  send: async () => {
    throw new Error('send must never be reached in hold-owner-worker');
  }
};

try {
  await dispatchNextStandard({ runtime, context, driver });
} catch (err) {
  process.stderr.write(JSON.stringify({ code: err?.code, message: err?.message }));
  process.exit(1);
}
