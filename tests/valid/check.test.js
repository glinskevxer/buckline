import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors.js';
import { boolean, collect, list, number, object, string, validate } from '../../src/valid/check.js';

const logSchema = {
  id: string(),
  species: string({ oneOf: ['red oak', 'white oak', 'hard maple'] }),
  smallEndIn: number({ min: 4, max: 60 }),
  lengthFt: number({ min: 6 }),
  butt: boolean({ default: false }),
  axes: list(number({ min: 1 }), { minLength: 1 }),
  origin: object({ tract: string(), stand: string({ optional: true }) }, { optional: true }),
};

const good = {
  id: 'L-1001',
  species: 'red oak',
  smallEndIn: 16,
  lengthFt: 12,
  axes: [16, 17],
};

describe('validate', () => {
  it('accepts a well formed log and fills the default', () => {
    const out = validate(good, logSchema, { label: 'log' });
    expect(out.butt).toBe(false);
    expect(out.axes).toEqual([16, 17]);
  });

  it('drops fields the schema does not declare', () => {
    const out = validate({ ...good, scribbles: 'ignore me' }, logSchema);
    expect(out.scribbles).toBeUndefined();
  });

  it('trims text by default', () => {
    const out = validate({ ...good, id: '  L-1001  ' }, logSchema);
    expect(out.id).toBe('L-1001');
  });

  it('reports every problem at once', () => {
    let caught;
    try {
      validate({ id: '', species: 'pine', smallEndIn: 2, axes: [] }, logSchema, { label: 'log' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const paths = caught.issues.map((i) => i.path);
    expect(paths).toContain('log.id');
    expect(paths).toContain('log.species');
    expect(paths).toContain('log.smallEndIn');
    expect(paths).toContain('log.lengthFt');
  });

  it('names the index of a bad list entry', () => {
    const bad = { ...good, axes: [16, 'seventeen'] };
    const result = collect(bad, logSchema, { label: 'log' });
    expect(result.ok).toBe(false);
    expect(result.issues[0].path).toBe('log.axes[1]');
  });

  it('walks into a nested object', () => {
    const out = validate({ ...good, origin: { tract: 'Culpeper 40' } }, logSchema);
    expect(out.origin).toEqual({ tract: 'Culpeper 40' });
  });

  it('reports a nested field by its full path', () => {
    const result = collect({ ...good, origin: { stand: 'north' } }, logSchema, { label: 'log' });
    expect(result.issues.map((i) => i.path)).toContain('log.origin.tract');
  });

  it('allows an optional object to be missing entirely', () => {
    expect(validate(good, logSchema).origin).toBeUndefined();
  });

  it('rejects a value that is not an object at all', () => {
    expect(() => validate('L-1001', logSchema)).toThrow(ValidationError);
    expect(() => validate([1, 2], logSchema)).toThrow(ValidationError);
  });

  it('enforces integers where the schema asks for them', () => {
    const schema = { count: number({ integer: true }) };
    expect(() => validate({ count: 2.5 }, schema)).toThrow(ValidationError);
    expect(validate({ count: 2 }, schema).count).toBe(2);
  });

  it('enforces the upper bound as well as the lower', () => {
    expect(() => validate({ ...good, smallEndIn: 90 }, logSchema)).toThrow(ValidationError);
  });

  it('treats null the same as missing', () => {
    const result = collect({ ...good, species: null }, logSchema, { label: 'log' });
    expect(result.issues.map((i) => i.path)).toEqual(['log.species']);
  });
});

describe('collect', () => {
  it('returns the value when everything checks out', () => {
    const result = collect(good, logSchema);
    expect(result.ok).toBe(true);
    expect(result.value.id).toBe('L-1001');
  });
});
