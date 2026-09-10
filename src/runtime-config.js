import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { canonicalJson } from './canonical-json.js';
import { inspectStandardRuntime } from './standard-runtime.js';

const fail = (message, code = 'ERR_RUNTIME_CONFIG') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

function isPlainObject(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function ownedByCurrentUser(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

async function verifySourceIdentityFiles(packageRoot, files) {
  if (!isPlainObject(files)) {
    fail('sourceIdentity.files must be a map of relative paths to sha256 hashes', 'ERR_SOURCE_IDENTITY_INVALID');
  }
  for (const [relPath, expectedHash] of Object.entries(files)) {
    if (typeof relPath !== 'string' || relPath.length === 0 || isAbsolute(relPath) || relPath.includes('..')) {
      fail(`invalid relative path in source identity: ${relPath}`, 'ERR_SOURCE_IDENTITY_INVALID');
    }
    const fullPath = join(packageRoot, relPath);
    let stat;
    try {
      stat = await lstat(fullPath);
    } catch {
      fail(`source identity file unavailable: ${relPath}`, 'ERR_SOURCE_IDENTITY_VERIFICATION');
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      fail(`source identity file must be a regular non-symlink file: ${relPath}`, 'ERR_SOURCE_IDENTITY_VERIFICATION');
    }
    const bytes = await readFile(fullPath);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== expectedHash) {
      fail(`source identity file hash mismatch for ${relPath}: expected ${expectedHash}, got ${hash}`, 'ERR_SOURCE_IDENTITY_VERIFICATION');
    }
  }
}

export async function configureRuntime({
  configPath,
  runtime,
  contentRoot,
  packageRoot,
  sourceIdentity,
  contextId,
  hostId,
  registryRoot,
  browserHost = null,
  allowedPriorities = ['normal']
} = {}) {
  if (typeof configPath !== 'string' || !isAbsolute(configPath)) {
    fail('configPath must be an absolute path', 'ERR_RUNTIME_CONFIG_PATH');
  }
  if (!runtime || typeof runtime.root !== 'string' || !isAbsolute(runtime.root) || typeof runtime.epoch !== 'string' || runtime.epoch.length === 0) {
    fail('runtime descriptor with absolute root and epoch is required', 'ERR_RUNTIME_DESCRIPTOR');
  }
  if (typeof contentRoot !== 'string' || !isAbsolute(contentRoot)) {
    fail('contentRoot must be an absolute path', 'ERR_RUNTIME_CONTENT_ROOT');
  }
  if (typeof packageRoot !== 'string' || !isAbsolute(packageRoot)) {
    fail('packageRoot must be an absolute path', 'ERR_RUNTIME_PACKAGE_ROOT');
  }
  if (typeof contextId !== 'string' || contextId.trim().length === 0) {
    fail('contextId must be a non-empty string', 'ERR_RUNTIME_CONTEXT_ID');
  }
  if (typeof hostId !== 'string' || hostId.trim().length === 0) {
    fail('hostId must be a non-empty string', 'ERR_RUNTIME_HOST_ID');
  }
  if (typeof registryRoot !== 'string' || !isAbsolute(registryRoot)) {
    fail('registryRoot must be an absolute path', 'ERR_RUNTIME_REGISTRY_ROOT');
  }
  if (!isPlainObject(sourceIdentity) || !sourceIdentity.files) {
    fail('sourceIdentity with files map is required', 'ERR_SOURCE_IDENTITY_INVALID');
  }
  if (browserHost !== null && !isPlainObject(browserHost)) {
    fail('browserHost must be an explicit object or null', 'ERR_RUNTIME_BROWSER_HOST');
  }

  // Verify runtime root exists and snapshot epoch matches
  await inspectStandardRuntime({ runtime });

  // Verify source identity file hashes before any effects
  await verifySourceIdentityFiles(packageRoot, sourceIdentity.files);

  // Registry correspondence check
  await mkdir(registryRoot, { recursive: true });
  const registryFileName = `${encodeURIComponent(hostId)}_${encodeURIComponent(contextId)}.json`;
  const registryFilePath = join(registryRoot, registryFileName);

  let existingRegistry = null;
  try {
    const text = await readFile(registryFilePath, 'utf8');
    existingRegistry = JSON.parse(text);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }

  if (existingRegistry) {
    if (existingRegistry.runtime_root !== runtime.root || existingRegistry.epoch !== runtime.epoch) {
      fail(`registry conflict: host ${hostId} and context ${contextId} already registered to different runtime root ${existingRegistry.runtime_root}`, 'ERR_RUNTIME_REGISTRY_CONFLICT');
    }
  }

  // Check if configPath already exists
  let existingConfig = null;
  try {
    const text = await readFile(configPath, 'utf8');
    existingConfig = JSON.parse(text);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }

  if (existingConfig) {
    const matches =
      existingConfig.schema === 'research.runtime-config.v1' &&
      existingConfig.runtime?.root === runtime.root &&
      existingConfig.runtime?.epoch === runtime.epoch &&
      existingConfig.contentRoot === contentRoot &&
      existingConfig.browser?.packageRoot === packageRoot &&
      existingConfig.browser?.contextId === contextId &&
      existingConfig.hostId === hostId &&
      existingConfig.registryRoot === registryRoot &&
      canonicalJson(existingConfig.allowedPriorities) === canonicalJson(allowedPriorities) &&
      canonicalJson(existingConfig.browserHost ?? null) === canonicalJson(browserHost) &&
      canonicalJson(existingConfig.browser?.sourceIdentity) === canonicalJson(sourceIdentity);

    if (!matches) {
      fail('configuration conflict: existing config file has incompatible settings', 'ERR_RUNTIME_CONFIG_CONFLICT');
    }

    await mkdir(join(dirname(contentRoot), 'prepared'), { recursive: true }).catch(() => {});
    return { configPath, generation: existingConfig.generation };
  }

  // Write registry file if not present
  if (!existingRegistry) {
    const registryRecord = {
      schema: 'research.runtime-registry.v1',
      hostId,
      contextId,
      runtime_root: runtime.root,
      epoch: runtime.epoch,
      registered_at: Date.now()
    };
    const registryPayload = canonicalJson(registryRecord) + '\n';
    const tmpRegistry = `${registryFilePath}.tmp.${randomUUID()}`;
    await writeFilePrivate(tmpRegistry, registryPayload);
    let published = false;
    try {
      await link(tmpRegistry, registryFilePath);
      published = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let raced;
      try { raced = JSON.parse(await readFile(registryFilePath, 'utf8')); }
      catch { fail('runtime registry claim is unreadable', 'ERR_RUNTIME_REGISTRY_CONFLICT'); }
      if (
        raced?.schema !== 'research.runtime-registry.v1' ||
        raced.hostId !== hostId || raced.contextId !== contextId ||
        raced.runtime_root !== runtime.root || raced.epoch !== runtime.epoch
      ) fail('runtime registry claim was won by a different runtime', 'ERR_RUNTIME_REGISTRY_CONFLICT');
      existingRegistry = raced;
    } finally {
      await unlink(tmpRegistry).catch(() => {});
    }
    if (published) {
      const directory = await open(registryRoot, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try { await directory.sync(); } finally { await directory.close().catch(() => {}); }
    }
  }

  const generation = `gen_${randomUUID().replace(/-/g, '')}`;
  const config = {
    schema: 'research.runtime-config.v1',
    runtime: {
      root: runtime.root,
      epoch: runtime.epoch
    },
    contentRoot,
    browser: {
      packageRoot,
      contextId,
      sourceIdentity
    },
    hostId,
    registryRoot,
    browserHost: browserHost ? structuredClone(browserHost) : null,
    generation,
    allowedPriorities: Array.isArray(allowedPriorities) ? [...allowedPriorities] : ['normal']
  };

  await mkdir(dirname(configPath), { recursive: true });
  const tmpConfig = `${configPath}.tmp.${randomUUID()}`;
  const configPayload = canonicalJson(config) + '\n';
  await writeFilePrivate(tmpConfig, configPayload);
  await rename(tmpConfig, configPath);

  await mkdir(join(dirname(contentRoot), 'prepared'), { recursive: true }).catch(() => {});
  return { configPath, generation };
}

async function writeFilePrivate(targetPath, content) {
  const fd = await open(targetPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await fd.writeFile(content, 'utf8');
    await fd.sync();
  } finally {
    await fd.close().catch(() => {});
  }
}

export async function readRuntimeConfig(configPath) {
  if (typeof configPath !== 'string' || !isAbsolute(configPath)) {
    fail('configPath must be an absolute path', 'ERR_RUNTIME_CONFIG_PATH');
  }
  let stat;
  try {
    stat = await lstat(configPath);
  } catch {
    fail('runtime config file is unavailable', 'ERR_RUNTIME_CONFIG_UNAVAILABLE');
  }
  if (stat.isSymbolicLink() || !stat.isFile() || !ownedByCurrentUser(stat)) {
    fail('runtime config file must be a regular owned file', 'ERR_RUNTIME_CONFIG_UNTRUSTED');
  }
  if (stat.size > 1024 * 1024) {
    fail('runtime config file exceeds 1 MiB limit', 'ERR_RUNTIME_CONFIG_SIZE');
  }
  let config;
  try {
    const text = await readFile(configPath, 'utf8');
    config = JSON.parse(text);
  } catch {
    fail('runtime config file is malformed', 'ERR_RUNTIME_CONFIG_MALFORMED');
  }
  if (!isPlainObject(config) || config.schema !== 'research.runtime-config.v1') {
    fail('runtime config schema mismatch', 'ERR_RUNTIME_CONFIG_SCHEMA');
  }

  // Validate runtime epoch correspondence
  await inspectStandardRuntime({ runtime: config.runtime });

  // Validate registry correspondence
  const registryFileName = `${encodeURIComponent(config.hostId)}_${encodeURIComponent(config.browser.contextId)}.json`;
  const registryFilePath = join(config.registryRoot, registryFileName);
  let registryStat;
  try {
    registryStat = await lstat(registryFilePath);
  } catch {
    fail('runtime registry correspondence unavailable', 'ERR_RUNTIME_REGISTRY_UNAVAILABLE');
  }
  if (registryStat.isSymbolicLink() || !registryStat.isFile() || !ownedByCurrentUser(registryStat)) {
    fail('runtime registry file is untrusted', 'ERR_RUNTIME_REGISTRY_UNTRUSTED');
  }
  const registry = JSON.parse(await readFile(registryFilePath, 'utf8'));
  if (registry.runtime_root !== config.runtime.root || registry.epoch !== config.runtime.epoch) {
    fail('runtime registry does not correspond to runtime root', 'ERR_RUNTIME_REGISTRY_MISMATCH');
  }

  return config;
}
