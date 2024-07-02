/**
 * A very small shape checker.
 *
 * The program reads scale tickets and contracts off disk, so it needs to say
 * no to bad input clearly and in one place. A dependency would do this, but
 * the rules here are narrow enough that a hundred lines covers them and the
 * error paths come out exactly the way the reports want them.
 *
 * A schema is a plain object. Every value is either a field descriptor or a
 * nested schema.
 */

import { ValidationError } from '../errors.js';

/** Builds a field descriptor. */
export function field(type, options = {}) {
  return { kind: 'field', type, ...options };
}

export const number = (options = {}) => field('number', options);
export const string = (options = {}) => field('string', options);
export const boolean = (options = {}) => field('boolean', options);
export const list = (of, options = {}) => field('array', { of, ...options });
export const object = (shape, options = {}) => field('object', { shape, ...options });

/**
 * Validates `value` against `schema` and returns a new object holding only the
 * declared fields, with defaults filled in. Throws a ValidationError carrying
 * every issue found, not just the first, because a scaler retyping a ticket
 * wants the whole list.
 */
export function validate(value, schema, options = {}) {
  const { label = 'input' } = options;
  const issues = [];
  const out = walkObject(value, schema, label, issues);
  if (issues.length > 0) {
    const summary = issues.map((i) => `${i.path} ${i.message}`).join('; ');
    throw new ValidationError(`${label} is not valid: ${summary}`, {
      path: label,
      issues,
    });
  }
  return out;
}

/** Same checks, but returns the issues instead of throwing. */
export function collect(value, schema, options = {}) {
  try {
    return { ok: true, value: validate(value, schema, options), issues: [] };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, value: null, issues: error.issues };
    }
    throw error;
  }
}

function walkObject(value, shape, path, issues) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push({ path, message: 'must be an object' });
    return null;
  }
  const out = {};
  for (const [key, descriptor] of Object.entries(shape)) {
    const child = `${path}.${key}`;
    const present = Object.prototype.hasOwnProperty.call(value, key);
    const raw = present ? value[key] : undefined;
    if (raw === undefined || raw === null) {
      if (descriptor.default !== undefined) {
        out[key] =
          typeof descriptor.default === 'function' ? descriptor.default() : descriptor.default;
      } else if (descriptor.optional) {
        continue;
      } else {
        issues.push({ path: child, message: 'is required' });
      }
      continue;
    }
    const checked = checkField(raw, descriptor, child, issues);
    if (checked !== undefined) {
      out[key] = checked;
    }
  }
  return out;
}

function checkField(raw, descriptor, path, issues) {
  switch (descriptor.type) {
    case 'number':
      return checkNumber(raw, descriptor, path, issues);
    case 'string':
      return checkString(raw, descriptor, path, issues);
    case 'boolean':
      if (typeof raw !== 'boolean') {
        issues.push({ path, message: 'must be true or false' });
        return undefined;
      }
      return raw;
    case 'array':
      return checkArray(raw, descriptor, path, issues);
    case 'object':
      return walkObject(raw, descriptor.shape, path, issues);
    default:
      issues.push({ path, message: `has unknown declared type ${descriptor.type}` });
      return undefined;
  }
}

function checkNumber(raw, descriptor, path, issues) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    issues.push({ path, message: 'must be a finite number' });
    return undefined;
  }
  if (descriptor.integer && !Number.isInteger(raw)) {
    issues.push({ path, message: 'must be a whole number' });
    return undefined;
  }
  if (descriptor.min !== undefined && raw < descriptor.min) {
    issues.push({ path, message: `must be at least ${descriptor.min}` });
    return undefined;
  }
  if (descriptor.max !== undefined && raw > descriptor.max) {
    issues.push({ path, message: `must be at most ${descriptor.max}` });
    return undefined;
  }
  return raw;
}

function checkString(raw, descriptor, path, issues) {
  if (typeof raw !== 'string') {
    issues.push({ path, message: 'must be text' });
    return undefined;
  }
  const value = descriptor.trim === false ? raw : raw.trim();
  if (descriptor.nonEmpty !== false && value.length === 0) {
    issues.push({ path, message: 'must not be empty' });
    return undefined;
  }
  if (descriptor.oneOf && !descriptor.oneOf.includes(value)) {
    issues.push({ path, message: `must be one of ${descriptor.oneOf.join(', ')}` });
    return undefined;
  }
  return value;
}

function checkArray(raw, descriptor, path, issues) {
  if (!Array.isArray(raw)) {
    issues.push({ path, message: 'must be a list' });
    return undefined;
  }
  if (descriptor.minLength !== undefined && raw.length < descriptor.minLength) {
    issues.push({ path, message: `must hold at least ${descriptor.minLength} entries` });
    return undefined;
  }
  const out = [];
  raw.forEach((entry, index) => {
    const checked = checkField(entry, descriptor.of, `${path}[${index}]`, issues);
    if (checked !== undefined) out.push(checked);
  });
  return out;
}
