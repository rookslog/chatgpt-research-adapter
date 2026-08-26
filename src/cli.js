import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from './canonical-json.js';
import { directAsk } from './direct-ask.js';
import { prepareResearchJob } from './prepare.js';
import { parseStrictJsonBuffer } from './strict-json.js';
import { submitPreparedJobOnce } from './submit-once.js';

const fail = (message, code) => { const error = new Error(message); error.code = code; throw error; };
const ASK_USAGE = 'usage: ask <prompt> [--mode standard|web|deep] [--rigor light|standard|strict | --rigor-file <absolute-json>] [--citations principal|expanded] [--audit-appendix] --output-root <directory> --opencli <absolute-path>';

function parseAsk(argv) {
  if (!Array.isArray(argv) || argv[0] !== 'ask' || typeof argv[1] !== 'string' || argv[1].trim().length === 0 || argv.length < 6) return null;
  const tail = argv.slice(-4);
  if (tail[0] !== '--output-root' || typeof tail[1] !== 'string' || tail[2] !== '--opencli' || typeof tail[3] !== 'string' || !isAbsolute(tail[3])) fail(ASK_USAGE, 'ERR_CLI_USAGE');
  const options = { question: argv[1], mode: 'standard', outputRoot: tail[1], openCliPath: tail[3] };
  const seen = new Set(); const prefix = argv.slice(2, -4);
  for (let index = 0; index < prefix.length; index += 1) {
    const flag = prefix[index];
    if (seen.has(flag)) fail(ASK_USAGE, 'ERR_CLI_USAGE');
    seen.add(flag);
    if (flag === '--audit-appendix') { options.auditAppendix = true; continue; }
    const value = prefix[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) fail(ASK_USAGE, 'ERR_CLI_USAGE');
    index += 1;
    if (flag === '--mode') options.mode = value;
    else if (flag === '--rigor') options.rigorProfile = value;
    else if (flag === '--rigor-file') options.rigorProfileFile = value;
    else if (flag === '--citations') options.citationLevel = value;
    else fail(ASK_USAGE, 'ERR_CLI_USAGE');
  }
  if (!['standard', 'web', 'deep'].includes(options.mode) || (options.rigorProfile !== undefined && !['light', 'standard', 'strict'].includes(options.rigorProfile)) || (options.rigorProfileFile !== undefined && !isAbsolute(options.rigorProfileFile)) || (options.rigorProfile !== undefined && options.rigorProfileFile !== undefined) || (options.citationLevel !== undefined && !['principal', 'expanded'].includes(options.citationLevel))) fail(ASK_USAGE, 'ERR_CLI_USAGE');
  return options;
}

export async function runCli(argv, { stdout = process.stdout, templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url)), ask = directAsk, submit = submitPreparedJobOnce } = {}) {
  const askOptions = parseAsk(argv);
  if (askOptions) {
    const summary = await ask(askOptions);
    stdout.write(`${canonicalJson(summary)}\n`);
    return summary;
  }
  if (Array.isArray(argv) && argv.length === 7 && argv[0] === 'submit-once' && argv[1] === '--output-root' && argv[3] === '--job-id' && argv[5] === '--opencli' && typeof argv[2] === 'string' && typeof argv[4] === 'string' && typeof argv[6] === 'string' && isAbsolute(argv[6])) {
    const summary = await submit({ outputRoot: argv[2], jobId: argv[4], openCliPath: argv[6] });
    stdout.write(`${canonicalJson(summary)}\n`);
    return summary;
  }
  if (!Array.isArray(argv) || argv.length !== 5 || argv[0] !== 'prepare' || argv[1] !== '--request' || argv[3] !== '--output-root' || typeof argv[2] !== 'string' || typeof argv[4] !== 'string') fail(`${ASK_USAGE} | prepare --request <json-file> --output-root <directory> | submit-once --output-root <directory> --job-id <id> --opencli <absolute-path>`, 'ERR_CLI_USAGE');
  const requestPath = argv[2];
  const entry = await lstat(requestPath).catch(() => fail('request file is unavailable', 'ERR_CLI_REQUEST'));
  if (!entry.isFile() || entry.isSymbolicLink()) fail('request file must be a regular non-symlink file', 'ERR_CLI_REQUEST');
  const handle = await open(requestPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => fail('request file is unavailable', 'ERR_CLI_REQUEST'));
  let bytes;
  try {
    const info = await handle.stat(); if (!info.isFile()) fail('request file must be regular', 'ERR_CLI_REQUEST');
    const buffer = Buffer.alloc(64 * 1024 + 1); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 64 * 1024) fail('request file exceeds 64 KiB', 'ERR_REQUEST_LIMIT');
    bytes = buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
  const request = parseStrictJsonBuffer(bytes, { requireObjectRoot: true });
  const summary = await prepareResearchJob({ request, outputRoot: argv[4], templatesRoot });
  stdout.write(`${canonicalJson(summary)}\n`);
  return summary;
}

export function formatCliError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'ERR_CLI';
  const stderr = typeof error?.details?.stderr === 'string' ? error.details.stderr : '';
  return `${code}: ${error?.message ?? 'command failed'}\n${stderr}${stderr && !stderr.endsWith('\n') ? '\n' : ''}`;
}
