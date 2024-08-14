import { describe, expect, it } from 'vitest';
import { json, jsonLines, jsonSafe } from '../../../src/cli/render/json.js';

describe('jsonSafe', () => {
  it('turns a map into an object', () => {
    expect(jsonSafe(new Map([['a', 1]]))).toEqual({ a: 1 });
  });

  it('turns a set into an array', () => {
    expect(jsonSafe(new Set([1, 2]))).toEqual([1, 2]);
  });

  it('walks into a map value', () => {
    expect(jsonSafe(new Map([['a', new Set([1])]]))).toEqual({ a: [1] });
  });

  it('turns a date into a string', () => {
    expect(jsonSafe(new Date('2024-08-13T00:00:00Z'))).toBe('2024-08-13T00:00:00.000Z');
  });

  it('turns an error into its parts', () => {
    const error = new Error('bad');
    error.code = 'SCALE';
    expect(jsonSafe(error)).toEqual({ name: 'Error', message: 'bad', code: 'SCALE' });
  });

  it('leaves plain values alone', () => {
    expect(jsonSafe({ a: 1, b: [2, 3], c: null })).toEqual({ a: 1, b: [2, 3], c: null });
  });

  it('marks a circular reference rather than hanging', () => {
    const loop = { name: 'a' };
    loop.self = loop;
    expect(jsonSafe(loop).self).toBe('[circular]');
  });

  it('allows the same object twice in different places', () => {
    const shared = { n: 1 };
    const result = jsonSafe({ a: shared, b: shared });
    expect(result.a).toEqual({ n: 1 });
  });
});

describe('json', () => {
  it('indents by default', () => {
    expect(json({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('can be told not to', () => {
    expect(json({ a: 1 }, { indent: 0 })).toBe('{"a":1}');
  });

  it('does not lose a map the way stringify would', () => {
    expect(JSON.stringify(new Map([['a', 1]]))).toBe('{}');
    expect(json(new Map([['a', 1]]), { indent: 0 })).toBe('{"a":1}');
  });
});

describe('jsonLines', () => {
  it('writes one object per line', () => {
    expect(jsonLines([{ a: 1 }, { a: 2 }])).toBe('{"a":1}\n{"a":2}');
  });

  it('writes nothing for nothing', () => {
    expect(jsonLines([])).toBe('');
  });

  it('refuses something that is not a list', () => {
    expect(() => jsonLines({ a: 1 })).toThrow(TypeError);
  });
});
