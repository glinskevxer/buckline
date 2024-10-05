#!/usr/bin/env node
import { run } from '../src/cli/program.js';

const { code } = run(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
});

process.exit(code);
