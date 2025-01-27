import { describe, expect, it } from 'vitest';
import { FORMATS, render, requireFormat } from '../../../src/cli/render/index.js';

const shapes = {
  json: { a: 1 },
  csv: [{ a: 1 }, { a: 2 }],
  text: () => 'a report',
};

describe('requireFormat', () => {
  it('accepts the three formats', () => {
    for (const format of FORMATS) {
      expect(requireFormat(format)).toBe(format);
    }
  });

  it('refuses anything else and names what it writes', () => {
    expect(() => requireFormat('pdf')).toThrow(/text, csv, json/);
    expect(() => requireFormat(undefined)).toThrow(TypeError);
  });
});

describe('render', () => {
  it('writes json', () => {
    expect(JSON.parse(render('json', shapes))).toEqual({ a: 1 });
  });

  it('writes csv', () => {
    expect(render('csv', shapes).split('\n')).toEqual(['a', '1', '2']);
  });

  it('writes text', () => {
    expect(render('text', shapes)).toBe('a report');
  });

  it('takes explicit csv columns', () => {
    const out = render('csv', { ...shapes, csvColumns: [{ key: 'a', header: 'value' }] });
    expect(out.split('\n')[0]).toBe('value');
  });

  it('checks the format before building anything', () => {
    let built = false;
    expect(() =>
      render('pdf', {
        json: {},
        csv: [],
        text: () => {
          built = true;
          return '';
        },
      })
    ).toThrow(TypeError);
    expect(built).toBe(false);
  });

  it('does not build the text when json was asked for', () => {
    let built = false;
    render('json', {
      json: { a: 1 },
      csv: [],
      text: () => {
        built = true;
        return '';
      },
    });
    expect(built).toBe(false);
  });

  it('refuses a text shape that is not a function', () => {
    expect(() => render('text', { json: {}, csv: [], text: 'a report' })).toThrow(TypeError);
  });
});
