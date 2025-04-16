import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors.js';
import {
  boolean,
  collect,
  date,
  describeSchema,
  integer,
  list,
  number,
  object,
  string,
  validate,
} from '../../src/valid/check.js';

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

describe('date fields', () => {
  const schema = { on: date(), from: date({ notBefore: '2024-01-01', optional: true }) };

  it('accepts a real date', () => {
    expect(validate({ on: '2025-04-15' }, schema).on).toBe('2025-04-15');
  });

  it('refuses a date written any other way', () => {
    expect(() => validate({ on: '15/04/2025' }, schema)).toThrow(ValidationError);
    expect(() => validate({ on: '2025-4-15' }, schema)).toThrow(ValidationError);
    expect(() => validate({ on: 20250415 }, schema)).toThrow(ValidationError);
  });

  it('refuses a day that does not exist', () => {
    expect(() => validate({ on: '2025-02-32' }, schema)).toThrow(ValidationError);
    expect(() => validate({ on: '2025-02-30' }, schema)).toThrow(ValidationError);
  });

  it('accepts a leap day in a leap year and refuses it otherwise', () => {
    expect(validate({ on: '2024-02-29' }, schema).on).toBe('2024-02-29');
    expect(() => validate({ on: '2025-02-29' }, schema)).toThrow(ValidationError);
  });

  it('honours a lower bound', () => {
    const result = collect({ on: '2025-04-15', from: '2023-12-31' }, schema, { label: 'x' });
    expect(result.issues[0].message).toContain('not be before');
  });

  it('honours an upper bound', () => {
    const bounded = { on: date({ notAfter: '2025-01-01' }) };
    expect(() => validate({ on: '2025-06-01' }, bounded)).toThrow(ValidationError);
  });
});

describe('integer fields', () => {
  it('are a shorthand for a whole number', () => {
    const schema = { count: integer({ min: 0 }) };
    expect(validate({ count: 3 }, schema).count).toBe(3);
    expect(() => validate({ count: 3.5 }, schema)).toThrow(ValidationError);
  });
});

describe('describeSchema', () => {
  it('writes a line per field', () => {
    const lines = describeSchema({ id: string(), count: integer({ min: 1, optional: true }) });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('whole');
    expect(lines[1]).toContain('optional');
  });

  it('walks into a nested object and names the full path', () => {
    const lines = describeSchema({ contract: object({ rule: string() }) });
    expect(lines).toEqual(['contract.rule: string']);
  });

  it('says when a field has a default', () => {
    expect(describeSchema({ a: boolean({ default: false }) })[0]).toContain('has a default');
  });

  it('lists the values an enumerated field takes', () => {
    expect(describeSchema({ a: string({ oneOf: ['x', 'y'] }) })[0]).toContain('one of x, y');
  });
});
