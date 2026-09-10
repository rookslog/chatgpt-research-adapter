import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_PINNED_FILES = [
  'dist/src/browser/daemon-transport.js',
  'dist/src/constants.js',
  'dist/src/daemon.js'
];
const COMMAND_TIMEOUT_MS = 120_000;

async function readResponseText(response, { maxBytes, deadlineAt } = {}) {
  const remaining = () => Math.max(0, deadlineAt - Date.now());
  const timed = async (promise, cancel) => {
    const waitMs = remaining();
    if (waitMs === 0) throw new Error('daemon response deadline expired');
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            cancel?.();
            reject(new Error('daemon response deadline expired'));
          }, waitMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await timed(reader.read(), () => reader.cancel().catch(() => {}));
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('daemon response exceeded byte limit');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await timed(response.text());
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('daemon response exceeded byte limit');
  return text;
}

async function readResponseJson(response, limits) {
  return JSON.parse(await readResponseText(response, limits));
}

export async function createOpenCliCommandTransport({
  packageRoot,
  contextId,
  sourceIdentity,
  requestImpl
} = {}) {
  if (!packageRoot || typeof packageRoot !== 'string' || !isAbsolute(packageRoot)) {
    throw new Error('packageRoot must be an absolute string path');
  }
  const rootStat = await lstat(packageRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('packageRoot must be an owned regular directory and not a symlink');
  }
  if (typeof process.getuid === 'function' && rootStat.uid !== process.getuid()) {
    throw new Error('packageRoot must be owned by the current user');
  }

  if (!contextId || typeof contextId !== 'string') {
    throw new Error('contextId must be a non-empty string');
  }
  if (!sourceIdentity || typeof sourceIdentity !== 'object') {
    throw new Error('sourceIdentity must be an object');
  }
  if (sourceIdentity.packageName !== '@jackwener/opencli') {
    throw new Error(`unsupported packageName: ${sourceIdentity.packageName}`);
  }
  if (sourceIdentity.version !== '1.8.7') {
    throw new Error(`unsupported opencli version: ${sourceIdentity.version}`);
  }
  if (sourceIdentity.bridgeVersion !== '1.0.23') {
    throw new Error(`unsupported bridgeVersion: ${sourceIdentity.bridgeVersion}`);
  }
  if (!sourceIdentity.files || typeof sourceIdentity.files !== 'object' || Object.keys(sourceIdentity.files).length === 0) {
    throw new Error('sourceIdentity.files must be a non-empty object');
  }

  for (const reqFile of REQUIRED_PINNED_FILES) {
    if (!sourceIdentity.files[reqFile]) {
      throw new Error(`sourceIdentity missing required pinned file: ${reqFile}`);
    }
  }

  async function verifySourceIntegrity() {
    const pkgJsonBytes = await readFile(join(packageRoot, 'package.json'), 'utf8');
    let pkg;
    try {
      pkg = JSON.parse(pkgJsonBytes);
    } catch (err) {
      throw new Error('failed to parse opencli package.json', { cause: err });
    }
    if (pkg.name !== '@jackwener/opencli' || pkg.version !== '1.8.7') {
      throw new Error('package.json metadata does not match pinned identity');
    }

    for (const [relPath, expectedHash] of Object.entries(sourceIdentity.files)) {
      if (isAbsolute(relPath) || relPath.split(/[/\\]/).includes('..')) {
        throw new Error(`path traversal detected in pinned file path: ${relPath}`);
      }
      const fullPath = join(packageRoot, relPath);
      const fileStat = await lstat(fullPath);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        throw new Error(`pinned path must be an owned regular file and not a symlink: ${relPath}`);
      }
      if (typeof process.getuid === 'function' && fileStat.uid !== process.getuid()) {
        throw new Error(`pinned file is not owned by the current user: ${relPath}`);
      }
      const bytes = await readFile(fullPath);
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      if (actualHash !== expectedHash) {
        throw new Error(`source digest mismatch for ${relPath}: expected ${expectedHash}, got ${actualHash}`);
      }
    }
  }

  await verifySourceIntegrity();

  let req = requestImpl;
  if (!req) {
    const transportMod = await import(pathToFileURL(join(packageRoot, 'dist/src/browser/daemon-transport.js')).href);
    req = transportMod.requestDaemon;
  }

  let statusRes;
  try {
    statusRes = await req(`/status?contextId=${encodeURIComponent(contextId)}`, { timeout: 3000 });
  } catch (err) {
    throw new Error('daemon status check failed or timed out', { cause: err });
  }
  if (!statusRes || !statusRes.ok) {
    throw new Error('daemon status check failed');
  }
  let statusJson;
  try {
    statusJson = await readResponseJson(statusRes, { maxBytes: 64 * 1024, deadlineAt: Date.now() + 3000 });
  } catch (err) {
    throw new Error('failed to parse daemon status response', { cause: err });
  }
  if (
    !statusJson?.ok ||
    statusJson.contextId !== contextId ||
    statusJson.daemonVersion !== '1.8.7' ||
    !statusJson.extensionConnected ||
    statusJson.extensionVersion !== '1.0.23'
  ) {
    throw new Error('daemon status verification failed: context or version mismatch');
  }

  return {
    contextId,
    async command({ id, action, page, session, code, op, url, ...rest } = {}) {
      if (!id || typeof id !== 'string') {
        throw new Error('command id is required');
      }
      if (!['exec', 'tabs', 'cdp'].includes(action)) {
        throw new Error(`action must be exec, tabs, or cdp: received ${action}`);
      }
      if (rest.contextId !== undefined && rest.contextId !== contextId) {
        throw new Error('cannot override immutable contextId');
      }
      if (rest.windowMode !== undefined && rest.windowMode !== 'background') {
        throw new Error('cannot override immutable windowMode');
      }
      if (rest.surface !== undefined && rest.surface !== 'adapter') {
        throw new Error('cannot override immutable surface');
      }
      if (rest.siteSession !== undefined && rest.siteSession !== 'ephemeral') {
        throw new Error('cannot override immutable siteSession');
      }
      const recognized = new Set(['contextId', 'windowMode', 'surface', 'siteSession']);
      if (Object.keys(rest).some((key) => !recognized.has(key))) throw new Error('unsupported command option');
      if (action === 'exec' && (
        typeof page !== 'string' || page.length === 0 ||
        typeof session !== 'string' || session.length === 0 ||
        typeof code !== 'string' || code.length === 0 ||
        op !== undefined || url !== undefined
      )) throw new Error('exec requires page, session and code only');
      if (action === 'tabs' && (
        !['list', 'new'].includes(op) ||
        typeof session !== 'string' || session.length === 0 ||
        page !== undefined || code !== undefined ||
        (op === 'list' && url !== undefined) ||
        (op === 'new' && url !== 'https://chatgpt.com/')
      )) throw new Error('tabs requires list or an exact owned ChatGPT new-tab command');

      await verifySourceIntegrity();

      const deadlineAt = Date.now() + COMMAND_TIMEOUT_MS;
      const payload = {
        id,
        action,
        page: page ?? null,
        session: session ?? null,
        code: code ?? undefined,
        contextId,
        surface: 'adapter',
        siteSession: 'ephemeral',
        windowMode: 'background',
        timeout: Math.ceil(COMMAND_TIMEOUT_MS / 1000),
        deadlineAt,
        ...(action === 'tabs' ? { op, ...(url !== undefined ? { url } : {}) } : {})
      };

      let res;
      try {
        res = await req('/command', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          timeout: COMMAND_TIMEOUT_MS
        });
      } catch (networkErr) {
        networkErr.executorUnresolved = true;
        networkErr.commandId = id;
        throw networkErr;
      }

      if (res.redirected || (res.status >= 300 && res.status < 400)) {
        const err = new Error('daemon command resulted in an unsupported redirect');
        err.executorUnresolved = true;
        err.commandId = id;
        throw err;
      }

      let bodyText = '';
      try {
        bodyText = await readResponseText(res, { maxBytes: 1024 * 1024, deadlineAt });
      } catch (readErr) {
        readErr.executorUnresolved = true;
        readErr.commandId = id;
        throw readErr;
      }

      let resJson;
      try {
        resJson = JSON.parse(bodyText);
      } catch (parseErr) {
        parseErr.executorUnresolved = true;
        parseErr.commandId = id;
        throw parseErr;
      }

      if (!resJson || typeof resJson !== 'object' || resJson.id !== id) {
        const err = new Error(`daemon command ID correlation mismatch: expected ${id}, got ${resJson?.id}`);
        err.executorUnresolved = true;
        err.commandId = id;
        throw err;
      }

      if (!res.ok || resJson.ok !== true) {
        const err = new Error(resJson.error || 'daemon command failed');
        err.commandId = id;
        if (resJson.errorCode === 'command_result_unknown' || !res.ok) {
          err.executorUnresolved = true;
        } else {
          err.executorUnresolved = false;
        }
        if (resJson.errorCode) {
          err.code = resJson.errorCode;
        }
        throw err;
      }

      return resJson;
    },
    async probeAuth() {
      const session = `research-auth-${createHash('sha256').update(contextId).digest('hex').slice(0, 16)}`;
      const listed = await this.command({ id: `auth-list-${randomUUID()}`, action: 'tabs', op: 'list', session });
      const tabs = Array.isArray(listed?.data) ? listed.data : [];
      let page = tabs.find((tab) => {
        try { return new URL(tab?.url).origin === 'https://chatgpt.com' && typeof tab?.page === 'string'; }
        catch { return false; }
      })?.page ?? null;
      if (!page) {
        const created = await this.command({
          id: `auth-new-${randomUUID()}`,
          action: 'tabs',
          op: 'new',
          url: 'https://chatgpt.com/',
          session
        });
        page = typeof created?.page === 'string' && created.page.length > 0 ? created.page : null;
      }
      if (!page) return { contextId, status: 'browser-not-loaded', signedIn: false };
      const inspected = await this.command({
        id: `auth-inspect-${randomUUID()}`,
        action: 'exec',
        page,
        session,
        code: `(() => {
          const visible = (element) => {
            if (!element) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          };
          const composer = document.querySelector('#prompt-textarea');
          const account = document.querySelector('[data-testid="accounts-profile-button"]');
          const login = [...document.querySelectorAll('a,button')].find((element) => /^(log in|sign in)$/i.test((element.innerText || element.textContent || '').trim()));
          const challenge = document.querySelector('iframe[src*="challenge"], [data-testid*="challenge"], #challenge-form');
          return {
            origin: location.origin,
            readyState: document.readyState,
            composerVisible: visible(composer),
            accountVisible: visible(account),
            loginVisible: visible(login),
            challengeVisible: visible(challenge)
          };
        })()`
      });
      const evidence = inspected?.data;
      if (!evidence || evidence.origin !== 'https://chatgpt.com') {
        return { contextId, status: 'browser-not-loaded', signedIn: false };
      }
      if (evidence.challengeVisible === true) return { contextId, status: 'challenge', signedIn: false };
      if (evidence.loginVisible === true) return { contextId, status: 'signed-out', signedIn: false };
      if (
        evidence.readyState === 'complete' &&
        evidence.composerVisible === true &&
        evidence.accountVisible === true &&
        evidence.loginVisible === false &&
        evidence.challengeVisible === false
      ) return { contextId, status: 'signed-in', signedIn: true };
      return { contextId, status: 'unknown', signedIn: false };
    }
  };
}
