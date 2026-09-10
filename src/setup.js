import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { canonicalJson } from './canonical-json.js';

const fail = (message, code = 'ERR_SETUP') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

function ownedByCurrentUser(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

function normalizedInventoryPath(relPath) {
  return typeof relPath === 'string' && relPath.length > 0 && !isAbsolute(relPath) &&
    !relPath.includes('\\') && relPath.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function exactStringSet(left, right) {
  return Array.isArray(left) && [...left].sort().join('\n') === [...right].sort().join('\n');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

async function requireSafeExistingDirectory(path, label) {
  const stat = await lstat(path).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory() || !ownedByCurrentUser(stat))) {
    fail(`${label} must be an owned regular directory`, 'ERR_SETUP_UNKNOWN_DESTINATION');
  }
  return stat;
}

async function existingRegularFile(path, label) {
  const stat = await lstat(path).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (stat && (stat.isSymbolicLink() || !stat.isFile() || !ownedByCurrentUser(stat))) {
    fail(`${label} must be an owned regular file`, 'ERR_SETUP_UNKNOWN_DESTINATION');
  }
  return stat;
}

async function collectSourceInventory(sourceRoot) {
  const pkgPath = join(sourceRoot, 'package.json');
  let pkgText;
  try {
    pkgText = await readFile(pkgPath, 'utf8');
  } catch {
    fail('package.json unavailable in sourceRoot', 'ERR_SETUP_SOURCE_INVALID');
  }
  const pkg = JSON.parse(pkgText);
  const allowlist = new Set([...(pkg.files || []), 'LICENSE']);

  const inventory = {};

  async function walk(currentDir, relDir = '') {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const fullPath = join(currentDir, entry.name);

      const stat = await lstat(fullPath);
      if (stat.isSymbolicLink()) {
        const real = await realpath(fullPath).catch(() => null);
        if (!real || !real.startsWith(sourceRoot)) {
          fail(`source symlink escape detected: ${relPath}`, 'ERR_SETUP_SYMLINK_ESCAPE');
        }
      }

      if (stat.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (stat.isFile()) {
        const bytes = await readFile(fullPath);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        inventory[relPath] = {
          sha256,
          size: stat.size,
          mode: stat.mode
        };
      }
    }
  }

  for (const item of allowlist) {
    if (!normalizedInventoryPath(item.replace(/\/$/, ''))) {
      fail(`source inventory path is invalid: ${item}`, 'ERR_SETUP_SOURCE_INVALID');
    }
    const itemPath = join(sourceRoot, item);
    let stat;
    try {
      stat = await lstat(itemPath);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      const real = await realpath(itemPath).catch(() => null);
      if (!real || !real.startsWith(sourceRoot)) {
        fail(`source symlink escape detected: ${item}`, 'ERR_SETUP_SYMLINK_ESCAPE');
      }
    }
    if (stat.isDirectory()) {
      await walk(itemPath, item.replace(/\/$/, ''));
    } else if (stat.isFile()) {
      const bytes = await readFile(itemPath);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      inventory[item] = {
        sha256,
        size: stat.size,
        mode: stat.mode
      };
    }
  }

  return inventory;
}

function checkMissingPrerequisites(platform, topology, components = {}) {
  const missing = [];
  if (typeof components.node !== 'string' || components.node.length === 0) missing.push('node');
  if (typeof components.chrome !== 'string' || components.chrome.length === 0) missing.push('chrome');
  if (typeof components.openCliPackage !== 'string' || components.openCliPackage.length === 0) missing.push('opencli');
  if (typeof components.bridge !== 'string' || components.bridge.length === 0) missing.push('bridge');
  if (platform === 'linux') {
    if (!Number.isInteger(components.viewerPort) || components.viewerPort < 1 || components.viewerPort > 65535) missing.push('viewer-port');
    if (typeof components.xpra !== 'string' || components.xpra.length === 0) missing.push('xpra');
    if (typeof components.xvfb !== 'string' || components.xvfb.length === 0) missing.push('xvfb');
    if (typeof components.xpraHtml !== 'string' || components.xpraHtml.length === 0) missing.push('xpra-html');
    if (typeof components.display !== 'string' || components.display.length === 0) missing.push('display');
  }
  return missing;
}

export async function planSetup({
  prefix,
  sourceRoot,
  platform,
  topology,
  components = {},
  profilePath,
  runtimeConfigPath = null
} = {}) {
  if (typeof prefix !== 'string' || !isAbsolute(prefix)) {
    fail('prefix must be an absolute path', 'ERR_SETUP_PREFIX');
  }
  if (typeof sourceRoot !== 'string' || !isAbsolute(sourceRoot)) {
    fail('sourceRoot must be an absolute path', 'ERR_SETUP_SOURCE');
  }
  if (typeof profilePath !== 'string' || !isAbsolute(profilePath)) {
    fail('profilePath must be an absolute path', 'ERR_SETUP_PROFILE');
  }

  if (platform === 'darwin') {
    if (topology !== 'local') {
      fail(`unsupported topology for darwin: ${topology}`, 'ERR_SETUP_UNSUPPORTED_TOPOLOGY');
    }
  } else if (platform === 'linux') {
    if (!['local', 'ssh-linux'].includes(topology)) {
      fail(`unsupported topology for linux: ${topology}`, 'ERR_SETUP_UNSUPPORTED_TOPOLOGY');
    }
  } else {
    fail(`unsupported platform: ${platform}`, 'ERR_SETUP_UNSUPPORTED_PLATFORM');
  }

  let parsedComponents = components;
  if (typeof components === 'string') {
    try {
      parsedComponents = JSON.parse(await readFile(components, 'utf8'));
    } catch {
      parsedComponents = {};
    }
  }

  const source_inventory = await collectSourceInventory(sourceRoot);
  const missing_prerequisites = checkMissingPrerequisites(platform, topology, parsedComponents);
  const browser_host = {
    platform,
    topology,
    profilePath,
    display: platform === 'linux' ? (parsedComponents.display ?? null) : null,
    viewer: platform === 'linux' ? {
      host: '127.0.0.1',
      port: parsedComponents.viewerPort ?? null,
      secretPath: join(prefix, 'state', 'viewer-password.txt')
    } : null,
    socketPath: platform === 'linux' ? join(prefix, 'state', 'xpra-sockets') : null,
    components: {
      node: parsedComponents.node ?? null,
      chrome: parsedComponents.chrome ?? null,
      openCliPackage: parsedComponents.openCliPackage ?? null,
      bridge: parsedComponents.bridge ?? null,
      ...(platform === 'linux' ? {
        xpra: parsedComponents.xpra ?? null,
        xvfb: parsedComponents.xvfb ?? null,
        xpraHtml: parsedComponents.xpraHtml ?? null
      } : {})
    }
  };

  const owned_paths = [
    ...Object.keys(source_inventory).map((rel) => join(prefix, 'app', rel)),
    join(prefix, 'app', 'install-manifest.json'),
    join(prefix, 'bin', 'chatgpt-research')
  ];

  const planBody = {
    schema: 'research.setup-plan.v1',
    platform,
    topology,
    prefix,
    sourceRoot,
    profilePath,
    browser_host,
    source_inventory,
    owned_paths,
    missing_prerequisites,
    human_steps: [
      'Install missing prerequisites if any',
      'Install or verify the configured Bridge extension in the exact dedicated browser profile',
      'Log in to ChatGPT via auth show if required'
    ],
    steps: [
      'copy_package_files',
      'create_bin_wrapper',
      'write_manifest'
    ]
  };

  const plan_id = createHash('sha256').update(canonicalJson(planBody)).digest('hex');
  return {
    plan_id,
    ...planBody
  };
}

export async function applySetup({ plan } = {}) {
  if (!plan || plan.schema !== 'research.setup-plan.v1' || typeof plan.plan_id !== 'string') {
    fail('invalid setup plan', 'ERR_SETUP_PLAN_INVALID');
  }

  // Revalidate plan digest
  const { plan_id, ...planBody } = plan;
  const computedId = createHash('sha256').update(canonicalJson(planBody)).digest('hex');
  if (computedId !== plan_id) {
    fail('setup plan digest mismatch', 'ERR_SETUP_PLAN_DIGEST');
  }
  if (!plan.source_inventory || typeof plan.source_inventory !== 'object' || Object.keys(plan.source_inventory).some((relPath) => !normalizedInventoryPath(relPath))) {
    fail('setup source inventory contains invalid paths', 'ERR_SETUP_PLAN_INVALID');
  }
  const expectedOwnedPaths = [
    ...Object.keys(plan.source_inventory).map((relPath) => join(plan.prefix, 'app', relPath)),
    join(plan.prefix, 'app', 'install-manifest.json'),
    join(plan.prefix, 'bin', 'chatgpt-research')
  ];
  if (!exactStringSet(plan.owned_paths, expectedOwnedPaths)) {
    fail('setup owned path inventory is inconsistent', 'ERR_SETUP_PLAN_INVALID');
  }

  // Revalidate source bytes
  for (const [relPath, meta] of Object.entries(plan.source_inventory)) {
    const sourcePath = join(plan.sourceRoot, relPath);
    let bytes;
    try {
      bytes = await readFile(sourcePath);
    } catch {
      fail(`source file missing: ${relPath}`, 'ERR_SETUP_SOURCE_STALE');
    }
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== meta.sha256) {
      fail(`source file changed since plan: ${relPath}`, 'ERR_SETUP_SOURCE_STALE');
    }
  }

  // Revalidate destination and refuse unknown bytes
  const appDir = join(plan.prefix, 'app');
  const binDir = join(plan.prefix, 'bin');
  await requireSafeExistingDirectory(plan.prefix, 'setup prefix');
  const appDirExists = Boolean(await requireSafeExistingDirectory(appDir, 'application destination'));
  await requireSafeExistingDirectory(binDir, 'binary destination');

  const wrapperPath = join(binDir, 'chatgpt-research');
  const targetScript = join(appDir, 'bin', 'chatgpt-research.js');
  const selectedNode = plan.browser_host?.components?.node;
  const wrapperScript = typeof selectedNode === 'string' && selectedNode.length > 0
    ? `#!/bin/sh\nexec ${shellQuote(selectedNode)} ${shellQuote(targetScript)} "$@"\n`
    : `#!/bin/sh\nexec /usr/bin/env node ${shellQuote(targetScript)} "$@"\n`;
  const wrapperBytes = Buffer.from(wrapperScript, 'utf8');
  const wrapperSha256 = createHash('sha256').update(wrapperBytes).digest('hex');
  if (await existingRegularFile(wrapperPath, 'CLI wrapper')) {
    const existingWrapper = await readFile(wrapperPath);
    if (createHash('sha256').update(existingWrapper).digest('hex') !== wrapperSha256) {
      fail('refusing to overwrite unknown CLI wrapper bytes', 'ERR_SETUP_UNKNOWN_DESTINATION');
    }
  }

  if (appDirExists) {
    async function scanDest(dir, relPrefix = '') {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const entryRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDest(fullPath, entryRel);
        } else if (entry.isFile()) {
          if (entryRel === 'install-manifest.json') continue;
          if (!Object.hasOwn(plan.source_inventory, entryRel)) {
            fail(`unknown file in destination: ${entryRel}`, 'ERR_SETUP_UNKNOWN_DESTINATION');
          }
          const existingBytes = await readFile(fullPath);
          const existingSha = createHash('sha256').update(existingBytes).digest('hex');
          if (existingSha !== plan.source_inventory[entryRel].sha256) {
            fail(`refusing to overwrite unknown destination bytes in: ${entryRel}`, 'ERR_SETUP_UNKNOWN_DESTINATION');
          }
        } else {
          fail(`unsupported destination entry: ${entryRel}`, 'ERR_SETUP_UNKNOWN_DESTINATION');
        }
      }
    }
    await scanDest(appDir);
  }

  // Copy files
  for (const [relPath, meta] of Object.entries(plan.source_inventory)) {
    const sourcePath = join(plan.sourceRoot, relPath);
    const destPath = join(appDir, relPath);

    let alreadyMatches = false;
    try {
      const existing = await readFile(destPath);
      if (createHash('sha256').update(existing).digest('hex') === meta.sha256) {
        alreadyMatches = true;
      }
    } catch {}

    if (!alreadyMatches) {
      const bytes = await readFile(sourcePath);
      await mkdir(dirname(destPath), { recursive: true });
      const tmpPath = `${destPath}.tmp.${randomUUID()}`;
      await writeFile(tmpPath, bytes, { mode: meta.mode });
      await rename(tmpPath, destPath);
    }
  }

  // Bin wrapper
  await mkdir(binDir, { recursive: true });
  await writeFile(wrapperPath, wrapperScript, { mode: 0o755 });

  // Manifest
  const manifestPath = join(appDir, 'install-manifest.json');
  const manifest = {
    schema: 'research.install-manifest.v1',
    plan_id: plan.plan_id,
    installed_at: Date.now(),
    files: plan.source_inventory,
    wrapper: {
      sha256: wrapperSha256,
      size: wrapperBytes.length,
      mode: 0o755
    }
  };
  await writeFile(manifestPath, canonicalJson(manifest) + '\n', { mode: 0o600 });

  let status = 'installed';
  if (plan.missing_prerequisites && plan.missing_prerequisites.length > 0) {
    status = 'pending-prerequisite';
  }

  return {
    status,
    plan_id: plan.plan_id,
    prefix: plan.prefix
  };
}

export async function planUninstall({ prefix } = {}) {
  if (typeof prefix !== 'string' || !isAbsolute(prefix)) {
    fail('prefix must be an absolute path', 'ERR_SETUP_PREFIX');
  }

  const appDir = join(prefix, 'app');
  const appStat = await lstat(appDir).catch(() => null);
  if (!appStat || appStat.isSymbolicLink() || !appStat.isDirectory() || !ownedByCurrentUser(appStat)) {
    fail('installed application directory is untrusted', 'ERR_UNINSTALL_DRIFT');
  }
  const appIdentity = { dev: appStat.dev, ino: appStat.ino };
  const manifestPath = join(appDir, 'install-manifest.json');
  let manifestText;
  try {
    manifestText = await readFile(manifestPath, 'utf8');
  } catch {
    fail('install manifest not found', 'ERR_UNINSTALL_NO_MANIFEST');
  }
  const manifest = JSON.parse(manifestText);
  if (
    manifest?.schema !== 'research.install-manifest.v1' ||
    !manifest.files || typeof manifest.files !== 'object' ||
    typeof manifest.wrapper?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.wrapper.sha256)
  ) {
    fail('install manifest is invalid', 'ERR_UNINSTALL_NO_MANIFEST');
  }

  const drifted = [];
  const wrapperPath = join(prefix, 'bin', 'chatgpt-research');
  try {
    const stat = await lstat(wrapperPath);
    if (stat.isSymbolicLink() || !stat.isFile() || !ownedByCurrentUser(stat)) {
      drifted.push({ file: 'bin/chatgpt-research', reason: 'unsupported_file' });
    } else {
      const wrapperSha = createHash('sha256').update(await readFile(wrapperPath)).digest('hex');
      if (wrapperSha !== manifest.wrapper.sha256) drifted.push({ file: 'bin/chatgpt-research', reason: 'content_modified' });
    }
  } catch {
    drifted.push({ file: 'bin/chatgpt-research', reason: 'file_missing' });
  }
  if (Object.keys(manifest.files).some((relPath) => !normalizedInventoryPath(relPath))) {
    fail('install manifest contains an invalid path', 'ERR_UNINSTALL_DRIFT');
  }

  for (const [relPath, meta] of Object.entries(manifest.files || {})) {
    const filePath = join(appDir, relPath);
    try {
      const bytes = await readFile(filePath);
      const sha = createHash('sha256').update(bytes).digest('hex');
      if (sha !== meta.sha256) {
        drifted.push({ file: relPath, reason: 'content_modified' });
      }
    } catch {
      drifted.push({ file: relPath, reason: 'file_missing' });
    }
  }

  async function scanUnknown(dir, relPrefix = '') {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const entryRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const entryFull = join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanUnknown(entryFull, entryRel);
        } else if (entry.isFile()) {
          if (entryRel !== 'install-manifest.json' && !Object.hasOwn(manifest.files, entryRel)) {
            drifted.push({ file: entryRel, reason: 'unknown_file' });
          }
        }
      }
    } catch {}
  }
  await scanUnknown(appDir);

  const body = {
    schema: 'research.uninstall-plan.v1',
    prefix,
    plan_id: manifest.plan_id,
    files: Object.keys(manifest.files || {}),
    wrapper: manifest.wrapper,
    app_identity: appIdentity,
    drifted
  };
  return { ...body, uninstall_plan_digest: createHash('sha256').update(canonicalJson(body)).digest('hex') };
}

export async function applyUninstall({ plan } = {}) {
  if (!plan || plan.schema !== 'research.uninstall-plan.v1' || !isAbsolute(plan.prefix ?? '')) {
    fail('invalid uninstall plan', 'ERR_UNINSTALL_PLAN_INVALID');
  }
  const body = {
    schema: plan.schema,
    prefix: plan.prefix,
    plan_id: plan.plan_id,
    files: plan.files,
    wrapper: plan.wrapper,
    app_identity: plan.app_identity,
    drifted: plan.drifted
  };
  const digest = createHash('sha256').update(canonicalJson(body)).digest('hex');
  if (
    plan.uninstall_plan_digest !== digest ||
    !Array.isArray(plan.files) || plan.files.some((relPath) => !normalizedInventoryPath(relPath)) ||
    !Number.isInteger(plan.app_identity?.dev) || !Number.isInteger(plan.app_identity?.ino)
  ) {
    fail('uninstall plan digest or paths are invalid', 'ERR_UNINSTALL_PLAN_INVALID');
  }

  if (plan.drifted && plan.drifted.length > 0) {
    fail('uninstall refused: files have drifted or user edits detected', 'ERR_UNINSTALL_DRIFT');
  }

  const appDir = join(plan.prefix, 'app');
  const appStat = await lstat(appDir).catch(() => null);
  if (
    !appStat || appStat.isSymbolicLink() || !appStat.isDirectory() || !ownedByCurrentUser(appStat) ||
    appStat.dev !== plan.app_identity.dev || appStat.ino !== plan.app_identity.ino
  ) fail('uninstall application directory identity changed', 'ERR_UNINSTALL_DRIFT');
  const manifestPath = join(appDir, 'install-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestFiles = Object.keys(manifest.files || {});
  if (
    manifest.schema !== 'research.install-manifest.v1' ||
    manifest.plan_id !== plan.plan_id ||
    canonicalJson(manifest.wrapper) !== canonicalJson(plan.wrapper) ||
    manifestFiles.some((relPath) => !normalizedInventoryPath(relPath)) ||
    !exactStringSet(plan.files, manifestFiles)
  ) {
    fail('uninstall plan no longer matches installed inventory', 'ERR_UNINSTALL_PLAN_INVALID');
  }

  // Double check drift immediately before removal
  for (const [relPath, meta] of Object.entries(manifest.files || {})) {
    const destPath = join(appDir, relPath);
    const bytes = await readFile(destPath);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== meta.sha256) {
      fail(`uninstall refused: file ${relPath} has drifted`, 'ERR_UNINSTALL_DRIFT');
    }
  }

  const wrapperPath = join(plan.prefix, 'bin', 'chatgpt-research');
  const wrapperStat = await lstat(wrapperPath).catch(() => null);
  if (!wrapperStat || wrapperStat.isSymbolicLink() || !wrapperStat.isFile() || !ownedByCurrentUser(wrapperStat)) {
    fail('uninstall refused: CLI wrapper has drifted', 'ERR_UNINSTALL_DRIFT');
  }
  const wrapperSha = createHash('sha256').update(await readFile(wrapperPath)).digest('hex');
  if (wrapperSha !== manifest.wrapper?.sha256) {
    fail('uninstall refused: CLI wrapper has drifted', 'ERR_UNINSTALL_DRIFT');
  }

  const finalAppStat = await lstat(appDir).catch(() => null);
  if (!finalAppStat || finalAppStat.isSymbolicLink() || finalAppStat.dev !== appStat.dev || finalAppStat.ino !== appStat.ino) {
    fail('uninstall application directory identity changed before removal', 'ERR_UNINSTALL_DRIFT');
  }

  // Remove owned files only
  for (const relPath of plan.files) {
    await unlink(join(appDir, relPath));
  }
  await unlink(manifestPath).catch(() => {});
  await unlink(wrapperPath);

  return {
    status: 'uninstalled',
    prefix: plan.prefix
  };
}
