import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { spawn } from 'node:child_process';
import { acquireHumanControl, humanControlActive, readManagedBackend, recordHumanBackend, releaseHumanControl } from './human-control.js';
import { requestServiceStop } from './runtime-service.js';
import { canonicalJson } from './canonical-json.js';

const fail = (message, code = 'ERR_BROWSER_HOST') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireExplicitHost(config, platform, topology) {
  const host = config?.browserHost;
  if (!host || host.platform !== platform || host.topology !== topology) {
    fail('explicit browser-host configuration is required', 'ERR_BROWSER_HOST_CONFIG');
  }
  if (
    !isAbsolute(host.profilePath ?? '') ||
    !host.components ||
    !isAbsolute(host.components.chrome ?? '') ||
    !isAbsolute(host.components.bridge ?? '')
  ) {
    fail('browser-host profile, Chrome, and Bridge identities are required', 'ERR_BROWSER_HOST_CONFIG');
  }
  if (platform === 'linux') {
    if (
      host.viewer?.host !== '127.0.0.1' ||
      !Number.isInteger(host.viewer.port) || host.viewer.port < 1 || host.viewer.port > 65535 ||
      !isAbsolute(host.viewer.secretPath ?? '') ||
      !isAbsolute(host.socketPath ?? '')
    ) fail('viewer must use an explicit authenticated private loopback endpoint', 'ERR_BROWSER_HOST_CONFIG');
  }
  return host;
}

export async function planBrowserHost({ config, platform, topology } = {}) {
  const effectivePlatform = platform ?? process.platform;
  const effectiveTopology = topology ?? 'local';
  if (effectivePlatform === 'darwin' && effectiveTopology !== 'local') {
    fail(`unsupported darwin topology: ${effectiveTopology}`, 'ERR_BROWSER_HOST_TOPOLOGY');
  }
  if (effectivePlatform === 'linux' && !['local', 'ssh-linux'].includes(effectiveTopology)) {
    fail(`unsupported linux topology: ${effectiveTopology}`, 'ERR_BROWSER_HOST_TOPOLOGY');
  }
  if (!['darwin', 'linux'].includes(effectivePlatform)) fail(`unsupported platform: ${effectivePlatform}`, 'ERR_BROWSER_HOST_PLATFORM');
  const host = requireExplicitHost(config, effectivePlatform, effectiveTopology);
  const chromeArgs = [
    host.components.chrome,
    `--user-data-dir=${host.profilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    'https://chatgpt.com/'
  ];
  const common = {
    schema: 'research.browser-host-plan.v1',
    platform: effectivePlatform,
    topology: effectiveTopology,
    profile_path: host.profilePath,
    auth_handoff: {
      kind: 'opencli-context',
      context_id: config.browser.contextId,
      profile_path: host.profilePath,
      bridge_path: host.components.bridge,
      bridge_installation: 'existing-profile-or-explicit-human-step'
    },
    components: structuredClone(host.components)
  };
  if (effectivePlatform === 'darwin') {
    return {
      ...common,
      display_mode: 'headed-background',
      argv: chromeArgs
    };
  }
  if (
    !isAbsolute(host.components.xpra ?? '') ||
    !isAbsolute(host.components.xvfb ?? '') ||
    !isAbsolute(host.components.xpraHtml ?? '') ||
    !nonEmpty(host.display)
  ) {
    fail('Linux host requires explicit Xpra, Xvfb, HTML client, and display identities', 'ERR_BROWSER_HOST_CONFIG');
  }
  return {
    ...common,
    display_mode: 'xpra-software-display',
    display: host.display,
    viewer: {
      bind_host: host.viewer.host,
      port: host.viewer.port,
      secret_path: host.viewer.secretPath,
      authentication: 'xpra-file-password',
      url: `http://${host.viewer.host}:${host.viewer.port}/`
    },
    argv: [
      host.components.xpra,
      'start',
      host.display,
      '--daemon=no',
      `--socket-dir=${host.socketPath}`,
      `--socket-dirs=${host.socketPath}`,
      `--bind-tcp=${host.viewer.host}:${host.viewer.port}`,
      `--tcp-auth=file:filename=${host.viewer.secretPath}`,
      `--html=${host.components.xpraHtml}`,
      `--xvfb=${host.components.xvfb} +extension Composite -screen 0 1280x900x24 -nolisten tcp -noreset`,
      '--exit-with-children=yes',
      '--exit-with-client=no',
      '--start-new-commands=no',
      '--pulseaudio=no',
      '--speaker=off',
      '--microphone=off',
      '--webcam=no',
      '--clipboard=no',
      '--printing=no',
      '--file-transfer=no',
      '--notifications=no',
      '--mdns=no',
      '--dbus-launch=',
      '--dbus-proxy=no',
      '--dbus-control=no',
      `--start-child=${chromeArgs.map((part) => part.includes(' ') ? JSON.stringify(part) : part).join(' ')}`
    ]
  };
}

async function requireLaunchComponent(path, kind) {
  const stat = await lstat(path).catch(() => null);
  const valid = kind === 'directory' ? stat?.isDirectory() : stat?.isFile();
  if (!stat || stat.isSymbolicLink() || !valid) fail(`configured ${kind} component is unavailable`, 'ERR_BROWSER_HOST_COMPONENT');
}

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0) {
    fail('browser-host private directory is unavailable', 'ERR_BROWSER_HOST_STATE');
  }
}

async function ensureViewerPassword(path) {
  await ensurePrivateDirectory(dirname(path));
  let stat = await lstat(path).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!stat) {
    const fd = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await fd.writeFile(`${randomBytes(32).toString('base64url')}\n`, 'utf8');
      await fd.sync();
    } finally {
      await fd.close();
    }
    stat = await lstat(path);
    const dir = await open(dirname(path), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try { await dir.sync(); } finally { await dir.close(); }
  }
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size < 16 || stat.size > 256) {
    fail('viewer password file is unavailable or untrusted', 'ERR_BROWSER_HOST_STATE');
  }
}

export async function startBrowserHost({ config, spawnImpl = spawn } = {}) {
  const plan = await planBrowserHost({ config, platform: config?.browserHost?.platform, topology: config?.browserHost?.topology });
  await ensurePrivateDirectory(plan.profile_path);
  await requireLaunchComponent(config.browserHost.components.chrome, 'file');
  await requireLaunchComponent(config.browserHost.components.bridge, 'directory');
  if (plan.platform === 'linux') {
    await ensurePrivateDirectory(config.browserHost.socketPath);
    await ensureViewerPassword(plan.viewer.secret_path);
    await requireLaunchComponent(config.browserHost.components.xpra, 'file');
    await requireLaunchComponent(config.browserHost.components.xvfb, 'file');
    await requireLaunchComponent(config.browserHost.components.xpraHtml, 'directory');
  }
  let child;
  try {
    child = spawnImpl(plan.argv[0], plan.argv.slice(1), { detached: true, stdio: 'ignore', shell: false });
  } catch (error) {
    fail(`browser host could not be launched: ${error?.message ?? 'spawn failure'}`, 'ERR_BROWSER_HOST_START');
  }
  if (!Number.isInteger(child?.pid) || child.pid < 1) fail('browser host did not report a process identity', 'ERR_BROWSER_HOST_START');
  child.unref?.();
  return { status: 'starting', pid: child.pid, browser_host: plan };
}

async function waitForOwnershipRetirement(path, clock, message) {
  const now = typeof clock?.now === 'function' ? () => clock.now() : () => Date.now();
  const sleep = typeof clock?.sleep === 'function' ? (ms) => clock.sleep(ms) : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = now() + 5000;
  while (await lstat(path).then(() => true, (error) => error?.code === 'ENOENT' ? false : Promise.reject(error))) {
    if (now() >= deadline) fail(message, 'ERR_AUTH_SERVICE_BUSY');
    await sleep(25);
  }
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

function hostIdentity(plan) {
  return createHash('sha256').update(canonicalJson(plan)).digest('hex');
}

export async function authShow({ config, spawnImpl, clock } = {}) {
  const control = await acquireHumanControl(config.runtime, typeof clock?.now === 'function' ? clock.now() : Date.now());
  let started;
  try {
    await requestServiceStop(config.runtime.root);
    await waitForOwnershipRetirement(join(config.runtime.root, 'service.lock'), clock, 'runtime service has not released browser control');
    await waitForOwnershipRetirement(join(config.runtime.root, 'effect.lock'), clock, 'runtime effect owner has not released browser control');
    const plan = await planBrowserHost({ config, platform: config?.browserHost?.platform, topology: config?.browserHost?.topology });
    const managedBackend = await readManagedBackend(config.runtime);
    if (managedBackend) {
      if (
        managedBackend.profile_path !== plan.profile_path ||
        managedBackend.host_identity_sha256 !== hostIdentity(plan) ||
        !processAlive(managedBackend.pid)
      ) fail('owned browser backend identity is unavailable', 'ERR_BROWSER_HOST_OWNER');
      started = { status: 'reused', pid: managedBackend.pid, browser_host: plan };
    } else {
      if (control.existing) fail('owned browser backend identity is unavailable', 'ERR_BROWSER_HOST_OWNER');
      started = await startBrowserHost({ config, spawnImpl });
      await recordHumanBackend(config.runtime, control.nonce, {
        pid: started.pid,
        started_at: Date.now(),
        profile_path: started.browser_host.profile_path,
        host_identity_sha256: hostIdentity(started.browser_host)
      });
    }
  } catch (error) {
    if (!control.existing && !started) {
      await releaseHumanControl(config.runtime).catch(() => {});
    }
    throw error;
  }
  const access = started.browser_host.viewer
    ? ` Open ${started.browser_host.viewer.url} and use the private password file ${started.browser_host.viewer.secret_path}.`
    : '';
  return {
    status: control.existing ? 'auth_in_progress' : 'auth_required',
    browser_host: started.browser_host,
    backend: { status: started.status, pid: started.pid },
    message: `Authenticate in the launched exact browser profile, then run auth check for this runtime.${access}`
  };
}

export async function authCheck({ config, transport } = {}) {
  if (!config) fail('valid runtime config is required', 'ERR_AUTH_CONFIG');
  if (!await humanControlActive(config.runtime)) {
    return { status: 'unknown', message: 'Run auth show to acquire exclusive human browser control before checking authentication' };
  }
  if (!transport || typeof transport.probeAuth !== 'function') {
    return { status: 'connection-unavailable', message: 'Qualified same-profile browser authentication probe is unavailable' };
  }
  try {
    const probe = await transport.probeAuth();
    if (probe?.signedIn === true && probe.contextId === config.browser.contextId) {
      await releaseHumanControl(config.runtime);
      return { status: 'signed-in', message: 'Browser access restored' };
    }
    if (probe?.contextId !== config.browser.contextId) {
      return { status: 'unknown', message: 'Browser context identity could not be confirmed' };
    }
    const status = ['browser-not-loaded', 'signed-out', 'challenge', 'unknown'].includes(probe?.status)
      ? probe.status
      : 'unknown';
    const messages = {
      'browser-not-loaded': 'ChatGPT is not loaded in the configured browser context',
      'signed-out': 'User authentication required',
      challenge: 'Browser authentication challenge requires human attention',
      unknown: 'Browser authentication state is unknown'
    };
    return { status, message: messages[status] };
  } catch {
    return { status: 'connection-unavailable', message: 'Browser connection unavailable' };
  }
}
