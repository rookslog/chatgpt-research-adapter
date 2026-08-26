#!/usr/bin/env node
import { formatCliError, runCli } from '../src/cli.js';

runCli(process.argv.slice(2)).catch((error) => {
  process.stderr.write(formatCliError(error));
  process.exitCode = 1;
});
