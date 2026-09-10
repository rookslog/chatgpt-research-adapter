import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { canonicalJson } from './canonical-json.js';
import { applySetup, applyUninstall, planSetup, planUninstall } from './setup.js';

const fail = (message, code = 'ERR_CLI_USAGE') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const SETUP_USAGE = 'usage: setup plan --prefix <abs> --source <abs> --platform darwin|linux --topology local|ssh-linux --components <abs-json> --profile <abs> --plan-output <abs> [--json] | setup apply --plan <abs-json> [--json] | setup uninstall --prefix <abs> [--json]';

function parseFlags(argv, allowedValued, allowedBoolean) {
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

export async function runSetupCli(argv, { stdout = process.stdout } = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || argv[0] !== 'setup') {
    return null;
  }

  const subcommand = argv[1];
  const tail = argv.slice(2);

  if (
    argv.length === 1 ||
    subcommand === '--help' ||
    subcommand === 'help' ||
    (argv.length === 3 && tail[0] === '--help')
  ) {
    stdout.write(`${SETUP_USAGE}\n`);
    return { status: 'help', family: 'setup' };
  }

  if (subcommand === 'plan') {
    const opts = parseFlags(tail, [
      '--prefix',
      '--source',
      '--platform',
      '--topology',
      '--components',
      '--profile',
      '--plan-output'
    ], ['--json']);

    for (const required of ['prefix', 'source', 'platform', 'topology', 'components', 'profile', 'plan-output']) {
      if (!opts[required]) {
        fail(`missing required option: --${required}`, 'ERR_CLI_USAGE');
      }
    }

    if (!isAbsolute(opts.prefix) || !isAbsolute(opts.source) || !isAbsolute(opts['plan-output']) || !isAbsolute(opts.profile) || !isAbsolute(opts.components)) {
      fail('paths must be absolute', 'ERR_CLI_USAGE');
    }

    let componentsData = {};
    try {
      const text = await readFile(opts.components, 'utf8');
      componentsData = JSON.parse(text);
    } catch {
      fail('components file could not be read or is invalid JSON', 'ERR_SETUP_COMPONENTS');
    }

    const plan = await planSetup({
      prefix: opts.prefix,
      sourceRoot: opts.source,
      platform: opts.platform,
      topology: opts.topology,
      components: componentsData,
      profilePath: opts.profile
    });

    await writeFile(opts['plan-output'], canonicalJson(plan) + '\n', 'utf8');

    if (opts.json) {
      stdout.write(`${canonicalJson(plan)}\n`);
    } else {
      stdout.write(`Setup plan generated: ${plan.plan_id}\nMissing prerequisites: ${plan.missing_prerequisites.length}\n`);
    }
    return plan;
  }

  if (subcommand === 'apply') {
    const opts = parseFlags(tail, ['--plan'], ['--json']);
    if (!opts.plan || !isAbsolute(opts.plan)) {
      fail('missing or invalid --plan argument', 'ERR_CLI_USAGE');
    }
    let planData;
    try {
      const text = await readFile(opts.plan, 'utf8');
      planData = JSON.parse(text);
    } catch {
      fail('plan file unavailable or invalid JSON', 'ERR_SETUP_PLAN_INVALID');
    }

    const result = await applySetup({ plan: planData });
    if (opts.json) {
      stdout.write(`${canonicalJson(result)}\n`);
    } else {
      stdout.write(`Applied setup plan: ${result.plan_id} (status: ${result.status})\n`);
    }
    return result;
  }

  if (subcommand === 'uninstall') {
    const opts = parseFlags(tail, ['--prefix'], ['--json']);
    if (!opts.prefix || !isAbsolute(opts.prefix)) {
      fail('missing or invalid --prefix argument', 'ERR_CLI_USAGE');
    }
    const unPlan = await planUninstall({ prefix: opts.prefix });
    const result = await applyUninstall({ plan: unPlan });
    if (opts.json) {
      stdout.write(`${canonicalJson(result)}\n`);
    } else {
      stdout.write(`Uninstalled prefix: ${result.prefix}\n`);
    }
    return result;
  }

  fail(SETUP_USAGE, 'ERR_CLI_USAGE');
}
