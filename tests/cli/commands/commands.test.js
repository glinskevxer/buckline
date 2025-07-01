import { describe, expect, it } from 'vitest';
import { makeContext } from '../../../src/cli/io.js';
import { buildProgram, run } from '../../../src/cli/program.js';
import { walk } from '../../../src/cli/commands/commands.js';

describe('walk', () => {
  const rows = walk(buildProgram(makeContext()));

  it('flattens the groups into one list', () => {
    const names = rows.map((row) => row.command);
    expect(names).toContain('scale');
    expect(names).toContain('yard receive');
    expect(names).toContain('report reconcile');
  });

  it('never lists a group on its own', () => {
    expect(rows.map((row) => row.command)).not.toContain('yard');
  });

  it('gives every command a description', () => {
    for (const row of rows) {
      expect(row.description.length).toBeGreaterThan(5);
    }
  });

  it('names the options a command must have', () => {
    const scale = rows.find((row) => row.command === 'scale');
    expect(scale.options).toContain('--load');
    expect(scale.options).toContain('--tract');
  });

  it('comes back sorted', () => {
    expect(rows.map((row) => row.command)).toEqual([...rows.map((row) => row.command)].sort());
  });

  it('lists a good many commands', () => {
    expect(rows.length).toBeGreaterThan(20);
  });
});

describe('buckline commands', () => {
  it('prints them all', () => {
    const context = makeContext();
    run(['commands'], { context });
    expect(context.captured()).toContain('Every command');
    expect(context.captured()).toContain('scale');
  });

  it('says what every report command also takes', () => {
    const context = makeContext();
    run(['commands'], { context });
    expect(context.captured()).toContain('-f text|csv|json');
    expect(context.captured()).toContain('buckline.json');
  });

  it('filters on a match', () => {
    const context = makeContext();
    run(['commands', '-m', 'yard'], { context });
    expect(context.captured()).toContain('yard receive');
    expect(context.captured()).not.toContain('report reconcile');
  });

  it('says so when nothing matched', () => {
    const context = makeContext();
    run(['commands', '-m', 'polish'], { context });
    expect(context.captured()).toContain('nothing matched');
  });

  it('writes json when asked', () => {
    const context = makeContext();
    run(['commands', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).length).toBeGreaterThan(20);
  });
});
