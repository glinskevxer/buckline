import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import { makeLog } from '../../../src/model/log.js';
import {
  TIE_SIZES,
  diagonalIn,
  tieGrade,
  veneerGrade,
} from '../../../src/grade/log/construction.js';

function log(species, axis, lengthFt, defects = [], extra = {}) {
  return makeLog({
    id: 'L-1',
    species,
    position: 'butt',
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
    defects,
    ...extra,
  });
}

describe('veneerGrade', () => {
  it('takes a big clean walnut butt', () => {
    const result = veneerGrade(log('black walnut', 22, 12));
    expect(result.grade).toBe('veneer');
    expect(result.clearFaces).toEqual([0, 1, 2, 3]);
  });

  it('refuses a species nobody peels', () => {
    const result = veneerGrade(log('yellow poplar', 22, 12));
    expect(result.grade).toBeNull();
    expect(result.reasons.join(' ')).toContain('not a veneer species');
  });

  it('refuses a log under the diameter floor', () => {
    expect(veneerGrade(log('black cherry', 14, 12)).reasons.join(' ')).toContain('veneer floor');
  });

  it('lets one small defect ruin the face it is on', () => {
    const result = veneerGrade(
      log('black walnut', 22, 12, [{ type: 'sound knot', faceIndex: 0, startFt: 5, lengthFt: 0.2 }])
    );
    expect(result.clearFaces).toEqual([1, 2, 3]);
    expect(result.grade).toBe('veneer');
  });

  it('refuses once a second face is marked', () => {
    const result = veneerGrade(
      log('black walnut', 22, 12, [
        { type: 'sound knot', faceIndex: 0, startFt: 5, lengthFt: 0.2 },
        { type: 'sound knot', faceIndex: 1, startFt: 5, lengthFt: 0.2 },
      ])
    );
    expect(result.grade).toBeNull();
    expect(result.reasons.join(' ')).toContain('entirely clear faces');
  });

  it('refuses a log with ring shake however clean the faces are', () => {
    const result = veneerGrade(log('black walnut', 22, 12, [{ type: 'ring shake' }]));
    expect(result.grade).toBeNull();
    expect(result.reasons.join(' ')).toContain('out of the veneer market');
  });

  it('allows an inch of sweep and no more', () => {
    expect(veneerGrade(log('black walnut', 22, 12, [{ type: 'sweep', depthIn: 1 }])).grade).toBe(
      'veneer'
    );
    expect(
      veneerGrade(log('black walnut', 22, 12, [{ type: 'sweep', depthIn: 1.5 }])).grade
    ).toBeNull();
  });
});

describe('diagonalIn', () => {
  it('measures the corner to corner of a seven by nine', () => {
    expect(diagonalIn({ thicknessIn: 7, widthIn: 9 })).toBeCloseTo(11.402, 3);
  });
});

describe('tieGrade', () => {
  it('takes the biggest tie that fits', () => {
    const result = tieGrade(log('white oak', 17, 10));
    expect(result.workingDiameterIn).toBe(15);
    expect(result.grade).toBe('grade 5 tie');
  });

  it('drops to a smaller tie when sweep eats the diameter', () => {
    const swept = log('white oak', 17, 10, [{ type: 'sweep', depthIn: 4 }]);
    const result = tieGrade(swept);
    expect(result.sweepDeductedIn).toBe(4);
    expect(result.workingDiameterIn).toBe(11);
    expect(result.grade).toBe('grade 4 tie');
  });

  it('drops again on half an inch more of sweep', () => {
    const swept = log('white oak', 17, 10, [{ type: 'sweep', depthIn: 4.5 }]);
    expect(tieGrade(swept).grade).toBe('grade 3 tie');
  });

  it('finds nothing when sweep takes too much', () => {
    const swept = log('white oak', 17, 10, [{ type: 'sweep', depthIn: 6 }]);
    const result = tieGrade(swept);
    expect(result.grade).toBeNull();
    expect(result.reasons.join(' ')).toContain('working diameter');
  });

  it('refuses a log with unsound wood in the heart', () => {
    const rotten = log('white oak', 20, 10, [{ type: 'heart rot', widthIn: 4, depthIn: 4 }]);
    expect(tieGrade(rotten).grade).toBeNull();
    expect(tieGrade(rotten).reasons.join(' ')).toContain('unsound wood in the heart');
  });

  it('ignores a shell fault, which never reaches the tie', () => {
    const shelled = log('white oak', 20, 10, [{ type: 'sap rot', depthIn: 1 }]);
    expect(shelled.defects).toHaveLength(1);
    expect(tieGrade(shelled).grade).toBe('grade 5 tie');
  });

  it('refuses a switch tie on a short log', () => {
    const result = tieGrade(log('white oak', 22, 10));
    expect(result.candidates).not.toContain('switch tie');
    expect(tieGrade(log('white oak', 22, 12)).candidates).toContain('switch tie');
  });

  it('sorts the candidates by area', () => {
    const result = tieGrade(log('white oak', 22, 12));
    expect(result.candidates).toEqual(['grade 5 tie', 'switch tie', 'grade 4 tie', 'grade 3 tie']);
  });

  it('can be given a different size list', () => {
    const result = tieGrade(log('white oak', 17, 10), {
      sizes: [{ name: 'bridge timber', thicknessIn: 12, widthIn: 12, minLengthFt: 8 }],
    });
    expect(result.grade).toBeNull();
  });

  it('refuses an empty size list', () => {
    expect(() => tieGrade(log('white oak', 20, 10), { sizes: [] })).toThrow(GradeError);
  });

  it('publishes the standard sizes largest first by area', () => {
    expect(TIE_SIZES[0].name).toBe('grade 5 tie');
  });
});

describe('the reasons veneer refuses', () => {
  it('never stops at the first one', () => {
    const result = veneerGrade(
      log('yellow poplar', 12, 6, [{ type: 'ring shake' }, { type: 'sweep', depthIn: 4 }])
    );
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('says nothing when the log makes it', () => {
    expect(veneerGrade(log('black walnut', 22, 12)).reasons).toEqual([]);
  });

  it('reads the sweep limit only when there is sweep', () => {
    const result = veneerGrade(log('black walnut', 22, 12));
    expect(result.reasons.join(' ')).not.toContain('sweep');
  });

  it('lists every excluded defect the log carries', () => {
    const result = veneerGrade(
      log('black walnut', 22, 12, [{ type: 'ring shake' }, { type: 'metal in log' }])
    );
    expect(result.reasons.filter((line) => line.includes('veneer market'))).toHaveLength(2);
  });
});
