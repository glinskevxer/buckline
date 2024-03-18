import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../../src/errors.js';
import {
  SWEEP_ALLOWANCES,
  crookLengthFt,
  sweepIsFree,
  sweepShare,
  worseOf,
} from '../../../src/scale/defect/sweep.js';

describe('quarter diameter allowance', () => {
  it('forgives a bend up to a quarter of the diameter', () => {
    expect(sweepIsFree(16, 16, 4)).toBe(true);
    expect(sweepIsFree(16, 16, 3.9)).toBe(true);
  });

  it('charges only the departure past the allowance', () => {
    const result = sweepShare(16, 16, 6);
    expect(result.chargeableRatio).toBeCloseTo(2 / 16, 4);
    expect(result.share).toBeCloseTo(0.125, 4);
  });

  it('allows a bigger absolute bend on a bigger log', () => {
    expect(sweepIsFree(24, 16, 5)).toBe(true);
    expect(sweepIsFree(12, 16, 5)).toBe(false);
  });

  it('prorates by how much of the log is swept', () => {
    const whole = sweepShare(16, 16, 6);
    const half = sweepShare(16, 16, 6, { sweptLengthFt: 8 });
    expect(half.share).toBeCloseTo(whole.share / 2, 4);
  });

  it('never charges more than the whole log', () => {
    expect(sweepShare(10, 16, 40).share).toBe(1);
  });
});

describe('flat allowance', () => {
  it('forgives three tenths of the departure ratio at any size', () => {
    expect(sweepIsFree(16, 16, 4.8, { allowance: 'flat' })).toBe(true);
    expect(sweepIsFree(24, 16, 7.2, { allowance: 'flat' })).toBe(true);
  });

  it('is harder on a large log than the quarter convention', () => {
    const quarter = sweepShare(30, 16, 10, { allowance: 'quarter' });
    const flat = sweepShare(30, 16, 10, { allowance: 'flat' });
    expect(flat.share).toBeLessThan(quarter.share);
  });

  it('is easier on a small log than the quarter convention', () => {
    const quarter = sweepShare(10, 16, 4, { allowance: 'quarter' });
    const flat = sweepShare(10, 16, 4, { allowance: 'flat' });
    expect(flat.share).toBeLessThan(quarter.share);
  });
});

describe('no allowance', () => {
  it('charges the whole departure ratio', () => {
    expect(sweepShare(16, 16, 2, { allowance: 'none' }).share).toBeCloseTo(0.125, 4);
  });

  it('still charges nothing on a straight log', () => {
    expect(sweepShare(16, 16, 0, { allowance: 'none' }).share).toBe(0);
  });
});

describe('allowance registry', () => {
  it('keys every entry by its id', () => {
    for (const [key, value] of Object.entries(SWEEP_ALLOWANCES)) {
      expect(value.id).toBe(key);
    }
  });

  it('rejects an allowance nobody wrote into the contract', () => {
    expect(() => sweepShare(16, 16, 4, { allowance: 'generous' })).toThrow(ScaleError);
  });
});

describe('guards', () => {
  it('refuses a swept length longer than the log', () => {
    expect(() => sweepShare(16, 16, 4, { sweptLengthFt: 20 })).toThrow(ScaleError);
  });

  it('refuses a zero diameter or length', () => {
    expect(() => sweepShare(0, 16, 4)).toThrow(ScaleError);
    expect(() => sweepShare(16, 0, 4)).toThrow(ScaleError);
  });

  it('refuses a negative departure', () => {
    expect(() => sweepShare(16, 16, -1)).toThrow(ScaleError);
  });
});

describe('crookLengthFt', () => {
  it('ignores a bend the mill would not notice', () => {
    expect(crookLengthFt(0.25)).toBe(0);
  });

  it('takes a foot per inch of offset, rounded up', () => {
    expect(crookLengthFt(2)).toBe(2);
    expect(crookLengthFt(2.1)).toBe(3);
  });

  it('can be told the run is longer than a foot per inch', () => {
    expect(crookLengthFt(2, { runPerInchFt: 1.5 })).toBe(3);
  });

  it('refuses a negative offset', () => {
    expect(() => crookLengthFt(-1)).toThrow(ScaleError);
  });
});

describe('worseOf', () => {
  it('takes whichever deduction is larger', () => {
    expect(worseOf(30, 12)).toEqual({ taken: 'sweep', boardFeet: 30 });
    expect(worseOf(10, 40)).toEqual({ taken: 'crook', boardFeet: 40 });
  });

  it('prefers sweep on a tie', () => {
    expect(worseOf(20, 20).taken).toBe('sweep');
  });

  it('refuses negative board feet', () => {
    expect(() => worseOf(-1, 10)).toThrow(ScaleError);
  });
});
