import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import {
  CHUCK_CORE_IN,
  VENEER_THICKNESSES,
  coreLossShare,
  gradeSplit,
  roundUpDiameter,
  veneerArea,
  veneerValue,
  yieldByGrade,
} from '../../../src/grade/log/veneer-yield.js';

const bolt = { diameterIn: 20, lengthIn: 102 };

describe('roundUpDiameter', () => {
  it('takes the out of round off the diameter', () => {
    expect(roundUpDiameter(20, 2)).toBe(18);
  });

  it('takes nothing off a round log', () => {
    expect(roundUpDiameter(20, 0)).toBe(20);
  });

  it('never goes under the core', () => {
    expect(roundUpDiameter(20, 30)).toBe(CHUCK_CORE_IN);
  });

  it('refuses nonsense measurements', () => {
    expect(() => roundUpDiameter(0, 1)).toThrow(GradeError);
    expect(() => roundUpDiameter(20, -1)).toThrow(GradeError);
  });
});

describe('veneerArea', () => {
  it('yields more from a bigger bolt', () => {
    expect(veneerArea({ ...bolt, diameterIn: 30 }).squareFeet).toBeGreaterThan(
      veneerArea(bolt).squareFeet
    );
  });

  it('yields more at a thinner cut', () => {
    expect(veneerArea(bolt, { thicknessIn: 1 / 32 }).squareFeet).toBeGreaterThan(
      veneerArea(bolt, { thicknessIn: 1 / 10 }).squareFeet
    );
  });

  it('yields exactly in inverse proportion to the thickness', () => {
    const thin = veneerArea(bolt, { thicknessIn: 1 / 40 }).squareFeet;
    const thick = veneerArea(bolt, { thicknessIn: 1 / 20 }).squareFeet;
    expect(thin).toBeCloseTo(thick * 2, 0);
  });

  it('loses yield to a log that is out of round', () => {
    expect(veneerArea(bolt, { outOfRoundIn: 3 }).squareFeet).toBeLessThan(
      veneerArea(bolt).squareFeet
    );
  });

  it('yields nothing once there is nothing outside the core', () => {
    const result = veneerArea({ diameterIn: 3, lengthIn: 102 });
    expect(result.squareFeet).toBe(0);
    expect(result.reason).toContain('outside the core');
  });

  it('refuses a thickness of nothing or a core the chucks cannot hold', () => {
    expect(() => veneerArea(bolt, { thicknessIn: 0 })).toThrow(GradeError);
    expect(() => veneerArea(bolt, { coreIn: 1 })).toThrow(GradeError);
  });

  it('reports a ribbon length as well as an area', () => {
    expect(veneerArea(bolt).ribbonFeet).toBeGreaterThan(0);
  });

  it('lists the thicknesses the lathe runs', () => {
    expect(VENEER_THICKNESSES).toContain(1 / 16);
  });
});

describe('coreLossShare', () => {
  it('loses far more of a small bolt than a big one', () => {
    expect(coreLossShare(10)).toBeGreaterThan(coreLossShare(30));
  });

  it('falls with the square of the diameter', () => {
    expect(coreLossShare(10)).toBeCloseTo(coreLossShare(20) * 4, 3);
  });

  it('loses everything when the bolt is the core', () => {
    expect(coreLossShare(3)).toBe(1);
  });

  it('refuses a bolt with no diameter', () => {
    expect(() => coreLossShare(0)).toThrow(GradeError);
  });
});

describe('gradeSplit', () => {
  it('gives most of the peel to face grade on a clean bolt', () => {
    expect(gradeSplit(bolt, { clearFaces: 4 }).face).toBeGreaterThan(0.8);
  });

  it('gives none to face grade on a bolt with no clear faces', () => {
    expect(gradeSplit(bolt, { clearFaces: 0 }).face).toBe(0);
  });

  it('moves with the number of clear faces', () => {
    const two = gradeSplit(bolt, { clearFaces: 2 }).face;
    const three = gradeSplit(bolt, { clearFaces: 3 }).face;
    expect(three).toBeGreaterThan(two);
  });

  it('always splits the whole peel', () => {
    for (const clearFaces of [0, 1, 2, 3, 4]) {
      const split = gradeSplit(bolt, { clearFaces });
      expect(split.face + split.back).toBeCloseTo(1, 4);
    }
  });

  it('gives everything to the core when nothing is outside it', () => {
    expect(gradeSplit({ diameterIn: 3, lengthIn: 102 }).core).toBe(1);
  });

  it('refuses more than four clear faces', () => {
    expect(() => gradeSplit(bolt, { clearFaces: 5 })).toThrow(GradeError);
  });
});

describe('yieldByGrade', () => {
  it('splits the area between the two grades', () => {
    const result = yieldByGrade(bolt, { clearFaces: 3 });
    expect(result.faceSquareFeet + result.backSquareFeet).toBeCloseTo(result.squareFeet, 1);
  });

  it('yields no face grade off a bolt with no clear faces', () => {
    expect(yieldByGrade(bolt, { clearFaces: 0 }).faceSquareFeet).toBe(0);
  });
});

describe('veneerValue', () => {
  const prices = { facePerMsf: 2200, backPerMsf: 620 };

  it('prices the two grades separately', () => {
    const result = veneerValue(bolt, prices, { clearFaces: 3 });
    expect(result.faceValue).toBeGreaterThan(result.backValue);
    expect(result.value).toBeCloseTo(result.faceValue + result.backValue, 2);
  });

  it('is worth far more off a big clean bolt', () => {
    const big = veneerValue({ ...bolt, diameterIn: 30 }, prices, { clearFaces: 4 });
    const small = veneerValue({ ...bolt, diameterIn: 14 }, prices, { clearFaces: 1 });
    expect(big.value).toBeGreaterThan(small.value * 3);
  });

  it('is worth nothing with no prices to hand', () => {
    expect(veneerValue(bolt, {}).value).toBe(0);
  });
});
