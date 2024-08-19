#!/usr/bin/env node
import { run } from '../src/cli/program.js';

const { code, context } = run(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
});

if (context.errors.length > 0) {
  for (const line of context.errors) process.stderr.write(`${line}\n`);
}

process.exit(code);
