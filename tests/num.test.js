import { describe, expect, it } from 'vitest';
import { ScaleError } from '../src/errors.js';
import {
  clamp,
  requireFinite,
  requireNonNegative,
  requirePositive,
  round,
  round1,
  round2,
  round3,
  round4,
  sum,
} from '../src/num.js';

describe('round', () => {
  it('rounds to the places asked for', () => {
    expect(round(1.23456, 0)).toBe(1);
    expect(round1(1.25)).toBe(1.3);
    expect(round2(1.23456)).toBe(1.23);
    expect(round3(1.23456)).toBe(1.235);
    expect(round4(1.23456)).toBe(1.2346);
  });

  it('leaves a whole number alone', () => {
    expect(round3(144)).toBe(144);
  });

  it('handles negatives the same way', () => {
    expect(round1(-1.24)).toBe(-1.2);
  });
});

describe('sum', () => {
  it('rounds once at the end rather than per entry', () => {
    expect(sum([0.04, 0.04, 0.04])).toBe(0.1);
  });

  it('totals an empty list at zero', () => {
    expect(sum([])).toBe(0);
  });

  it('can be asked for more places', () => {
    expect(sum([1 / 3, 1 / 3, 1 / 3], 4)).toBe(1);
  });
});

describe('clamp', () => {
  it('holds a value inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('guards', () => {
  it('throw the plain errors by default', () => {
    expect(() => requireFinite('a', '1')).toThrow(TypeError);
    expect(() => requireNonNegative('a', -1)).toThrow(RangeError);
    expect(() => requirePositive('a', 0)).toThrow(RangeError);
  });

  it('return the value when it passes', () => {
    expect(requireFinite('a', 3)).toBe(3);
    expect(requireNonNegative('a', 0)).toBe(0);
    expect(requirePositive('a', 3)).toBe(3);
  });

  it('use a wrapper when one is given', () => {
    const wrap = (message, path) => new ScaleError(message, { path });
    expect(() => requireNonNegative('depthIn', -2, { wrap })).toThrow(ScaleError);
    try {
      requireNonNegative('depthIn', -2, { wrap });
    } catch (error) {
      expect(error.path).toBe('depthIn');
      expect(error.message).toContain('must not be negative');
    }
  });

  it('reject NaN and infinity as not finite', () => {
    expect(() => requireFinite('a', NaN)).toThrow(TypeError);
    expect(() => requireFinite('a', Infinity)).toThrow(TypeError);
  });
});
