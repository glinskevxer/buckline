import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../../src/errors.js';
import {
  METHODS,
  SQUARED_DIVISOR,
  diameterDeduction,
  lengthDeduction,
  percentageDeduction,
  squaredDeduction,
} from '../../../src/scale/defect/methods.js';

describe('lengthDeduction', () => {
  it('cuts the affected length out and rescales the rest', () => {
    const result = lengthDeduction('doyle', 16, 16, 4);
    expect(result.detail.remainingLengthFt).toBe(12);
    expect(result.netBoardFeet).toBeCloseTo(108, 3);
    expect(result.deductionBoardFeet).toBeCloseTo(36, 3);
  });

  it('rounds a part foot up to the whole foot', () => {
    expect(lengthDeduction('doyle', 16, 16, 2.1).detail.affectedFt).toBe(3);
    expect(lengthDeduction('doyle', 16, 16, 3).detail.affectedFt).toBe(3);
  });

  it('costs a different number of board feet under a different rule', () => {
    const doyle = lengthDeduction('doyle', 16, 16, 4).deductionBoardFeet;
    const international = lengthDeduction('international', 16, 16, 4).deductionBoardFeet;
    expect(international).not.toBeCloseTo(doyle, 1);
  });

  it('takes more per foot off the butt end under a segment rule', () => {
    const result = lengthDeduction('international', 16, 16, 4);
    expect(result.deductionBoardFeet).toBeGreaterThan(result.grossBoardFeet / 4);
  });

  it('leaves nothing when the whole log is affected', () => {
    expect(lengthDeduction('doyle', 16, 16, 16).netBoardFeet).toBe(0);
  });

  it('does not go negative when the fault runs longer than the log', () => {
    expect(lengthDeduction('doyle', 16, 16, 40).netBoardFeet).toBe(0);
  });

  it('refuses a negative length', () => {
    expect(() => lengthDeduction('doyle', 16, 16, -2)).toThrow(ScaleError);
  });
});

describe('diameterDeduction', () => {
  it('takes the shell off both sides', () => {
    const result = diameterDeduction('doyle', 16, 16, 2);
    expect(result.detail.soundDiameterIn).toBe(12);
    expect(result.netBoardFeet).toBeCloseTo(64, 3);
  });

  it('deducts nothing for a zero shell', () => {
    expect(diameterDeduction('doyle', 16, 16, 0).deductionBoardFeet).toBe(0);
  });

  it('bottoms out at nothing rather than a negative diameter', () => {
    expect(diameterDeduction('doyle', 16, 16, 12).netBoardFeet).toBe(0);
  });

  it('drops a scribner log to the next table class down', () => {
    const result = diameterDeduction('scribner', 16, 16, 0.5);
    expect(result.detail.soundDiameterIn).toBe(15);
    expect(result.netBoardFeet).toBe(140);
  });
});

describe('squaredDeduction', () => {
  const defect = { widthIn: 6, depthIn: 5, lengthFt: 4 };

  it('follows the squared defect formula', () => {
    const result = squaredDeduction('doyle', 20, 16, defect);
    expect(result.deductionBoardFeet).toBeCloseTo((6 * 5 * 4) / SQUARED_DIVISOR, 3);
  });

  it('produces the same block of wood under any rule', () => {
    const a = squaredDeduction('doyle', 20, 16, defect).deductionBoardFeet;
    const b = squaredDeduction('international', 20, 16, defect).deductionBoardFeet;
    expect(a).toBe(b);
  });

  it('costs a bigger share of a doyle scale than of an international one', () => {
    const doyle = squaredDeduction('doyle', 12, 16, defect);
    const international = squaredDeduction('international', 12, 16, defect);
    const doyleShare = doyle.deductionBoardFeet / doyle.grossBoardFeet;
    const intShare = international.deductionBoardFeet / international.grossBoardFeet;
    expect(doyleShare).toBeGreaterThan(intShare);
  });

  it('never deducts more than the log holds', () => {
    const huge = { widthIn: 20, depthIn: 20, lengthFt: 16 };
    const result = squaredDeduction('doyle', 12, 16, huge);
    expect(result.netBoardFeet).toBe(0);
    expect(result.detail.capped).toBe(true);
  });

  it('treats a missing dimension as zero', () => {
    expect(squaredDeduction('doyle', 20, 16, {}).deductionBoardFeet).toBe(0);
  });

  it('refuses a negative dimension', () => {
    expect(() => squaredDeduction('doyle', 20, 16, { widthIn: -1 })).toThrow(ScaleError);
  });
});

describe('percentageDeduction', () => {
  it('takes the stated share off the gross', () => {
    const result = percentageDeduction('doyle', 16, 16, 0.25);
    expect(result.deductionBoardFeet).toBeCloseTo(36, 3);
    expect(result.netBoardFeet).toBeCloseTo(108, 3);
  });

  it('takes nothing at zero and everything at one', () => {
    expect(percentageDeduction('doyle', 16, 16, 0).deductionBoardFeet).toBe(0);
    expect(percentageDeduction('doyle', 16, 16, 1).netBoardFeet).toBe(0);
  });

  it('refuses a share over one or under zero', () => {
    expect(() => percentageDeduction('doyle', 16, 16, 1.5)).toThrow(ScaleError);
    expect(() => percentageDeduction('doyle', 16, 16, -0.1)).toThrow(ScaleError);
  });
});

describe('METHODS', () => {
  it('holds all four under their own names', () => {
    expect(Object.keys(METHODS).sort()).toEqual(['diameter', 'length', 'percentage', 'squared']);
  });

  it('gives every method the same result shape', () => {
    const results = [
      lengthDeduction('doyle', 16, 16, 2),
      diameterDeduction('doyle', 16, 16, 1),
      squaredDeduction('doyle', 16, 16, { widthIn: 4, depthIn: 4, lengthFt: 2 }),
      percentageDeduction('doyle', 16, 16, 0.1),
    ];
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual([
        'deductionBoardFeet',
        'detail',
        'grossBoardFeet',
        'method',
        'netBoardFeet',
      ]);
      expect(result.grossBoardFeet - result.deductionBoardFeet).toBeCloseTo(result.netBoardFeet, 3);
    }
  });
});
