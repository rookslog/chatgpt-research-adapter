#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { runRuntimeCli } from '../src/runtime-cli.js';
import { formatCliError } from '../src/cli.js';

const argv = ['runtime', 'run', ...process.argv.slice(2)];

try {
  await runRuntimeCli(argv, {
    stdout: process.stdout,
    stderr: process.stderr,
    templatesRoot: fileURLToPath(new URL('../templates/', import.meta.url))
  });
} catch (error) {
  process.stderr.write(formatCliError(error));
  process.exit(1);
}
