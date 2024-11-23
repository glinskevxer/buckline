import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import {
  blendedGrade,
  gradesBelow,
  gradesShort,
  reinspect,
  toleranceFor,
} from '../../../src/grade/lumber/reinspect.js';

function pieces(counts) {
  const out = [];
  let n = 0;
  for (const [grade, feet] of Object.entries(counts)) {
    n += 1;
    out.push({ id: `B-${n}`, grade: grade === 'none' ? null : grade, boardFeet: feet });
  }
  return out;
}

describe('gradesBelow', () => {
  it('lists what is under a grade', () => {
    expect(gradesBelow('SEL')).toEqual(['1C', '2AC', '3AC']);
  });

  it('lists nothing under the bottom grade', () => {
    expect(gradesBelow('3AC')).toEqual([]);
  });

  it('refuses a grade nobody sells', () => {
    expect(() => gradesBelow('F5')).toThrow(GradeError);
  });
});

describe('gradesShort', () => {
  it('is nothing when the piece made the grade', () => {
    expect(gradesShort('FAS', 'FAS')).toBe(0);
  });

  it('counts the steps down', () => {
    expect(gradesShort('FAS', 'F1F')).toBe(1);
    expect(gradesShort('FAS', '1C')).toBe(3);
  });

  it('is nothing when the piece beat the grade', () => {
    expect(gradesShort('1C', 'FAS')).toBe(0);
  });

  it('treats an ungraded piece as below everything', () => {
    expect(gradesShort('FAS', null)).toBe(6);
  });

  it('refuses a grade nobody sells', () => {
    expect(() => gradesShort('FAS', 'F5')).toThrow(GradeError);
  });
});

describe('toleranceFor', () => {
  it('allows less off grade on the top grades', () => {
    expect(toleranceFor('FAS').footageShare).toBeLessThan(toleranceFor('1C').footageShare);
  });

  it('allows more on green stock', () => {
    expect(toleranceFor('FAS', { green: true }).footageShare).toBeGreaterThan(
      toleranceFor('FAS').footageShare
    );
  });

  it('allows one grade down by default', () => {
    expect(toleranceFor('FAS').maxGradesShort).toBe(1);
  });

  it('refuses a grade with no tolerance written for it', () => {
    expect(() => toleranceFor('F5')).toThrow(GradeError);
  });
});

describe('reinspect', () => {
  it('holds a shipment that is nearly all on grade', () => {
    const result = reinspect('FAS', pieces({ FAS: 970, F1F: 30 }));
    expect(result.holds).toBe(true);
    expect(result.offGradeShare).toBeCloseTo(0.03, 3);
  });

  it('fails a shipment with too much off grade footage', () => {
    const result = reinspect('FAS', pieces({ FAS: 800, F1F: 200 }));
    expect(result.holds).toBe(false);
    expect(result.reasons.join(' ')).toContain('percent of the footage');
  });

  it('measures the tolerance on footage, not on pieces', () => {
    const wide = reinspect('FAS', [
      { id: 'a', grade: 'FAS', boardFeet: 100 },
      { id: 'b', grade: 'F1F', boardFeet: 900 },
    ]);
    expect(wide.pieces).toBe(2);
    expect(wide.holds).toBe(false);
  });

  it('fails a shipment with one piece two grades down even inside the footage tolerance', () => {
    const result = reinspect('FAS', pieces({ FAS: 990, SEL: 10 }));
    expect(result.offGradeShare).toBeLessThan(result.tolerance.footageShare);
    expect(result.holds).toBe(false);
    expect(result.reasons.join(' ')).toContain('grades below');
  });

  it('holds the same shipment when the buyer allows two grades down', () => {
    const result = reinspect('FAS', pieces({ FAS: 990, SEL: 10 }), { maxGradesShort: 2 });
    expect(result.holds).toBe(true);
  });

  it('holds a green shipment that a dry one would fail', () => {
    const load = pieces({ FAS: 935, F1F: 65 });
    expect(reinspect('FAS', load).holds).toBe(false);
    expect(reinspect('FAS', load, { green: true }).holds).toBe(true);
  });

  it('lists the off grade pieces with how far they fell', () => {
    const result = reinspect('FAS', pieces({ FAS: 900, F1F: 60, SEL: 40 }));
    expect(result.offGrade).toHaveLength(2);
    expect(result.worstGradesShort).toBe(2);
  });

  it('counts an ungraded piece as off grade', () => {
    const result = reinspect('FAS', pieces({ FAS: 900, none: 100 }));
    expect(result.offGradeBoardFeet).toBe(100);
  });

  it('refuses an empty reinspection', () => {
    expect(() => reinspect('FAS', [])).toThrow(GradeError);
  });
});

describe('blendedGrade', () => {
  const prices = { FAS: 1450, F1F: 1300, SEL: 1130, '1C': 800 };

  it('values the on grade footage at the sold price', () => {
    const result = reinspect('FAS', pieces({ FAS: 1000 }));
    const blend = blendedGrade(result, prices);
    expect(blend.blended).toBe(blend.asSold);
    expect(blend.allowance).toBe(0);
  });

  it('values the off grade footage at its own price', () => {
    const result = reinspect('FAS', pieces({ FAS: 900, '1C': 100 }));
    const blend = blendedGrade(result, prices);
    expect(blend.blended).toBeLessThan(blend.asSold);
    expect(blend.allowance).toBeCloseTo((100 / 1000) * (1450 - 800), 2);
  });

  it('reports the blended price per thousand', () => {
    const result = reinspect('FAS', pieces({ FAS: 900, '1C': 100 }));
    const blend = blendedGrade(result, prices);
    expect(blend.blendedPerMbf).toBeLessThan(1450);
    expect(blend.blendedPerMbf).toBeGreaterThan(800);
  });

  it('refuses to blend without a price for something it found', () => {
    const result = reinspect('FAS', pieces({ FAS: 900, '2AC': 100 }));
    expect(() => blendedGrade(result, prices)).toThrow(GradeError);
  });

  it('refuses to blend without a price for the sold grade', () => {
    const result = reinspect('FAS', pieces({ FAS: 1000 }));
    expect(() => blendedGrade(result, { '1C': 800 })).toThrow(GradeError);
  });
});
