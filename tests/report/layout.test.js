import { describe, expect, it } from 'vitest';
import { document, section, title } from '../../src/report/layout.js';

describe('section', () => {
  it('renders a title, a block and a table in that order', () => {
    const out = section({
      title: 'Totals',
      fields: { gross: 100 },
      rows: [{ a: 1 }],
    });
    const lines = out.split('\n');
    expect(lines[0]).toBe('Totals');
    expect(lines[1]).toMatch(/^-+$/);
    expect(out).toContain('gross: 100');
    expect(out).toContain('a');
  });

  it('renders as nothing when there is nothing in it', () => {
    expect(section({ title: 'Culled', rows: [] })).toBeNull();
    expect(section({})).toBeNull();
  });

  it('renders an empty message when one is given', () => {
    expect(section({ title: 'Culled', rows: [], empty: 'nothing culled' })).toContain(
      'nothing culled'
    );
  });

  it('takes explicit columns', () => {
    const out = section({ rows: [{ a: 1, b: 2 }], columns: [{ key: 'b', header: 'bee' }] });
    expect(out.split('\n')[0].trim()).toBe('bee');
  });

  it('takes a totals row', () => {
    const out = section({ rows: [{ a: 1 }], totals: { a: 1 } });
    expect(out.split('\n')).toHaveLength(5);
  });

  it('puts one blank line between a block and a table', () => {
    const out = section({ fields: { a: 1 }, rows: [{ b: 2 }] });
    expect(out.split('\n')[1]).toBe('');
  });

  it('renders loose lines', () => {
    expect(section({ title: 'Notes', lines: ['one', 'two'] })).toContain('one\ntwo');
  });

  it('takes a different rule character', () => {
    expect(section({ title: 'ab', rule: '=', fields: { a: 1 } })).toContain('==');
  });
});

describe('document', () => {
  it('separates sections with exactly one blank line', () => {
    const out = document([{ fields: { a: 1 } }, { fields: { b: 2 } }]);
    expect(out).toBe('a: 1\n\nb: 2');
  });

  it('drops a section that rendered as nothing', () => {
    const out = document([
      { fields: { a: 1 } },
      { title: 'Culled', rows: [] },
      { fields: { b: 2 } },
    ]);
    expect(out).toBe('a: 1\n\nb: 2');
  });

  it('takes plain strings alongside sections', () => {
    expect(document(['a note', { fields: { a: 1 } }])).toBe('a note\n\na: 1');
  });

  it('drops an empty string', () => {
    expect(document(['', { fields: { a: 1 } }])).toBe('a: 1');
  });

  it('spaces the same way whether an optional section had content or not', () => {
    const withIt = document([{ fields: { a: 1 } }, { rows: [{ b: 1 }] }, 'end']);
    const withoutIt = document([{ fields: { a: 1 } }, { rows: [] }, 'end']);
    expect(withoutIt.split('\n\n')).toHaveLength(2);
    expect(withIt.split('\n\n')).toHaveLength(3);
  });
});

describe('title', () => {
  it('rules with the heavier character', () => {
    expect(title('Scale ticket')).toContain('====');
  });
});
