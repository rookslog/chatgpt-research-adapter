import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from './canonical-json.js';
import { parseStrictJsonBuffer } from './strict-json.js';

const VERSION = '1.8.7';
const OUTPUT_LIMIT = 256 * 1024;
const VERSION_LIMIT = 4096;
const DEFAULT_TIMEOUT = 135 * 1000;
const MODE_TO_TOOL = Object.freeze({ standard: '', web: 'Web Search', deep: 'Deep Research' });
const CWD = fileURLToPath(new URL('..', import.meta.url));
const CONTRACT = Object.freeze({ version: VERSION, command: 'chatgpt ask', options: Object.freeze({ new: 'true', site_session: 'ephemeral', timeout: '120', format: 'json' }), output: 'single-standard-row-v1' });
export const OPENCLI_COMMAND_CONTRACT_SHA256 = createHash('sha256').update(canonicalJson(CONTRACT)).digest('hex');
const fail = (message, code, details) => { const error = new Error(message); error.code = code; if (details !== undefined) error.details = details; return error; };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const OPENCLI_MARKDOWN_IMPORT = "import { htmlToMarkdown } from '@jackwener/opencli/utils';";
const OPENCLI_MARKDOWN_CONVERTER = String.raw`export function messageHtmlToMarkdown(html) {
    try {
        return htmlToMarkdown(html).trim();
    } catch {
        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}`;
const OPENCLI_MARKDOWN_PATCHED_CONVERTER = String.raw`export function messageHtmlToMarkdown(html) {
    try {
        return htmlToMarkdown(html, (td) => td.use(gfm))
            .replace(/\\\[(C(?:-\d+|\d+))\\\]/g, '[$1]')
            .trim();
    } catch {
        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}`;

function replacePinnedMarkdownSource(source, before, after) {
  const parts = source.split(before);
  if (parts.length !== 2) throw fail('OpenCLI ChatGPT Markdown converter does not match the pinned source', 'ERR_OPENCLI_MARKDOWN_COMPAT');
  return `${parts[0]}${after}${parts[1]}`;
}

function patchOpenCliMarkdownSource(source) {
  const withGfm = replacePinnedMarkdownSource(source, OPENCLI_MARKDOWN_IMPORT, `${OPENCLI_MARKDOWN_IMPORT}\nimport { gfm } from 'turndown-plugin-gfm';`);
  return replacePinnedMarkdownSource(withGfm, OPENCLI_MARKDOWN_CONVERTER, OPENCLI_MARKDOWN_PATCHED_CONVERTER);
}

async function withMarkdownCompatibleOpenCli(identity, run) {
  const entrySuffix = join('dist', 'src', 'main.js');
  if (typeof identity?.real_path !== 'string' || !identity.real_path.endsWith(entrySuffix)) throw fail('OpenCLI package layout is incompatible with Markdown qualification', 'ERR_OPENCLI_MARKDOWN_COMPAT');
  const packageRoot = dirname(dirname(dirname(identity.real_path)));
  const sourcePath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  let source;
  try { source = await readFile(sourcePath, 'utf8'); } catch { throw fail('OpenCLI ChatGPT Markdown converter is unavailable', 'ERR_OPENCLI_MARKDOWN_COMPAT'); }
  const patched = patchOpenCliMarkdownSource(source);
  const tempRoot = await mkdtemp(join(dirname(packageRoot), '.chatgpt-research-opencli-'));
  try {
    await cp(packageRoot, tempRoot, { recursive: true });
    await writeFile(join(tempRoot, 'clis', 'chatgpt', 'utils.js'), patched, 'utf8');
    const copiedExecutable = join(tempRoot, 'dist', 'src', 'main.js');
    const copiedIdentity = await executableIdentity(copiedExecutable);
    if (copiedIdentity.sha256 !== identity.sha256 || copiedIdentity.size !== identity.size) throw fail('OpenCLI copied executable identity changed', 'ERR_OPENCLI_IDENTITY');
    return await run(copiedExecutable);
  } finally { await rm(tempRoot, { recursive: true, force: true }); }
}

function minimalEnvironment(source = process.env) {
  const result = {};
  for (const key of ['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'XDG_CONFIG_HOME', 'OPENCLI_CONFIG_DIR']) if (typeof source[key] === 'string') result[key] = source[key];
  return result;
}

async function executableIdentity(executablePath) {
  if (typeof executablePath !== 'string' || !isAbsolute(executablePath)) throw fail('OpenCLI path must be absolute', 'ERR_OPENCLI_PATH');
  let resolved;
  try { resolved = await realpath(executablePath); } catch { throw fail('OpenCLI executable is unavailable', 'ERR_OPENCLI_PATH'); }
  const entry = await lstat(resolved).catch(() => { throw fail('OpenCLI executable is unavailable', 'ERR_OPENCLI_PATH'); });
  if (!entry.isFile() || (process.platform !== 'win32' && (entry.mode & 0o111) === 0)) throw fail('OpenCLI target must be an executable regular file', 'ERR_OPENCLI_PATH');
  const bytes = await readFile(resolved);
  const after = await lstat(resolved).catch(() => { throw fail('OpenCLI executable identity changed', 'ERR_OPENCLI_IDENTITY'); });
  if (after.dev !== entry.dev || after.ino !== entry.ino || after.size !== entry.size || after.mtimeMs !== entry.mtimeMs) throw fail('OpenCLI executable identity changed', 'ERR_OPENCLI_IDENTITY');
  return Object.freeze({ supplied_path: executablePath, real_path: resolved, sha256: digest(bytes), size: entry.size, device: String(entry.dev), inode: String(entry.ino) });
}

function sameIdentity(left, right) {
  return ['supplied_path', 'real_path', 'sha256', 'size', 'device', 'inode'].every((key) => left?.[key] === right?.[key]);
}

function runProcess(executablePath, args, { spawnImpl = spawn, timeoutMs, outputLimit, environment, killGraceMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnImpl(executablePath, args, { cwd: CWD, env: minimalEnvironment(environment), shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { reject(fail('OpenCLI child could not start', 'ERR_OPENCLI_SPAWN', error?.message)); return; }
    const stdout = []; const stderr = []; let stdoutSize = 0; let stderrSize = 0; let terminalError; let settled = false; let hardTimer;
    const stop = (error) => { if (!terminalError) { terminalError = error; try { child.kill('SIGTERM'); } catch {} hardTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, killGraceMs); } };
    const timer = setTimeout(() => stop(fail('OpenCLI child timed out', 'ERR_OPENCLI_TIMEOUT')), timeoutMs);
    child.stdout?.on('data', (chunk) => { const bytes = Buffer.from(chunk); stdoutSize += bytes.length; if (stdoutSize > outputLimit) stop(fail('OpenCLI stdout exceeded its byte limit', 'ERR_OPENCLI_OUTPUT_LIMIT')); else stdout.push(bytes); });
    child.stderr?.on('data', (chunk) => { const bytes = Buffer.from(chunk); stderrSize += bytes.length; if (stderrSize > outputLimit) stop(fail('OpenCLI stderr exceeded its byte limit', 'ERR_OPENCLI_OUTPUT_LIMIT')); else stderr.push(bytes); });
    child.once('error', (error) => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(hardTimer); reject(terminalError ?? fail('OpenCLI child failed', 'ERR_OPENCLI_SPAWN', error?.message)); });
    child.once('close', (code, signal) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(hardTimer);
      if (terminalError) { reject(terminalError); return; }
      resolve(Object.freeze({ code, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }));
    });
  });
}

export async function preflightOpenCli({ executablePath, spawnImpl, environment, timeoutMs = 5000 } = {}) {
  const before = await executableIdentity(executablePath);
  const result = await runProcess(executablePath, ['--version'], { spawnImpl, timeoutMs, outputLimit: VERSION_LIMIT, environment });
  if (result.code !== 0 || result.signal !== null) throw fail('OpenCLI version preflight failed', 'ERR_OPENCLI_PREFLIGHT');
  let version;
  try { version = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(result.stdout).trim(); } catch { throw fail('OpenCLI version output is invalid', 'ERR_OPENCLI_VERSION'); }
  if (version !== VERSION) throw fail(`OpenCLI version must be ${VERSION}`, 'ERR_OPENCLI_VERSION');
  const after = await executableIdentity(executablePath);
  if (!sameIdentity(before, after)) throw fail('OpenCLI executable identity changed during preflight', 'ERR_OPENCLI_IDENTITY');
  return Object.freeze({ ...after, version });
}

export function parseOpenCliAnswer(bytes, { mode = 'standard' } = {}) {
  if (!(mode in MODE_TO_TOOL)) throw fail('OpenCLI mode is invalid', 'ERR_OPENCLI_MODE');
  let parsed;
  try { parsed = parseStrictJsonBuffer(bytes); } catch { throw fail('OpenCLI output must be strict UTF-8 JSON', 'ERR_OPENCLI_OUTPUT'); }
  if (!Array.isArray(parsed) || parsed.length !== 1) throw fail('OpenCLI output must contain exactly one row', 'ERR_OPENCLI_OUTPUT');
  const row = parsed[0]; const keys = ['conversationId', 'conversationUrl', 'response', 'tool'];
  if (!row || Array.isArray(row) || typeof row !== 'object' || Object.keys(row).sort().join('\n') !== keys.sort().join('\n')) throw fail('OpenCLI output row has an invalid shape', 'ERR_OPENCLI_OUTPUT');
  if (typeof row.conversationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(row.conversationId) || typeof row.response !== 'string' || row.tool !== MODE_TO_TOOL[mode]) throw fail('OpenCLI output row has invalid values', 'ERR_OPENCLI_OUTPUT');
  let url;
  try { url = new URL(row.conversationUrl); } catch { throw fail('OpenCLI conversation URL is invalid', 'ERR_OPENCLI_OUTPUT'); }
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' || url.port !== '' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== `/c/${row.conversationId}`) throw fail('OpenCLI conversation URL is invalid', 'ERR_OPENCLI_OUTPUT');
  return Object.freeze({ conversationId: row.conversationId, conversationUrl: row.conversationUrl, tool: row.tool, response: row.response });
}

function requireTimeoutSeconds(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 7200) throw fail('OpenCLI timeout must be an integer from 1 to 7200 seconds', 'ERR_OPENCLI_TIMEOUT_VALUE');
  return value;
}

async function runAsk({ executablePath, identity, prompt, mode, timeoutSeconds, siteSession, spawnImpl, environment, timeoutMs, killGraceMs }) {
  if (!identity || identity.version !== VERSION) throw fail('OpenCLI identity is required', 'ERR_OPENCLI_IDENTITY');
  if (!(mode in MODE_TO_TOOL)) throw fail('OpenCLI mode is invalid', 'ERR_OPENCLI_MODE');
  if (typeof prompt !== 'string' || Buffer.byteLength(prompt, 'utf8') > 64 * 1024 || prompt.length === 0) throw fail('compiled prompt is invalid', 'ERR_OPENCLI_PROMPT');
  const seconds = requireTimeoutSeconds(timeoutSeconds);
  const current = await executableIdentity(executablePath);
  if (!sameIdentity(identity, current)) throw fail('OpenCLI executable identity changed', 'ERR_OPENCLI_IDENTITY');
  const args = ['chatgpt', 'ask', prompt, '--new', 'true', '--site-session', siteSession, '--timeout', String(seconds), '--format', 'json'];
  if (siteSession === 'persistent') args.push('--wait', 'false');
  if (mode === 'web') args.push('--web-search', 'true');
  if (mode === 'deep') args.push('--deep-research', 'true');
  const result = await runProcess(executablePath, args, { spawnImpl, timeoutMs: timeoutMs ?? ((seconds + 30) * 1000), outputLimit: OUTPUT_LIMIT, environment, killGraceMs });
  if (result.code !== 0 || result.signal !== null) throw fail('OpenCLI ask child did not exit successfully', 'ERR_OPENCLI_EXIT', { code: result.code, signal: result.signal, stderr: result.stderr.toString('utf8') });
  return parseOpenCliAnswer(result.stdout, { mode });
}

export async function runOpenCliAsk({ executablePath, identity, prompt, mode = 'standard', timeoutSeconds = 600, spawnImpl, environment, timeoutMs, killGraceMs = 2000 } = {}) {
  return runAsk({ executablePath, identity, prompt, mode, timeoutSeconds, siteSession: 'persistent', spawnImpl, environment, timeoutMs, killGraceMs });
}

export async function runOpenCliDetail({ executablePath, identity, conversationId, timeoutSeconds = 600, spawnImpl, environment, timeoutMs, killGraceMs = 2000 } = {}) {
  if (!identity || identity.version !== VERSION) throw fail('OpenCLI identity is required', 'ERR_OPENCLI_IDENTITY');
  if (typeof conversationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(conversationId)) throw fail('OpenCLI conversation id is invalid', 'ERR_OPENCLI_CONVERSATION');
  const seconds = requireTimeoutSeconds(timeoutSeconds);
  const current = await executableIdentity(executablePath);
  if (!sameIdentity(identity, current)) throw fail('OpenCLI executable identity changed', 'ERR_OPENCLI_IDENTITY');
  const args = ['chatgpt', 'detail', conversationId, '--markdown', 'true', '--wait', 'true', '--timeout', String(seconds), '--stable', '3', '--site-session', 'ephemeral', '--format', 'json'];
  const result = await withMarkdownCompatibleOpenCli(identity, (detailExecutablePath) => runProcess(detailExecutablePath, args, { spawnImpl, timeoutMs: timeoutMs ?? ((seconds + 30) * 1000), outputLimit: OUTPUT_LIMIT, environment, killGraceMs }));
  if (result.code !== 0 || result.signal !== null) throw fail('OpenCLI conversation reader did not exit successfully', 'ERR_OPENCLI_EXIT', { code: result.code, signal: result.signal, stderr: result.stderr.toString('utf8') });
  let rows;
  try { rows = parseStrictJsonBuffer(result.stdout); } catch { throw fail('OpenCLI detail output must be strict UTF-8 JSON', 'ERR_OPENCLI_OUTPUT'); }
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => !row || Array.isArray(row) || typeof row !== 'object')) throw fail('OpenCLI detail output is invalid', 'ERR_OPENCLI_OUTPUT');
  const assistant = rows.findLast((row) => row.Role === 'Assistant' && typeof row.Text === 'string' && row.Text.trim().length > 0 && row.Generating === false);
  if (!assistant) throw fail('OpenCLI detail output has no completed assistant response', 'ERR_OPENCLI_OUTPUT');
  return Object.freeze({ response: assistant.Text, rows: Object.freeze(rows) });
}

export async function runOpenCliDeepResearchResult({ executablePath, identity, conversationId, timeoutSeconds = 1200, spawnImpl, environment, timeoutMs, killGraceMs = 2000 } = {}) {
  if (!identity || identity.version !== VERSION) throw fail('OpenCLI identity is required', 'ERR_OPENCLI_IDENTITY');
  if (typeof conversationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(conversationId)) throw fail('OpenCLI conversation id is invalid', 'ERR_OPENCLI_CONVERSATION');
  const seconds = requireTimeoutSeconds(timeoutSeconds);
  const current = await executableIdentity(executablePath);
  if (!sameIdentity(identity, current)) throw fail('OpenCLI executable identity changed', 'ERR_OPENCLI_IDENTITY');
  const args = ['chatgpt', 'deep-research-result', conversationId, '--wait', 'true', '--timeout', String(seconds), '--stable', '6', '--site-session', 'persistent', '--format', 'json'];
  const result = await runProcess(executablePath, args, { spawnImpl, timeoutMs: timeoutMs ?? ((seconds + 30) * 1000), outputLimit: OUTPUT_LIMIT, environment, killGraceMs });
  if (result.code !== 0 || result.signal !== null) throw fail('OpenCLI Deep Research reader did not exit successfully', 'ERR_OPENCLI_EXIT', { code: result.code, signal: result.signal, stderr: result.stderr.toString('utf8') });
  let parsed;
  try { parsed = parseStrictJsonBuffer(result.stdout); } catch { throw fail('OpenCLI Deep Research output must be strict UTF-8 JSON', 'ERR_OPENCLI_OUTPUT'); }
  if (!Array.isArray(parsed) || parsed.length !== 1) throw fail('OpenCLI Deep Research output must contain exactly one row', 'ERR_OPENCLI_OUTPUT');
  const row = parsed[0];
  if (!row || Array.isArray(row) || typeof row !== 'object' || row.conversationId !== conversationId || row.status !== 'completed' || typeof row.report !== 'string' || row.report.trim().length === 0 || !Array.isArray(row.sources)) throw fail('OpenCLI Deep Research output is incomplete', 'ERR_OPENCLI_OUTPUT');
  return Object.freeze(row);
}

export async function runOpenCliStandard({ executablePath, identity, prompt, spawnImpl, environment, timeoutMs = DEFAULT_TIMEOUT, killGraceMs = 2000 } = {}) {
  return runAsk({ executablePath, identity, prompt, mode: 'standard', timeoutSeconds: 120, siteSession: 'ephemeral', spawnImpl, environment, timeoutMs, killGraceMs });
}
