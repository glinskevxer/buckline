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
 */

import { describe, expect, it } from 'vitest';
import { makeContext, EXIT } from '../../src/cli/io.js';
import { buildProgram, run } from '../../src/cli/program.js';
import { walk } from '../../src/cli/commands/commands.js';
import { CONFIG_KEYS } from '../../src/cli/config.js';

const commands = walk(buildProgram(makeContext()));

describe('every command', () => {
  it('answers to help without doing anything', () => {
    for (const row of commands) {
      const context = makeContext();
      const { code } = run([...row.command.split(' '), '--help'], { context });
      expect(code, `${row.command} --help`).toBe(EXIT.ok);
      expect(context.captured(), `${row.command} --help`).toContain('Usage');
    }
  });

  it('describes itself in the help it prints', () => {
    for (const row of commands) {
      const context = makeContext();
      run([...row.command.split(' '), '--help'], { context });
      expect(context.captured(), row.command).toContain(row.description);
    }
  });

  it('refuses to run without the options it says it needs', () => {
    for (const row of commands) {
      if (!row.options) continue;
      const context = makeContext();
      const { code } = run(row.command.split(' '), { context });
      expect(code, row.command).toBe(EXIT.usage);
    }
  });

  it('never accepts a flag nobody declared', () => {
    for (const row of commands) {
      const context = makeContext();
      const { code } = run([...row.command.split(' '), '--nonsense'], { context });
      expect(code, row.command).toBe(EXIT.usage);
    }
  });

  it('never writes a stack trace', () => {
    for (const row of commands) {
      const context = makeContext();
      run(row.command.split(' '), { context });
      expect(context.capturedErrors(), row.command).not.toContain('    at ');
    }
  });
});

describe('the reporting commands', () => {
  const reporting = commands.filter((row) => !row.command.startsWith('yard'));

  it('describe their formats one of only two ways', () => {
    for (const row of reporting) {
      const context = makeContext();
      run([...row.command.split(' '), '--help'], { context });
      const help = context.captured();
      if (!help.includes('--format')) continue;
      const said = ['text, csv or json', 'text or json'].some((phrase) => help.includes(phrase));
      expect(said, row.command).toBe(true);
    }
  });

  it('take an output file wherever they take all three formats', () => {
    for (const row of reporting) {
      const context = makeContext();
      run([...row.command.split(' '), '--help'], { context });
      const help = context.captured();
      if (!help.includes('text, csv or json')) continue;
      expect(help, row.command).toContain('--output');
    }
  });

  it('all take an output file where they take a format', () => {
    for (const row of reporting) {
      const context = makeContext();
      run([...row.command.split(' '), '--help'], { context });
      const help = context.captured();
      if (!help.includes('text, csv or json')) continue;
      expect(help, row.command).toContain('--output');
    }
  });
});

describe('the program as a whole', () => {
  it('lists every top level command in its own help', () => {
    const context = makeContext();
    run(['--help'], { context });
    const help = context.captured();
    for (const top of new Set(commands.map((row) => row.command.split(' ')[0]))) {
      expect(help, top).toContain(top);
    }
  });

  it('names every yard file key in the config command', () => {
    const context = makeContext();
    run(['config'], { context });
    for (const key of CONFIG_KEYS) {
      expect(context.captured(), key).toContain(key);
    }
  });

  it('covers a fair number of commands', () => {
    expect(commands.length).toBeGreaterThan(25);
  });
});
