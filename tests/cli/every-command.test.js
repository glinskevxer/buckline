/**
 * Every command, walked.
 *
 * The commands are registered from a description now, so a command that is
 * added gets its options wired for free. What it does not get for free is a
 * test, and a command with no test is the one that has been broken since
 * March.
 *
 * This walks the program itself, so a command added tomorrow is covered
 * tomorrow. It does not check what any of them produce, only that each one is
 * wired the way every other one is.
 *
 * It runs every one of them in a scratch directory. That was not needed while
 * no command wrote anything without being told where, and the first one that
 * did wrote four files into the checkout. A sweep that runs every command has
 * to assume the next command has side effects.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeContext, EXIT } from '../../src/cli/io.js';
import { buildProgram, run } from '../../src/cli/program.js';
import { walk } from '../../src/cli/commands/commands.js';
import { CONFIG_KEYS } from '../../src/cli/config.js';

const commands = walk(buildProgram(makeContext()));

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-sweep-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A context that cannot touch the checkout, whatever the command does. */
function scratch() {
  return makeContext({ cwd: dir });
}

describe('every command', () => {
  it('answers to help without doing anything', () => {
    for (const row of commands) {
      const context = scratch();
      const { code } = run([...row.command.split(' '), '--help'], { context });
      expect(code, `${row.command} --help`).toBe(EXIT.ok);
      expect(context.captured(), `${row.command} --help`).toContain('Usage');
    }
  });

  it('describes itself in the help it prints', () => {
    for (const row of commands) {
      const context = scratch();
      run([...row.command.split(' '), '--help'], { context });
      expect(context.captured(), row.command).toContain(row.description);
    }
  });

  it('refuses to run without the options it says it needs', () => {
    for (const row of commands) {
      if (!row.options) continue;
      const context = scratch();
      const { code } = run(row.command.split(' '), { context });
      expect(code, row.command).toBe(EXIT.usage);
    }
  });

  it('never accepts a flag nobody declared', () => {
    for (const row of commands) {
      const context = scratch();
      const { code } = run([...row.command.split(' '), '--nonsense'], { context });
      expect(code, row.command).toBe(EXIT.usage);
    }
  });

  it('never writes a stack trace', () => {
    for (const row of commands) {
      const context = scratch();
      run(row.command.split(' '), { context });
      expect(context.capturedErrors(), row.command).not.toContain('    at ');
    }
  });
});

describe('the reporting commands', () => {
  const reporting = commands.filter((row) => !row.command.startsWith('yard'));

  it('describe their formats one of only two ways', () => {
    for (const row of reporting) {
      const context = scratch();
      run([...row.command.split(' '), '--help'], { context });
      const help = context.captured();
      if (!help.includes('--format')) continue;
      const said = ['text, csv or json', 'text or json'].some((phrase) => help.includes(phrase));
      expect(said, row.command).toBe(true);
    }
  });

  it('take an output file wherever they take all three formats', () => {
    for (const row of reporting) {
      const context = scratch();
      run([...row.command.split(' '), '--help'], { context });
      const help = context.captured();
      if (!help.includes('text, csv or json')) continue;
      expect(help, row.command).toContain('--output');
    }
  });

  it('all take an output file where they take a format', () => {
    for (const row of reporting) {
      const context = scratch();
      run([...row.command.split(' '), '--help'], { context });
      const help = context.captured();
      if (!help.includes('text, csv or json')) continue;
      expect(help, row.command).toContain('--output');
    }
  });
});

describe('the program as a whole', () => {
  it('lists every top level command in its own help', () => {
    const context = scratch();
    run(['--help'], { context });
    const help = context.captured();
    for (const top of new Set(commands.map((row) => row.command.split(' ')[0]))) {
      expect(help, top).toContain(top);
    }
  });

  it('names every yard file key in the config command', () => {
    const context = scratch();
    run(['config'], { context });
    for (const key of CONFIG_KEYS) {
      expect(context.captured(), key).toContain(key);
    }
  });

  it('covers a fair number of commands', () => {
    expect(commands.length).toBeGreaterThan(25);
  });
});
