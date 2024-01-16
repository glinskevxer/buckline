import { describe, expect, it } from 'vitest';
import {
  TRIM_POLICIES,
  hasWorkableTrim,
  nominalLengths,
  scalingLength,
} from '../../src/measure/length.js';

describe('scalingLength', () => {
  it('scales a twelve foot four inch stick as a twelve footer with four inches of trim', () => {
    const result = scalingLength(12 + 4 / 12);
    expect(result.nominalFt).toBe(12);
    expect(result.trimIn).toBeCloseTo(4, 6);
    expect(result.overlengthIn).toBe(0);
  });

  it('does not pay for the inches beyond the allowance', () => {
    const result = scalingLength(12 + 9 / 12);
    expect(result.nominalFt).toBe(12);
    expect(result.trimIn).toBe(4);
    expect(result.overlengthIn).toBeCloseTo(5, 6);
  });

  it('drops a stick an inch short of nominal to the next class down', () => {
    const result = scalingLength(12 - 1 / 12);
    expect(result.nominalFt).toBe(11);
  });

  it('scales a stick that is exactly nominal with no trim at all', () => {
    const result = scalingLength(10);
    expect(result.nominalFt).toBe(10);
    expect(result.trimIn).toBe(0);
  });

  it('allows six inches of trim on a sixteen footer', () => {
    const result = scalingLength(16 + 6 / 12);
    expect(result.nominalFt).toBe(16);
    expect(result.overlengthIn).toBe(0);
  });

  it('calls a stick under the shortest class unmerchantable', () => {
    const result = scalingLength(6);
    expect(result.merchantable).toBe(false);
    expect(result.nominalFt).toBe(0);
  });

  it('caps at the longest class the policy carries', () => {
    expect(scalingLength(24).nominalFt).toBe(16);
    expect(scalingLength(24).overlengthIn).toBeCloseTo(90, 6);
  });
});

describe('softwood policy', () => {
  it('rounds an eleven foot stick down to ten because odd lengths are not bought', () => {
    expect(scalingLength(11, { policy: 'softwood' }).nominalFt).toBe(10);
  });

  it('keeps eleven feet as eleven under the hardwood policy', () => {
    expect(scalingLength(11).nominalFt).toBe(11);
  });

  it('gives eight inches of trim at every length', () => {
    const result = scalingLength(12 + 7 / 12, { policy: 'softwood' });
    expect(result.trimIn).toBeCloseTo(7, 6);
    expect(result.overlengthIn).toBe(0);
  });

  it('reaches twenty feet, which the hardwood policy does not', () => {
    expect(scalingLength(20, { policy: 'softwood' }).nominalFt).toBe(20);
    expect(scalingLength(20).nominalFt).toBe(16);
  });
});

describe('tight policy', () => {
  it('starts charging overlength an inch sooner than the hardwood policy', () => {
    const over = 3.5 / 12;
    expect(scalingLength(12 + over, { policy: 'tight' }).overlengthIn).toBeCloseTo(0.5, 6);
    expect(scalingLength(12 + over).overlengthIn).toBe(0);
  });
});

describe('hasWorkableTrim', () => {
  it('rejects a stick cut dead on nominal', () => {
    expect(hasWorkableTrim(12)).toBe(false);
  });

  it('accepts a stick with three inches on it', () => {
    expect(hasWorkableTrim(12 + 3 / 12)).toBe(true);
  });

  it('rejects an unmerchantable stick outright', () => {
    expect(hasWorkableTrim(4)).toBe(false);
  });
});

describe('nominalLengths', () => {
  it('returns a copy so a caller cannot edit the policy', () => {
    const first = nominalLengths('softwood');
    first.push(99);
    expect(nominalLengths('softwood')).not.toContain(99);
  });

  it('rejects a policy nobody defined', () => {
    expect(() => nominalLengths('guesswork')).toThrow(RangeError);
    expect(() => scalingLength(12, { policy: 'guesswork' })).toThrow(RangeError);
  });

  it('lists every policy in ascending order', () => {
    for (const id of Object.keys(TRIM_POLICIES)) {
      const lengths = nominalLengths(id);
      const sorted = lengths.slice().sort((a, b) => a - b);
      expect(lengths).toEqual(sorted);
    }
  });
});

describe('input guards', () => {
  it('rejects lengths that are not positive finite numbers', () => {
    expect(() => scalingLength(0)).toThrow(RangeError);
    expect(() => scalingLength(-12)).toThrow(RangeError);
    expect(() => scalingLength('12')).toThrow(TypeError);
    expect(() => scalingLength(Infinity)).toThrow(TypeError);
  });
});
