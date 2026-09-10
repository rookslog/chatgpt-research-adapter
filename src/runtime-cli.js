import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from './canonical-json.js';
import { activateObserver, renewObserver } from './caller-binding.js';
import { compileResearchRequest, prepareResearchJob } from './prepare.js';
import { configureRuntime, readRuntimeConfig } from './runtime-config.js';
import { readOperationEvents, watchOperation } from './runtime-events.js';
import { requestServiceStop, runService, waitForServiceReady } from './runtime-service.js';
import { runSetupCli } from './setup-cli.js';
import { authCheck, authShow } from './browser-host.js';
import { createOpenCliCommandTransport } from './opencli-browser-command.js';
import { createStandardBrowserDriver } from './standard-browser.js';
import { humanControlActive } from './human-control.js';
import {
  admitStandardJob,
  continueStandardJob,
  exportStandardResult,
  getStandardResult,
  initializeStandardRuntime,
  inspectStandardRuntime
} from './standard-runtime.js';
import { submitPreparedJobOnce } from './submit-once.js';

const fail = (message, code = 'ERR_CLI_USAGE') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const FAMILY_HELP = Object.freeze({
  runtime: `research-adapter runtime commands

  runtime init --root <absolute-directory> [--capacity <1-4>] [--json]
  runtime configure --runtime <config.json> --root <runtime-directory> --epoch <epoch> --content-root <directory> --opencli-package <directory> --source-identity <identity.json> --context-id <id> --host-id <id> --registry-root <directory> [--browser-host <host.json>] [--json]
  runtime inspect --runtime <config.json> [--operation <operation-ref>] [--json]
  runtime run --runtime <config.json> [--once] [--json]
  runtime start --runtime <config.json> [--json]  # validates the configured transport and daemon before spawning
  runtime stop --runtime <config.json> [--json]
  runtime watch --runtime <config.json> --operation <operation-ref> --observer <observer-id> [--after <cursor>] [--timeout-ms <milliseconds>] [--json]
  runtime activate --runtime <config.json> --operation <operation-ref> --observer <observer-id> --generation <generation> --ttl-ms <milliseconds> [--replace-expired] [--json]
  runtime renew --runtime <config.json> --operation <operation-ref> --observer <observer-id> --generation <generation> --ttl-ms <milliseconds> [--json]

JSON results:
  init: {schema,runtime_root,runtime_epoch,capacity}
  configure: {configPath,generation}
  inspect: {runtime_epoch,revision,capacity,occupied,operations,events,unresolved_executor}
  run --once: {status,dispatch:{status,operation_ref,reason,snapshot}}
  start/stop: {status,pid?}
  watch: one research.event.v1 JSON object per line: {schema,event_id,cursor,operation_ref,job_ref,type,result_ref?,payload?}
  activate/renew: {schema,operation_ref,observer_id,generation,epoch,activated_at,expires_at,ttl_ms}
`,
  research: `research-adapter research commands

  research submit --runtime <config.json> --request <request.json> --output-root <directory> --key <idempotency-key> [--priority <high|normal|background>] [--json]
  research continue --runtime <config.json> --job <job-ref> --base-result <result-ref> --key <idempotency-key> --prompt-file <file> [--json]
  research result --runtime <config.json> --result <result-ref> [--json]
  research export --runtime <config.json> --result <result-ref> --destination <absolute-new-file> [--json]

JSON results:
  submit: {admission,runtime_epoch,job_ref,operation_ref,revision,phase,submission_effect,attention}
  continue: {admission,job_ref,operation_ref,revision,phase,submission_effect,base_result_ref}
  result: {result_ref,operation_ref,job_ref,text,citations,content_sha256,media_type,evidence_ref,conversation_id,user_message_id,assistant_message_id}
  export: {result_ref,destination,bytes_written}
`,
  auth: `research-adapter auth commands

  auth show --runtime <config.json> [--json]
  auth check --runtime <config.json> [--json]

JSON results:
  show: {status,browser_host:{schema,platform,topology,profile_path,viewer?,auth_handoff,components,display_mode,argv},backend:{status,pid},message}
  check: {status,message}
`
});

function writeFamilyHelp(family, stdout) {
  stdout.write(FAMILY_HELP[family]);
  return { status: 'help', family };
}

function requestMatchesStoredIntent(compiledRequest, intent, outputRoot) {
  const compiled = compiledRequest.compiled;
  const expected = {
    output_root: outputRoot,
    mode: compiled.mode,
    mode_reason: compiled.mode_reason,
    model_family: compiledRequest.intent?.model_family ?? null,
    effort: compiledRequest.intent?.effort ?? null,
    prompt_sha256: compiled.prompt_sha256,
    prompt: compiled.prompt,
    template_id: compiled.template_id,
    template_version: compiled.template_version,
    template_sha256: compiled.template_sha256,
    template_body_sha256: compiled.template_body_sha256,
    rigor_protocol_id: compiled.rigor_protocol_id,
    rigor_protocol_version: compiled.rigor_protocol_version,
    rigor_profile_id: compiled.rigor_profile_id,
    rigor_profile_version: compiled.rigor_profile_version,
    rigor_profile_sha256: compiled.rigor_profile_sha256,
    citation_level: compiled.citation_level,
    audit_appendix: compiled.audit_appendix
  };
  return Object.entries(expected).every(([key, value]) => (intent?.[key] ?? null) === value);
}

async function configuredBrowser(config) {
  const transport = await createOpenCliCommandTransport({
    packageRoot: config.browser.packageRoot,
    contextId: config.browser.contextId,
    sourceIdentity: config.browser.sourceIdentity
  });
  return {
    transport,
    driver: createStandardBrowserDriver({ runtime: config.runtime, transport })
  };
}

function parseStrictFlags(argv, allowedValued, allowedBoolean = ['--json']) {
  const options = {};
  const seen = new Set();
  let index = 0;
  while (index < argv.length) {
    const flag = argv[index];
    if (seen.has(flag)) {
      fail(`duplicate option: ${flag}`, 'ERR_CLI_USAGE');
    }
    seen.add(flag);

    if (allowedBoolean.includes(flag)) {
      options[flag.replace(/^--/, '')] = true;
      index += 1;
      continue;
    }

    if (allowedValued.includes(flag)) {
      const val = argv[index + 1];
      if (typeof val !== 'string' || val.startsWith('--')) {
        fail(`missing value for option: ${flag}`, 'ERR_CLI_USAGE');
      }
      options[flag.replace(/^--/, '')] = val;
      index += 2;
      continue;
    }

    fail(`unknown option: ${flag}`, 'ERR_CLI_USAGE');
  }
  return options;
}

export async function runRuntimeCli(argv, {
  stdout = process.stdout,
  stderr = process.stderr,
  templatesRoot = fileURLToPath(new URL('../templates/', import.meta.url)),
  services = {}
} = {}) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return null;
  }

  const family = argv[0];

  if (family === 'setup') {
    return await runSetupCli(argv, { stdout });
  }

  if (family !== 'runtime' && family !== 'research' && family !== 'auth') {
    return null;
  }

  if (
    argv.length === 1 ||
    argv[1] === '--help' ||
    argv[1] === 'help' ||
    (argv.length === 3 && argv[2] === '--help')
  ) {
    return writeFamilyHelp(family, stdout);
  }

  const subcommand = argv[1];
  const tail = argv.slice(2);

  if (family === 'runtime') {
    if (subcommand === 'init') {
      const opts = parseStrictFlags(tail, ['--root', '--capacity'], ['--json']);
      if (!opts.root) {
        fail('missing required --root argument', 'ERR_CLI_USAGE');
      }
      if (!isAbsolute(opts.root)) {
        fail('--root must be an absolute path', 'ERR_CLI_USAGE');
      }
      let capacity = 4;
      if (opts.capacity !== undefined) {
        const parsed = Number(opts.capacity);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
          fail('capacity must be an integer between 1 and 4', 'ERR_CLI_USAGE');
        }
        capacity = parsed;
      }

      const init = await initializeStandardRuntime({ root: opts.root, capacity });
      await mkdir(join(dirname(opts.root), 'prepared'), { recursive: true }).catch(() => {});
      const summary = {
        schema: 'research.cli.v1',
        runtime_root: opts.root,
        runtime_epoch: init.runtime_epoch,
        capacity: init.capacity
      };

      if (opts.json) {
        stdout.write(`${canonicalJson(summary)}\n`);
      } else {
        stdout.write(`Created runtime at ${opts.root}\nRuntime: ${opts.root} (epoch ${init.runtime_epoch}, capacity ${init.capacity})\n`);
      }
      return summary;
    }

    if (subcommand === 'configure') {
      const opts = parseStrictFlags(tail, [
        '--runtime',
        '--root',
        '--epoch',
        '--content-root',
        '--opencli-package',
        '--source-identity',
        '--context-id',
        '--host-id',
        '--registry-root',
        '--browser-host'
      ], ['--json']);

      for (const required of ['runtime', 'root', 'epoch', 'content-root', 'opencli-package', 'source-identity', 'context-id', 'host-id', 'registry-root']) {
        if (!opts[required]) {
          fail(`missing required option: --${required}`, 'ERR_CLI_USAGE');
        }
      }

      let sourceIdentity;
      try {
        sourceIdentity = JSON.parse(await readFile(opts['source-identity'], 'utf8'));
      } catch {
        fail('source identity JSON unavailable', 'ERR_CLI_USAGE');
      }
      let browserHost = null;
      if (opts['browser-host']) {
        try { browserHost = JSON.parse(await readFile(opts['browser-host'], 'utf8')); }
        catch { fail('browser host JSON unavailable', 'ERR_CLI_USAGE'); }
      }

      const configured = await configureRuntime({
        configPath: opts.runtime,
        runtime: { root: opts.root, epoch: opts.epoch },
        contentRoot: opts['content-root'],
        packageRoot: opts['opencli-package'],
        sourceIdentity,
        contextId: opts['context-id'],
        hostId: opts['host-id'],
        registryRoot: opts['registry-root'],
        browserHost
      });

      if (opts.json) {
        stdout.write(`${canonicalJson(configured)}\n`);
      } else {
        stdout.write(`Configured runtime: ${configured.configPath} (generation ${configured.generation})\n`);
      }
      return configured;
    }

    if (subcommand === 'inspect') {
      const opts = parseStrictFlags(tail, ['--runtime', '--operation'], ['--json']);
      if (!opts.runtime) {
        fail('missing required --runtime argument', 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      const state = await inspectStandardRuntime({
        runtime: config.runtime,
        operationRef: opts.operation
      });

      if (opts.json) {
        stdout.write(`${canonicalJson(state)}\n`);
      } else {
        stdout.write(`Runtime: ${config.hostId} (epoch ${state.runtime_epoch}, capacity ${state.capacity})\nOccupied slots: ${state.occupied}\nOperations: ${state.operations.length}\n`);
      }
      return state;
    }

    if (subcommand === 'run') {
      const opts = parseStrictFlags(tail, ['--runtime'], ['--once', '--json']);
      if (!opts.runtime) {
        fail('missing required --runtime argument', 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      if (await humanControlActive(config.runtime)) {
        const result = { status: 'held', reason: 'human_control_active' };
        if (opts.json) stdout.write(`${canonicalJson(result)}\n`);
        return result;
      }
      const { driver } = await configuredBrowser(config);
      const result = await runService({
        config: { ...config, configPath: opts.runtime },
        driver,
        context: { ...(services.context ?? {}), contentRoot: config.contentRoot },
        once: Boolean(opts.once)
      });
      if (opts.json) {
        stdout.write(`${canonicalJson(result ?? {})}\n`);
      }
      return result;
    }

    if (subcommand === 'start') {
      const opts = parseStrictFlags(tail, ['--runtime'], ['--json']);
      if (!opts.runtime) {
        fail('missing required --runtime argument', 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      if (await humanControlActive(config.runtime)) fail('human browser control is active', 'ERR_HUMAN_CONTROL_ACTIVE');
      await configuredBrowser(config);
      const runtimeScript = fileURLToPath(new URL('../bin/research-runtime.js', import.meta.url));
      const spawnProcess = services.spawn ?? spawn;
      const child = spawnProcess(process.execPath, [runtimeScript, '--runtime', opts.runtime], {
        detached: true,
        stdio: 'ignore',
        shell: false
      });
      if (!Number.isInteger(child?.pid) || child.pid < 1) {
        fail('service process could not be spawned', 'ERR_SERVICE_STARTUP');
      }
      let result;
      try {
        result = await waitForServiceReady({
          runtimeRoot: config.runtime.root,
          configPath: opts.runtime,
          pid: child.pid,
          timeoutMs: 5000,
          clock: services.clock
        });
      } catch (error) {
        try { child.kill?.('SIGTERM'); } catch {}
        throw error;
      }
      child.unref?.();
      if (opts.json) {
        stdout.write(`${canonicalJson(result)}\n`);
      } else {
        stdout.write(`Started service background process: PID ${child.pid}\n`);
      }
      return result;
    }

    if (subcommand === 'stop') {
      const opts = parseStrictFlags(tail, ['--runtime'], ['--json']);
      if (!opts.runtime) {
        fail('missing required --runtime argument', 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      const stopResult = await requestServiceStop(config.runtime.root);
      if (opts.json) {
        stdout.write(`${canonicalJson(stopResult)}\n`);
      } else {
        stdout.write(`Stop requested: ${stopResult.status}\n`);
      }
      return stopResult;
    }

    if (subcommand === 'watch') {
      const opts = parseStrictFlags(tail, ['--runtime', '--operation', '--observer', '--after', '--timeout-ms'], ['--json']);
      if (!opts.runtime || !opts.operation || !opts.observer) {
        fail('missing required argument for watch', 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      const after = opts.after !== undefined ? Number(opts.after) : 0;
      const timeoutMs = opts['timeout-ms'] !== undefined ? Number(opts['timeout-ms']) : 0;
      const capturedEvents = [];

      await watchOperation({
        config,
        operationRef: opts.operation,
        observerId: opts.observer,
        after,
        timeoutMs,
        emit: (event) => {
          capturedEvents.push(event);
          if (opts.json) {
            stdout.write(`${canonicalJson(event)}\n`);
          } else {
            stdout.write(`Event ${event.cursor}: ${event.type} (${event.operation_ref})\n`);
          }
        },
        clock: services.clock
      });
      return capturedEvents;
    }

    if (subcommand === 'activate') {
      const opts = parseStrictFlags(tail, ['--runtime', '--operation', '--observer', '--generation', '--ttl-ms'], ['--replace-expired', '--json']);
      for (const req of ['runtime', 'operation', 'observer', 'generation', 'ttl-ms']) {
        if (!opts[req]) fail(`missing required argument --${req}`, 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      const ttlMs = Number(opts['ttl-ms']);
      const lease = await activateObserver({
        config,
        operationRef: opts.operation,
        observerId: opts.observer,
        generation: opts.generation,
        ttlMs,
        clock: services.clock,
        replaceExpired: opts['replace-expired'] === true
      });
      if (opts.json) {
        stdout.write(`${canonicalJson(lease)}\n`);
      } else {
        stdout.write(`Activated observer ${lease.observer_id} for op ${lease.operation_ref}\n`);
      }
      return lease;
    }

    if (subcommand === 'renew') {
      const opts = parseStrictFlags(tail, ['--runtime', '--operation', '--observer', '--generation', '--ttl-ms'], ['--json']);
      for (const req of ['runtime', 'operation', 'observer', 'generation', 'ttl-ms']) {
        if (!opts[req]) fail(`missing required argument --${req}`, 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      const ttlMs = Number(opts['ttl-ms']);
      const lease = await renewObserver({
        config,
        operationRef: opts.operation,
        observerId: opts.observer,
        generation: opts.generation,
        ttlMs,
        clock: services.clock
      });
      if (opts.json) {
        stdout.write(`${canonicalJson(lease)}\n`);
      } else {
        stdout.write(`Renewed observer ${lease.observer_id} for op ${lease.operation_ref}\n`);
      }
      return lease;
    }
  }

  if (family === 'research') {
    if (subcommand === 'submit') {
      const opts = parseStrictFlags(tail, ['--runtime', '--request', '--output-root', '--key', '--priority'], ['--json']);
      for (const req of ['runtime', 'request', 'output-root', 'key']) {
        if (!opts[req]) fail(`missing required argument --${req}`, 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      const priority = opts.priority ?? 'normal';
      if (!config.allowedPriorities.includes(priority)) {
        fail(`priority ${priority} is not permitted by runtime configuration`, 'ERR_PRIORITY_UNAUTHORIZED');
      }

      let requestData;
      try {
        requestData = JSON.parse(await readFile(opts.request, 'utf8'));
      } catch {
        fail('request file is invalid JSON', 'ERR_CLI_USAGE');
      }

      const existingState = await inspectStandardRuntime({ runtime: config.runtime, requestKey: opts.key });
      const existing = existingState.operations[0] ?? null;
      let prepared;
      if (existing) {
        const compiledRequest = await compileResearchRequest({ request: requestData, templatesRoot });
        if (!requestMatchesStoredIntent(compiledRequest, existing.intent, opts['output-root'])) {
          fail('duplicate request key has conflicting CLI request intent', 'ERR_RUNTIME_REQUEST_KEY_CONFLICT');
        }
        prepared = { job_id: existing.intent.job_id };
      } else {
        prepared = await prepareResearchJob({
          request: requestData,
          outputRoot: opts['output-root'],
          templatesRoot
        });
      }

      const receipt = await submitPreparedJobOnce({
        outputRoot: opts['output-root'],
        jobId: prepared.job_id,
        runtime: config.runtime,
        requestKey: opts.key,
        context: {
          priority,
          authorize: () => true
        }
      });

      if (opts.json) {
        stdout.write(`${canonicalJson(receipt)}\n`);
      } else {
        stdout.write(`Queued ${receipt.operation_ref}\nDelivery: waiting for observer\nRuntime: ${config.hostId} (${config.runtime.root})\n`);
      }
      return receipt;
    }

    if (subcommand === 'continue') {
      const opts = parseStrictFlags(tail, ['--runtime', '--job', '--base-result', '--key', '--prompt-file'], ['--json']);
      for (const req of ['runtime', 'job', 'base-result', 'key', 'prompt-file']) {
        if (!opts[req]) fail(`missing required argument --${req}`, 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      const prompt = await readFile(opts['prompt-file'], 'utf8');
      const receipt = await continueStandardJob({
        runtime: config.runtime,
        jobRef: opts.job,
        baseResultRef: opts['base-result'],
        requestKey: opts.key,
        prompt,
        context: { authorize: () => true }
      });
      if (opts.json) stdout.write(`${canonicalJson(receipt)}\n`);
      else stdout.write(`Queued continuation ${receipt.operation_ref}\n`);
      return receipt;
    }

    if (subcommand === 'result') {
      const opts = parseStrictFlags(tail, ['--runtime', '--result'], ['--json']);
      if (!opts.runtime || !opts.result) fail('missing required argument', 'ERR_CLI_USAGE');
      const config = await readRuntimeConfig(opts.runtime);
      const result = await getStandardResult({ runtime: config.runtime, resultRef: opts.result });
      if (opts.json) stdout.write(`${canonicalJson(result)}\n`);
      else stdout.write(result.text);
      return result;
    }

    if (subcommand === 'export') {
      const opts = parseStrictFlags(tail, ['--runtime', '--result', '--destination'], ['--json']);
      for (const req of ['runtime', 'result', 'destination']) {
        if (!opts[req]) fail(`missing required argument --${req}`, 'ERR_CLI_USAGE');
      }
      const config = await readRuntimeConfig(opts.runtime);
      const result = await exportStandardResult({
        runtime: config.runtime,
        resultRef: opts.result,
        destination: opts.destination,
        context: { authorize: () => true }
      });
      if (opts.json) stdout.write(`${canonicalJson(result)}\n`);
      else stdout.write(`Exported ${result.result_ref} to ${result.destination}\n`);
      return result;
    }
  }

  if (family === 'auth') {
    if (subcommand === 'show') {
      const opts = parseStrictFlags(tail, ['--runtime'], ['--json']);
      if (!opts.runtime) fail('missing required --runtime argument', 'ERR_CLI_USAGE');
      const config = await readRuntimeConfig(opts.runtime);
      const res = await authShow({ config });
      if (opts.json) {
        stdout.write(`${canonicalJson(res)}\n`);
      } else {
        stdout.write(`${res.message}\n`);
      }
      return res;
    }

    if (subcommand === 'check') {
      const opts = parseStrictFlags(tail, ['--runtime'], ['--json']);
      if (!opts.runtime) fail('missing required --runtime argument', 'ERR_CLI_USAGE');
      const config = await readRuntimeConfig(opts.runtime);
      let res;
      if (!await humanControlActive(config.runtime)) {
        res = await authCheck({ config, transport: null });
      } else {
        let transport = services.transport;
        if (!transport) ({ transport } = await configuredBrowser(config));
        res = await authCheck({ config, transport });
      }
      if (opts.json) {
        stdout.write(`${canonicalJson(res)}\n`);
      } else {
        stdout.write(`${res.message}\n`);
      }
      return res;
    }
  }

  fail(`unknown command: ${family} ${subcommand}`, 'ERR_CLI_USAGE');
}
