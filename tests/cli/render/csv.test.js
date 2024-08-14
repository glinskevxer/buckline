import { describe, expect, it } from 'vitest';
import { csv, csvCell, csvRow, parseCsv } from '../../../src/cli/render/csv.js';

const rows = [
  { species: 'red oak', boardFeet: 1450, note: 'butt log, clean' },
  { species: 'poplar "yellow"', boardFeet: 320.5, note: null },
];

describe('csvCell', () => {
  it('leaves a plain value alone', () => {
    expect(csvCell('red oak')).toBe('red oak');
    expect(csvCell(1450)).toBe('1450');
  });

  it('quotes a value with a comma in it', () => {
    expect(csvCell('butt log, clean')).toBe('"butt log, clean"');
  });

  it('doubles an embedded quote', () => {
    expect(csvCell('poplar "yellow"')).toBe('"poplar ""yellow"""');
  });

  it('quotes a value with a newline in it', () => {
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('writes an empty field rather than the word undefined', () => {
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
  });

  it('writes an empty field for a number that is not finite', () => {
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(Infinity)).toBe('');
  });

  it('writes booleans as words', () => {
    expect(csvCell(true)).toBe('true');
    expect(csvCell(false)).toBe('false');
  });

  it('writes a number without thousands separators', () => {
    expect(csvCell(1234567.5)).toBe('1234567.5');
  });
});

describe('csvRow', () => {
  it('joins the cells on commas', () => {
    expect(csvRow(['a', 1, null])).toBe('a,1,');
  });
});

describe('csv', () => {
  it('writes a header and a row per entry', () => {
    const lines = csv(rows).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('species,boardFeet,note');
  });

  it('takes the columns it is given, in that order', () => {
    expect(csv(rows, ['boardFeet', 'species']).split('\n')[0]).toBe('boardFeet,species');
  });

  it('takes a header different from the key', () => {
    expect(csv(rows, [{ key: 'boardFeet', header: 'bd ft' }]).split('\n')[0]).toBe('bd ft');
  });

  it('takes a formatter', () => {
    const out = csv(rows, [{ key: 'boardFeet', format: (value) => value / 1000 }]);
    expect(out).toContain('1.45');
  });

  it('can leave the header out', () => {
    expect(csv(rows, ['species'], { header: false }).split('\n')).toHaveLength(2);
  });

  it('writes nothing for an empty list with no columns', () => {
    expect(csv([])).toBe('');
  });

  it('writes just a header for an empty list with columns', () => {
    expect(csv([], ['species'])).toBe('species');
  });

  it('refuses something that is not a list', () => {
    expect(() => csv('rows')).toThrow(TypeError);
  });
});

describe('parseCsv', () => {
  it('reads back what it wrote', () => {
    const parsed = parseCsv(csv(rows));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].species).toBe('red oak');
    expect(parsed[0].note).toBe('butt log, clean');
  });

  it('reads an embedded quote back', () => {
    expect(parseCsv(csv(rows))[1].species).toBe('poplar "yellow"');
  });

  it('reads an embedded newline back', () => {
    const parsed = parseCsv(csv([{ note: 'a\nb' }]));
    expect(parsed[0].note).toBe('a\nb');
  });

  it('reads an empty field as empty text', () => {
    expect(parseCsv(csv(rows))[1].note).toBe('');
  });

  it('can be told there is no header', () => {
    const raw = parseCsv('a,b\nc,d', { header: false });
    expect(raw).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('reads nothing out of nothing', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
