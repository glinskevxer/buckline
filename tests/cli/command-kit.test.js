import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { makeContext } from '../../src/cli/io.js';
import {
  actionCommand,
  addOptions,
  optional,
  reportCommand,
  required,
} from '../../src/cli/command-kit.js';

function program() {
  const command = new Command();
  command.exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
  return command;
}

describe('required and optional', () => {
  it('mark an option one way or the other', () => {
    expect(required('-a <x>', 'a').required).toBe(true);
    expect(optional('-b <x>', 'b').required).toBeUndefined();
  });

  it('carry a default when one is given', () => {
    expect(optional('-b <x>', 'b', '7').default).toBe('7');
  });
});

describe('addOptions', () => {
  it('hangs required and optional flags on a command', () => {
    const command = program().command('x');
    addOptions(command, [required('-a <v>', 'a'), optional('-b <v>', 'b', '2')]);
    const flags = command.options.map((option) => option.flags);
    expect(flags).toEqual(['-a <v>', '-b <v>']);
    expect(command.options[0].mandatory).toBe(true);
    expect(command.options[1].defaultValue).toBe('2');
  });

  it('hangs nothing when there is nothing to hang', () => {
    const command = program().command('x');
    addOptions(command);
    expect(command.options).toEqual([]);
  });
});

describe('reportCommand', () => {
  it('always adds the same two output options', () => {
    const context = makeContext();
    const parent = program();
    const command = reportCommand(parent, context, {
      name: 'x',
      description: 'x',
      options: [required('-a <v>', 'a')],
      run: () => 'done',
    });
    const flags = command.options.map((option) => option.flags);
    expect(flags).toContain('-f, --format <format>');
    expect(flags).toContain('-o, --output <file>');
  });

  it('defaults every report to text', () => {
    const parent = program();
    const command = reportCommand(parent, makeContext(), {
      name: 'x',
      description: 'x',
      run: () => 'done',
    });
    const format = command.options.find((option) => option.flags.includes('--format'));
    expect(format.defaultValue).toBe('text');
  });

  it('runs the command and emits what came back', () => {
    const context = makeContext();
    const parent = program();
    reportCommand(parent, context, { name: 'x', description: 'x', run: () => 'done' });
    parent.parse(['x'], { from: 'user' });
    expect(context.captured()).toBe('done');
  });

  it('passes the options through to the command', () => {
    const context = makeContext();
    const parent = program();
    reportCommand(parent, context, {
      name: 'x',
      description: 'x',
      options: [optional('--who <name>', 'who')],
      run: (options) => `hello ${options.who}`,
    });
    parent.parse(['x', '--who', 'scaler'], { from: 'user' });
    expect(context.captured()).toBe('hello scaler');
  });
});

describe('actionCommand', () => {
  it('adds no output options by default', () => {
    const command = actionCommand(program(), makeContext(), {
      name: 'x',
      description: 'x',
      run: () => 'done',
    });
    expect(command.options).toEqual([]);
  });

  it('adds a format option when the command asks for one', () => {
    const command = actionCommand(program(), makeContext(), {
      name: 'x',
      description: 'x',
      formats: true,
      run: () => 'done',
    });
    expect(command.options.map((option) => option.flags)).toEqual(['-f, --format <format>']);
  });

  it('runs the command', () => {
    const context = makeContext();
    const parent = program();
    actionCommand(parent, context, { name: 'x', description: 'x', run: () => 'saved' });
    parent.parse(['x'], { from: 'user' });
    expect(context.captured()).toBe('saved');
  });
});
