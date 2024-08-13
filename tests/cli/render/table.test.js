import { describe, expect, it } from 'vitest';
import { block, heading, money, table } from '../../../src/cli/render/table.js';

const rows = [
  { species: 'red oak', boardFeet: 1450, grade: 'F1' },
  { species: 'yellow poplar', boardFeet: 320.5, grade: 'F2' },
];

describe('table', () => {
  it('writes a header, a rule and a row per entry', () => {
    const lines = table(rows, ['species', 'boardFeet', 'grade']).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('species');
    expect(lines[1]).toMatch(/^-+/);
  });

  it('right aligns numbers and left aligns text', () => {
    const lines = table(rows, ['species', 'boardFeet']).split('\n');
    expect(lines[2].startsWith('red oak')).toBe(true);
    expect(lines[2]).toMatch(/\s1450$/);
  });

  it('lines the numbers up under each other', () => {
    const lines = table(rows, ['species', 'boardFeet']).split('\n');
    expect(lines[2].length).toBe(lines[3].length);
  });

  it('takes a header different from the key', () => {
    const out = table(rows, [{ key: 'boardFeet', header: 'bd ft' }]);
    expect(out.split('\n')[0].trim()).toBe('bd ft');
  });

  it('takes a formatter', () => {
    const out = table(rows, [{ key: 'boardFeet', format: (value) => `${value} bf` }]);
    expect(out).toContain('1450 bf');
  });

  it('takes an explicit alignment', () => {
    const out = table(rows, [{ key: 'species', align: 'right' }]);
    expect(out.split('\n')[2].startsWith(' ')).toBe(true);
  });

  it('adds a totals row when asked', () => {
    const out = table(rows, ['species', 'boardFeet'], {
      totals: { species: 'total', boardFeet: 1770.5 },
    });
    const lines = out.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines.at(-1)).toContain('total');
  });

  it('rounds a fractional number to two places', () => {
    const out = table([{ n: 1.23456 }], ['n']);
    expect(out).toContain('1.23');
  });

  it('leaves a missing value blank rather than printing undefined', () => {
    const out = table([{ species: 'ash' }], ['species', 'boardFeet']);
    expect(out).not.toContain('undefined');
  });

  it('writes yes and no for booleans', () => {
    const out = table([{ cull: true }, { cull: false }], ['cull']);
    expect(out).toContain('yes');
    expect(out).toContain('no');
  });

  it('says so when there is nothing to show', () => {
    expect(table([], ['species'])).toBe('(nothing to show)');
    expect(table([], ['species'], { empty: 'no logs' })).toBe('no logs');
  });

  it('refuses nonsense arguments', () => {
    expect(() => table('rows', ['a'])).toThrow(TypeError);
    expect(() => table(rows, [])).toThrow(TypeError);
  });

  it('does not leave trailing spaces on a line', () => {
    for (const line of table(rows, ['species', 'grade']).split('\n')) {
      expect(line).toBe(line.trimEnd());
    }
  });
});

describe('block', () => {
  it('aligns the labels', () => {
    const out = block({ ticket: 'S-1', rule: 'doyle' });
    const lines = out.split('\n');
    expect(lines[0].indexOf(':')).toBe(lines[1].indexOf(':'));
  });

  it('takes an array of pairs as well as an object', () => {
    expect(block([['a', 1]])).toBe('a: 1');
  });

  it('writes nothing for nothing', () => {
    expect(block({})).toBe('');
  });

  it('takes a different separator', () => {
    expect(block({ a: 1 }, { separator: ' = ' })).toBe('a = 1');
  });
});

describe('heading', () => {
  it('rules under the text to the same width', () => {
    const [text, rule] = heading('Scale ticket').split('\n');
    expect(rule).toHaveLength(text.length);
  });

  it('takes a different rule character', () => {
    expect(heading('ab', { rule: '-' })).toBe('ab\n--');
  });
});

describe('money', () => {
  it('groups thousands and fixes the places', () => {
    expect(money(1234567.5)).toBe('1,234,567.50');
  });

  it('writes a negative in brackets, the way a statement does', () => {
    expect(money(-250)).toBe('(250.00)');
  });

  it('takes a different number of places', () => {
    expect(money(1234.5678, 0)).toBe('1,235');
  });

  it('writes nothing for something that is not a number', () => {
    expect(money('x')).toBe('');
    expect(money(NaN)).toBe('');
  });
});
