import { beforeEach, describe, expect, it } from 'vitest';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { comparisonRows, stickRows } from '../../../src/cli/commands/rules.js';

let context;

beforeEach(() => {
  context = makeContext();
});

describe('stickRows', () => {
  it('runs the diameters asked for', () => {
    const rows = stickRows('doyle', 16, { from: 10, to: 12 });
    expect(rows.map((row) => row.diameterIn)).toEqual([10, 11, 12]);
  });

  it('agrees with the rule', () => {
    expect(stickRows('doyle', 16, { from: 16, to: 16 })[0].boardFeet).toBe(144);
  });
});

describe('comparisonRows', () => {
  it('carries a column per rule', () => {
    const row = comparisonRows(16, { from: 16, to: 16 })[0];
    expect(row.doyle).toBe(144);
    expect(row.scribner).toBe(160);
    expect(row.international).toBe(180);
  });

  it('carries the ratio against international', () => {
    const row = comparisonRows(16, { from: 12, to: 12 })[0];
    expect(row['doyle ratio']).toBeLessThan(1);
  });
});

describe('buckline rules', () => {
  it('compares every rule by default', () => {
    const { code } = run(['rules'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Every rule at 16 feet');
    expect(context.captured()).toContain('doyle');
    expect(context.captured()).toContain('scribner');
  });

  it('says where each rule catches international', () => {
    run(['rules'], { context });
    expect(context.captured()).toContain('Where each rule catches International');
  });

  it('prints one rule when asked', () => {
    run(['rules', '-r', 'scribner'], { context });
    expect(context.captured()).toContain('Scribner Decimal C scale stick');
    expect(context.captured()).toContain('deduction method');
  });

  it('takes a length', () => {
    run(['rules', '-l', '12'], { context });
    expect(context.captured()).toContain('at 12 feet');
  });

  it('takes a diameter range', () => {
    run(['rules', '-r', 'doyle', '--from', '10', '--to', '12'], { context });
    const lines = context.captured().split('\n');
    expect(lines.filter((line) => /^\s*1[012]\s/.test(line))).toHaveLength(3);
  });

  it('writes csv when asked', () => {
    run(['rules', '-f', 'csv'], { context });
    expect(context.captured().split('\n')[0]).toContain('diameterIn');
  });

  it('writes json when asked', () => {
    run(['rules', '-r', 'doyle', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).policy.id).toBe('doyle');
  });

  it('complains about a rule nobody scales under', () => {
    expect(run(['rules', '-r', 'cubic'], { context }).code).toBe(EXIT.data);
  });
});
