/**
 * Number handling shared by everything.
 *
 * Rounding is a policy decision in this program and it kept getting made
 * independently in a dozen files, which is how a ticket total came to disagree
 * with the sum of its own lines by a tenth of a board foot. There is one place
 * for it now.
 *
 * The guards take an optional `wrap`, because a bad number means different
 * things in different layers. A negative diameter handed to a log rule is a
 * programmer mistake and deserves a RangeError. The same number arriving off a
 * scale ticket is bad input and deserves a ScaleError with a path on it.
 */

/** Rounds to a fixed number of decimal places. */
export function round(value, places = 0) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export const round1 = (value) => round(value, 1);
export const round2 = (value) => round(value, 2);
export const round3 = (value) => round(value, 3);
export const round4 = (value) => round(value, 4);

/** Totals a list and rounds once at the end, never per entry. */
export function sum(values, places = 1) {
  return round(
    values.reduce((total, value) => total + value, 0),
    places
  );
}

/** Holds a value inside a range. */
export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

export function requireFinite(name, value, options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw fail(options.wrap, TypeError, `${name} must be a finite number`, name);
  }
  return value;
}

export function requireNonNegative(name, value, options = {}) {
  requireFinite(name, value, options);
  if (value < 0) {
    throw fail(options.wrap, RangeError, `${name} must not be negative, got ${value}`, name);
  }
  return value;
}

export function requirePositive(name, value, options = {}) {
  requireFinite(name, value, options);
  if (value <= 0) {
    throw fail(options.wrap, RangeError, `${name} must be greater than zero, got ${value}`, name);
  }
  return value;
}

function fail(wrap, Fallback, message, name) {
  return wrap ? wrap(message, name) : new Fallback(message);
}
