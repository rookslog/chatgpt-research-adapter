import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from './canonical-json.js';
import { parseStrictJsonBuffer } from './strict-json.js';

const VERSION = '1.8.7';
const OUTPUT_LIMIT = 256 * 1024;
const VERSION_LIMIT = 4096;
const DEFAULT_TIMEOUT = 135 * 1000;
const MAX_EXECUTABLE_BYTES = 16 * 1024 * 1024;
const MODE_TO_TOOL = Object.freeze({ standard: '', web: 'Web Search', deep: 'Deep Research' });
const CHATGPT_CONVERSATION_ROOT = ['https:', '', 'chatgpt.com', 'c'].join('/');
const CWD = fileURLToPath(new URL('..', import.meta.url));
const CONTRACT = Object.freeze({ version: VERSION, command: 'chatgpt ask', options: Object.freeze({ new: 'true', site_session: 'ephemeral', timeout: '120', format: 'json' }), output: 'single-standard-row-v1' });
export const OPENCLI_COMMAND_CONTRACT_SHA256 = createHash('sha256').update(canonicalJson(CONTRACT)).digest('hex');
const fail = (message, code, details) => { const error = new Error(message); error.code = code; if (details !== undefined) error.details = details; return error; };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const OPENCLI_MARKDOWN_IMPORT = ['im', "port { htmlToMarkdown } from '@jackwener/opencli/utils';"].join('');
const OPENCLI_TABLES_IMPORT = ['im', "port { tables } from 'turndown-plugin-gfm';"].join('');
const OPENCLI_MARKDOWN_CONVERTER = String.raw`export function messageHtmlToMarkdown(html) {
    try {
        return htmlToMarkdown(html).trim();
    } catch {
        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}`;
const OPENCLI_MARKDOWN_PATCHED_CONVERTER = String.raw`export function messageHtmlToMarkdown(html) {
    try {
        return htmlToMarkdown(html, (td) => {
            td.use(tables);
            const escape = td.escape.bind(td);
            td.escape = (text) => escape(text).replace(/\\\[(C(?:-\d+|\d+))\\\]/g, '[$1]');
        }).trim();
    } catch {
        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}`;

const OPENCLI_TOOL_OPTIONS = "const CHATGPT_TOOL_OPTIONS = {\n    'deep-research': { label: 'Deep Research', labels: ['深度研究', 'Deep Research'] },\n    'web-search': { label: 'Web Search', labels: ['网页搜索', '搜索', 'Web Search', 'Search'] },\n};";
const OPENCLI_TOOL_OPTIONS_PATCHED = "const CHATGPT_TOOL_OPTIONS = {\n    'deep-research': { label: 'Deep Research', labels: ['深度研究', 'Deep Research'] },\n    'web-search': { label: 'Web Search', labels: ['网页搜索', 'Web Search'] },\n};";
const OPENCLI_TOOL_ROOT_SELECTOR = "            const rootSelector = '[role=\"menu\"], [role=\"listbox\"], [data-radix-popper-content-wrapper], [data-radix-menu-content], [data-testid*=\"menu\"], [data-testid*=\"popover\"]';";
const OPENCLI_TOOL_ROOT_SELECTOR_PATCHED = "            const rootSelector = '[role=\"group\"], [role=\"menu\"], [role=\"listbox\"], [data-radix-popper-content-wrapper], [data-radix-menu-content], [data-testid*=\"menu\"], [data-testid*=\"popover\"]';";
const OPENCLI_TOOL_OPTION_MATCHER = String.raw`            const option = options.find((node) => {
                if (!(node instanceof HTMLElement) || !isVisible(node) || node.closest('nav, aside')) return false;
                const haystacks = [
                    node.textContent,
                    node.getAttribute('aria-label'),
                    node.getAttribute('title'),
                    node.getAttribute('data-testid'),
                ];
                return haystacks.some(matchesLabel);
            });`;
const OPENCLI_TOOL_OPTION_MATCHER_PATCHED = String.raw`            const exactLabels = labels.map((label) => normalize(label).toLowerCase());
            const option = options.find((node) => {
                if (!(node instanceof HTMLElement) || !isVisible(node) || node.closest('nav, aside')) return false;
                const primaryNodes = [node, ...node.querySelectorAll('span, div, p')];
                return primaryNodes.some((part) => exactLabels.includes(normalize(part.textContent).toLowerCase()));
            });`;
const OPENCLI_TOOL_MENU_ACTIVATION = String.raw`    if (!menuButton.found) {
        throw new CommandExecutionError('Could not find the ChatGPT tools menu button in the composer.');
    }
    await page.nativeClick(Number(menuButton.x), Number(menuButton.y));
    await page.wait(0.5);`;
const OPENCLI_TOOL_MENU_ACTIVATION_PATCHED = String.raw`    if (!menuButton.found) {
        throw new CommandExecutionError('Could not find the ChatGPT tools menu button in the composer.');
    }
    const menuIsOpen = async () => requireBooleanEvaluateResult(unwrapEvaluateResult(await page.evaluate(\`(() => {
        const isVisible = (el) => {
            if (!(el instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const labels = \${JSON.stringify(target.labels)}.map(normalize);
        const button = document.querySelector('button[data-testid="composer-plus-btn"]');
        if (button instanceof HTMLElement && button.getAttribute('aria-expanded') === 'true') return true;
        const optionSelector = '[role="menuitemradio"], [role="menuitem"], [role="option"], button, div[tabindex="0"]';
        const rootSelector = '[role="group"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-radix-menu-content], [data-testid*="menu"], [data-testid*="popover"]';
        return Array.from(document.querySelectorAll(rootSelector)).some((root) =>
            root instanceof HTMLElement && isVisible(root) && !root.closest('nav, aside')
            && Array.from(root.querySelectorAll(optionSelector)).some((node) => {
                if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
                const primaryNodes = [node, ...node.querySelectorAll('span, div, p')];
                return primaryNodes.some((part) => labels.includes(normalize(part.textContent)));
            })
        );
    })()\`)), 'chatgpt tools menu activation');
    await page.nativeClick(Number(menuButton.x), Number(menuButton.y));
    let menuOpened = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        await page.wait(0.5);
        if (await menuIsOpen()) {
            menuOpened = true;
            break;
        }
    }
    if (!menuOpened) {
        const domClicked = requireBooleanEvaluateResult(unwrapEvaluateResult(await page.evaluate(\`(() => {
            const hit = document.elementFromPoint(\${Number(menuButton.x)}, \${Number(menuButton.y)});
            const button = hit instanceof Element ? hit.closest('button[data-testid="composer-plus-btn"]') : null;
            if (!(button instanceof HTMLElement)) return false;
            button.click();
            return true;
        })()\`)), 'chatgpt tools menu DOM fallback');
        if (!domClicked) throw new CommandExecutionError('ChatGPT tools menu did not open.');
        await page.wait(0.5);
        if (!(await menuIsOpen())) throw new CommandExecutionError('ChatGPT tools menu did not open.');
    }`;
const OPENCLI_TOOL_OPTION_ACTIVATION = String.raw`    if (!optionCenter?.found) {
        throw new CommandExecutionError(\`Could not find the ChatGPT \${target.label} tool option.\`);
    }
    if (!optionCenter.checked) {
        await page.nativeClick(Number(optionCenter.x), Number(optionCenter.y));
    }

    await page.wait(0.5);
    const after = await getCurrentChatGPTTool(page);
    if (after.tool !== target.key) {
        throw new CommandExecutionError(\`ChatGPT tool did not switch to \${target.label}.\`);
    }
    return { Status: optionCenter.checked ? 'Already selected' : 'Success', Tool: target.label };`;
const OPENCLI_TOOL_OPTION_ACTIVATION_PATCHED = String.raw`    if (!optionCenter?.found) {
        throw new CommandExecutionError(\`Could not find the ChatGPT \${target.label} tool option.\`);
    }
    const selectedState = async () => requireObjectEvaluateResult(unwrapEvaluateResult(await page.evaluate(\`(() => {
        const isVisible = (el) => {
            if (!(el instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const labels = \${JSON.stringify(target.labels)}.map(normalize);
        const composerSelector = '#prompt-textarea[contenteditable="true"], [data-testid="prompt-textarea"][contenteditable="true"], [contenteditable="true"][role="textbox"]';
        const composers = Array.from(document.querySelectorAll(composerSelector))
            .filter((node) => node instanceof HTMLElement && isVisible(node));
        const composer = composers.find((node) => !node.closest('nav, aside')) || null;
        if (!(composer instanceof HTMLElement)) return { selected: false };
        const chips = Array.from(composer.querySelectorAll('[contenteditable="false"]'))
            .filter((node) => node instanceof HTMLElement && isVisible(node));
        return { selected: chips.filter((node) => labels.includes(normalize(node.textContent))).length === 1 };
    })()\`)), 'chatgpt selected tool chip');
    if (!optionCenter.checked) {
        await page.nativeClick(Number(optionCenter.x), Number(optionCenter.y));
        await page.wait(0.5);
        if (!(await selectedState()).selected) {
            const domClicked = requireBooleanEvaluateResult(unwrapEvaluateResult(await page.evaluate(\`(() => {
                const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                const labels = \${JSON.stringify(target.labels)}.map(normalize);
                const optionSelector = '[role="menuitemradio"], [role="menuitem"], [role="option"], button, div[tabindex="0"]';
                const hit = document.elementFromPoint(\${Number(optionCenter.x)}, \${Number(optionCenter.y)});
                const option = hit instanceof Element ? hit.closest(optionSelector) : null;
                if (!(option instanceof HTMLElement)) return false;
                const primaryNodes = [option, ...option.querySelectorAll('span, div, p')];
                if (!primaryNodes.some((part) => labels.includes(normalize(part.textContent)))) return false;
                option.click();
                return true;
            })()\`)), 'chatgpt tool option DOM fallback');
            if (!domClicked) throw new CommandExecutionError(\`ChatGPT tool did not switch to \${target.label}.\`);
            await page.wait(0.5);
        }
    }
    if (!(await selectedState()).selected) {
        throw new CommandExecutionError(\`ChatGPT tool did not switch to \${target.label}.\`);
    }
    return { Status: optionCenter.checked ? 'Already selected' : 'Success', Tool: target.label };`;

function replacePinnedMarkdownSource(source, before, after) {
  const parts = source.split(before);
  if (parts.length !== 2) throw fail('OpenCLI ChatGPT Markdown converter does not match the pinned source', 'ERR_OPENCLI_MARKDOWN_COMPAT');
  return `${parts[0]}${after}${parts[1]}`;
}

function patchOpenCliMarkdownSource(source) {
  const withGfm = replacePinnedMarkdownSource(source, OPENCLI_MARKDOWN_IMPORT, `${OPENCLI_MARKDOWN_IMPORT}\n${OPENCLI_TABLES_IMPORT}`);
  return replacePinnedMarkdownSource(withGfm, OPENCLI_MARKDOWN_CONVERTER, OPENCLI_MARKDOWN_PATCHED_CONVERTER);
}

function embeddedPinnedToolSource(value) {
  return value.replaceAll('\\`', '`').replaceAll('\\${', '${');
}

function replacePinnedToolSource(source, before, after, compatCode) {
  const pinnedBefore = embeddedPinnedToolSource(before);
  const pinnedAfter = embeddedPinnedToolSource(after);
  const parts = source.split(pinnedBefore);
  if (parts.length !== 2) throw fail('OpenCLI ChatGPT tool selector does not match the pinned source', compatCode);
  return `${parts[0]}${pinnedAfter}${parts[1]}`;
}

function patchOpenCliToolSelectorSource(source, compatCode) {
  const withLabels = replacePinnedToolSource(source, OPENCLI_TOOL_OPTIONS, OPENCLI_TOOL_OPTIONS_PATCHED, compatCode);
  const withRoot = replacePinnedToolSource(withLabels, OPENCLI_TOOL_ROOT_SELECTOR, OPENCLI_TOOL_ROOT_SELECTOR_PATCHED, compatCode);
  const withExactOption = replacePinnedToolSource(withRoot, OPENCLI_TOOL_OPTION_MATCHER, OPENCLI_TOOL_OPTION_MATCHER_PATCHED, compatCode);
  const withMenuActivation = replacePinnedToolSource(withExactOption, OPENCLI_TOOL_MENU_ACTIVATION, OPENCLI_TOOL_MENU_ACTIVATION_PATCHED, compatCode);
  return replacePinnedToolSource(withMenuActivation, OPENCLI_TOOL_OPTION_ACTIVATION, OPENCLI_TOOL_OPTION_ACTIVATION_PATCHED, compatCode);
}

function temporaryDirectoryRoot(source = process.env, compatCode = 'ERR_OPENCLI_MARKDOWN_COMPAT') {
  const candidate = process.platform === 'win32'
    ? (source.TEMP ?? source.TMP)
    : (source.TMPDIR ?? source.TMP ?? source.TEMP ?? '/tmp');
  if (typeof candidate !== 'string' || !isAbsolute(candidate)) throw fail('OpenCLI temporary directory is unavailable', compatCode);
  return candidate;
}

function nearestNodeModules(packageRoot) {
  let current = dirname(packageRoot);
  while (dirname(current) !== current) {
    if (basename(current) === 'node_modules') return current;
    current = dirname(current);
  }
  return basename(current) === 'node_modules' ? current : null;
}

async function makeCopiedDirectoriesRemovable(root) {
  const entry = await lstat(root).catch(() => null);
  if (entry === null || !entry.isDirectory() || entry.isSymbolicLink()) return;
  await chmod(root, entry.mode | 0o700);
  const children = await readdir(root, { withFileTypes: true });
  for (const child of children) {
    if (child.isDirectory() && !child.isSymbolicLink()) await makeCopiedDirectoriesRemovable(join(root, child.name));
  }
}

async function withPatchedOpenCli(identity, environment, { patchSource, compatCode, label, isolateHome = false }, run) {
  const entrySuffix = join('dist', 'src', 'main.js');
  if (typeof identity?.real_path !== 'string' || !identity.real_path.endsWith(entrySuffix)) throw fail(`OpenCLI package layout is incompatible with ${label}`, compatCode);
  const packageRoot = dirname(dirname(dirname(identity.real_path)));
  const sourcePath = join(packageRoot, 'clis', 'chatgpt', 'utils.js');
  let source;
  try { source = await readFile(sourcePath, 'utf8'); } catch { throw fail(`OpenCLI ChatGPT source is unavailable for ${label}`, compatCode); }
  const patched = patchSource(source);
  const dependencyRoot = nearestNodeModules(packageRoot);
  const dependencyEntry = dependencyRoot === null ? null : await lstat(dependencyRoot).catch(() => null);
  if (dependencyEntry === null || !dependencyEntry.isDirectory()) throw fail(`OpenCLI dependency root is unavailable for ${label}`, compatCode);
  let workspace;
  try { workspace = await mkdtemp(join(temporaryDirectoryRoot(process.env, compatCode), 'chatgpt-research-opencli-')); }
  catch (error) { if (error?.code === compatCode) throw error; throw fail(`OpenCLI temporary workspace is unavailable for ${label}`, compatCode); }
  const tempPackageRoot = join(workspace, 'opencli');
  try {
    await cp(packageRoot, tempPackageRoot, { recursive: true });
    const workspaceModulesPath = join(workspace, 'node_modules');
    try { await symlink(dependencyRoot, workspaceModulesPath, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch { throw fail(`OpenCLI dependencies could not be linked for ${label}`, compatCode); }
    const copiedSourcePath = join(tempPackageRoot, 'clis', 'chatgpt', 'utils.js');
    const copiedSource = await lstat(copiedSourcePath).catch(() => null);
    if (copiedSource === null || !copiedSource.isFile()) throw fail(`OpenCLI copied ChatGPT source is invalid for ${label}`, compatCode);
    try { await chmod(copiedSourcePath, copiedSource.mode | 0o200); }
    catch { throw fail(`OpenCLI copied ChatGPT source is not writable for ${label}`, compatCode); }
    await writeFile(copiedSourcePath, patched, 'utf8');
    let runEnvironment = environment ?? process.env;
    if (isolateHome) {
      const isolatedHome = join(workspace, 'home');
      await mkdir(isolatedHome, { mode: 0o700 });
      runEnvironment = { ...runEnvironment, HOME: isolatedHome, USERPROFILE: isolatedHome };
    }
    const copiedExecutable = join(tempPackageRoot, 'dist', 'src', 'main.js');
    const copiedIdentity = await executableIdentity(copiedExecutable);
    if (copiedIdentity.sha256 !== identity.sha256 || copiedIdentity.size !== identity.size) throw fail('OpenCLI copied executable identity changed', 'ERR_OPENCLI_IDENTITY');
    return await run(copiedExecutable, runEnvironment);
  } finally {
    await makeCopiedDirectoriesRemovable(tempPackageRoot);
    await rm(workspace, { recursive: true, force: true });
  }
}

async function withMarkdownCompatibleOpenCli(identity, environment, run) {
  return withPatchedOpenCli(identity, environment, {
    patchSource: patchOpenCliMarkdownSource,
    compatCode: 'ERR_OPENCLI_MARKDOWN_COMPAT',
    label: 'Markdown qualification',
    isolateHome: true,
  }, run);
}

async function withToolCompatibleOpenCli(identity, environment, mode, run) {
  const compatCode = mode === 'web' ? 'ERR_OPENCLI_WEB_COMPAT' : 'ERR_OPENCLI_DEEP_COMPAT';
  const label = mode === 'web' ? 'Web Search compatibility' : 'Deep Research compatibility';
  return withPatchedOpenCli(identity, environment, {
    patchSource: (source) => patchOpenCliToolSelectorSource(source, compatCode),
    compatCode,
    label,
  }, run);
}

function minimalEnvironment(source = process.env) {
  const result = {};
  for (const key of ['HOME', 'USERPROFILE', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'XDG_CONFIG_HOME', 'OPENCLI_CONFIG_DIR']) if (typeof source[key] === 'string') result[key] = source[key];
  return result;
}

async function executableIdentity(executablePath) {
  if (typeof executablePath !== 'string' || !isAbsolute(executablePath)) throw fail('OpenCLI path must be absolute', 'ERR_OPENCLI_PATH');
  let resolved;
  try { resolved = await realpath(executablePath); } catch { throw fail('OpenCLI executable is unavailable', 'ERR_OPENCLI_PATH'); }
  const entry = await lstat(resolved).catch(() => { throw fail('OpenCLI executable is unavailable', 'ERR_OPENCLI_PATH'); });
  if (!entry.isFile() || (process.platform !== 'win32' && (entry.mode & 0o111) === 0)) throw fail('OpenCLI target must be an executable regular file', 'ERR_OPENCLI_PATH');
  if (entry.size > MAX_EXECUTABLE_BYTES) throw fail('OpenCLI executable exceeds its byte limit', 'ERR_OPENCLI_EXECUTABLE_LIMIT');
  const bytes = await readFile(resolved);
  const after = await lstat(resolved).catch(() => { throw fail('OpenCLI executable identity changed', 'ERR_OPENCLI_IDENTITY'); });
  if (after.dev !== entry.dev || after.ino !== entry.ino || after.size !== entry.size || after.mtimeMs !== entry.mtimeMs) throw fail('OpenCLI executable identity changed during read', 'ERR_OPENCLI_IDENTITY');
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
  const result = await runProcess(before.real_path, ['--version'], { spawnImpl, timeoutMs, outputLimit: VERSION_LIMIT, environment });
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
  return Object.freeze({ conversationId: row.conversationId, conversationUrl: `${CHATGPT_CONVERSATION_ROOT}/${row.conversationId}`, tool: row.tool, response: row.response });
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
  const execute = (askExecutablePath, askEnvironment) => runProcess(askExecutablePath, args, { spawnImpl, timeoutMs: timeoutMs ?? ((seconds + 30) * 1000), outputLimit: OUTPUT_LIMIT, environment: askEnvironment, killGraceMs });
  const result = mode === 'web' || mode === 'deep'
    ? await withToolCompatibleOpenCli(identity, environment, mode, execute)
    : await execute(identity.real_path, environment);
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
  const result = await withMarkdownCompatibleOpenCli(identity, environment, (detailExecutablePath, detailEnvironment) => runProcess(detailExecutablePath, args, { spawnImpl, timeoutMs: timeoutMs ?? ((seconds + 30) * 1000), outputLimit: OUTPUT_LIMIT, environment: detailEnvironment, killGraceMs }));
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
  const result = await runProcess(identity.real_path, args, { spawnImpl, timeoutMs: timeoutMs ?? ((seconds + 30) * 1000), outputLimit: OUTPUT_LIMIT, environment, killGraceMs });
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
