import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import { makeBoard } from '../../../src/model/board.js';
import {
  LUMBER_GRADES,
  allowancesFor,
  cuttingCounts,
  dimensionsAllow,
  lumberSpec,
  requiredShare,
  requiredUnits,
} from '../../../src/grade/lumber/spec.js';

describe('lumberSpec', () => {
  it('knows every grade in the list', () => {
    for (const grade of LUMBER_GRADES) {
      expect(lumberSpec(grade).grade).toBe(grade);
    }
  });

  it('refuses a grade nobody sells', () => {
    expect(() => lumberSpec('4C')).toThrow(GradeError);
  });

  it('sends the back face of the one face grades to number one common', () => {
    expect(lumberSpec('F1F').backFace).toBe('1C');
    expect(lumberSpec('SEL').backFace).toBe('1C');
    expect(lumberSpec('FAS').backFace).toBeNull();
  });
});

describe('allowancesFor', () => {
  it('allows one cutting on a small FAS board and three on a big one', () => {
    expect(allowancesFor('FAS', 6)[0].maxCuttings).toBe(1);
    expect(allowancesFor('FAS', 12)[0].maxCuttings).toBe(2);
    expect(allowancesFor('FAS', 20)[0].maxCuttings).toBe(3);
  });

  it('gives FAS no second way through', () => {
    expect(allowancesFor('FAS', 6)).toHaveLength(1);
  });

  it('offers the common grades an extra cutting for a better yield', () => {
    const options = allowancesFor('1C', 6);
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ maxCuttings: 3, unitsPerSm: 8, extra: false });
    expect(options[1]).toMatchObject({ maxCuttings: 4, unitsPerSm: 10, extra: true });
  });

  it('makes the extra cutting cost more yield in every grade that offers it', () => {
    for (const grade of ['1C', '2AC']) {
      const [plain, extra] = allowancesFor(grade, 6);
      expect(extra.maxCuttings).toBe(plain.maxCuttings + 1);
      expect(extra.unitsPerSm).toBeGreaterThan(plain.unitsPerSm);
    }
  });

  it('sets no cutting limit at the bottom grade', () => {
    expect(allowancesFor('3AC', 6)[0].maxCuttings).toBeNull();
  });

  it('returns nothing when the surface measure is off the table', () => {
    expect(allowancesFor('FAS', 3)).toEqual([]);
    expect(allowancesFor('1C', 0)).toEqual([]);
  });
});

describe('requiredUnits', () => {
  it('scales with the board', () => {
    const [allowance] = allowancesFor('FAS', 10);
    expect(requiredUnits(10, allowance)).toBe(100);
    expect(requiredUnits(20, allowance)).toBe(200);
  });

  it('asks a common board for less', () => {
    const [fas] = allowancesFor('FAS', 10);
    const [common] = allowancesFor('1C', 10);
    expect(requiredUnits(10, common)).toBeLessThan(requiredUnits(10, fas));
  });

  it('turns the units into a share of the face', () => {
    expect(requiredShare(allowancesFor('FAS', 10)[0])).toBeCloseTo(10 / 12, 6);
    expect(requiredShare(allowancesFor('3AC', 10)[0])).toBeCloseTo(1 / 3, 6);
  });
});

describe('cuttingCounts', () => {
  it('takes either the wide short cutting or the narrow long one at FAS', () => {
    expect(cuttingCounts('FAS', 4, 5)).toBe(true);
    expect(cuttingCounts('FAS', 3, 7)).toBe(true);
  });

  it('refuses a cutting that meets neither pair', () => {
    expect(cuttingCounts('FAS', 3, 5)).toBe(false);
    expect(cuttingCounts('FAS', 4, 4)).toBe(false);
  });

  it('takes much smaller cuttings on the common grades', () => {
    expect(cuttingCounts('1C', 4, 2)).toBe(true);
    expect(cuttingCounts('FAS', 4, 2)).toBe(false);
  });

  it('takes a three by two at the bottom grades', () => {
    expect(cuttingCounts('2AC', 3, 2)).toBe(true);
    expect(cuttingCounts('3AC', 3, 2)).toBe(true);
    expect(cuttingCounts('2AC', 2.5, 2)).toBe(false);
  });
});

describe('dimensionsAllow', () => {
  const board = (widthIn, lengthFt) =>
    makeBoard({ id: 'B', species: 'red oak', thicknessIn: 1, widthIn, lengthFt });

  it('lets a wide long board be offered at FAS', () => {
    expect(dimensionsAllow('FAS', board(8, 12)).allowed).toBe(true);
  });

  it('refuses a narrow board at FAS and takes it at selects', () => {
    expect(dimensionsAllow('FAS', board(5, 12)).allowed).toBe(false);
    expect(dimensionsAllow('SEL', board(5, 12)).allowed).toBe(true);
  });

  it('refuses a short board at FAS and takes it at number one common', () => {
    expect(dimensionsAllow('FAS', board(8, 6)).allowed).toBe(false);
    expect(dimensionsAllow('1C', board(8, 6)).allowed).toBe(true);
  });

  it('refuses a board longer than the table goes', () => {
    expect(dimensionsAllow('FAS', board(8, 18)).reasons.join(' ')).toContain('maximum');
  });

  it('names every reason it refused', () => {
    expect(dimensionsAllow('FAS', board(3, 4)).reasons.length).toBeGreaterThan(1);
  });

  it('carries a surface measure floor that the width and length minimums already imply', () => {
    for (const grade of LUMBER_GRADES) {
      const spec = lumberSpec(grade);
      const smallest = board(spec.minWidthIn, spec.minLengthFt);
      expect(smallest.surfaceMeasure).toBeGreaterThanOrEqual(spec.minSurfaceMeasure);
    }
  });

  it('takes the smallest board each grade admits', () => {
    for (const grade of LUMBER_GRADES) {
      const spec = lumberSpec(grade);
      expect(dimensionsAllow(grade, board(spec.minWidthIn, spec.minLengthFt)).allowed).toBe(true);
    }
  });
});
