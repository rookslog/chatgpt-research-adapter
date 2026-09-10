import { parseArgs } from 'node:util';
import { submitPreparedJobOnce } from '../../../src/submit-once.js';

const { values } = parseArgs({
  options: {
    'output-root': { type: 'string' },
    'job-id': { type: 'string' },
    'runtime-root': { type: 'string' },
    'runtime-epoch': { type: 'string' },
    'request-key': { type: 'string' },
    'max-retries': { type: 'string', default: '30' }
  }
});

const outputRoot = values['output-root'];
const jobId = values['job-id'];
const runtime = { root: values['runtime-root'], epoch: values['runtime-epoch'] };
const requestKey = values['request-key'];
const maxRetries = parseInt(values['max-retries'], 10);

let lastError = null;
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    const receipt = await submitPreparedJobOnce({
      outputRoot,
      jobId,
      runtime,
      requestKey
    });
    process.stdout.write(JSON.stringify(receipt));
    process.exit(0);
  } catch (err) {
    lastError = err;
    if (err?.code === 'ERR_RUNTIME_BUSY' && attempt < maxRetries - 1) {
      const backoff = 10 + Math.floor(Math.random() * 25);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }
    process.stderr.write(JSON.stringify({ code: err?.code, message: err?.message }));
    process.exit(1);
  }
}

process.stderr.write(JSON.stringify({ code: lastError?.code ?? 'ERR_TIMEOUT', message: lastError?.message ?? 'Retries exhausted' }));
process.exit(1);
