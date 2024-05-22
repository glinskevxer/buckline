import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import {
  gradeForKnots,
  gradeForSlope,
  gradeForSplit,
  gradeForWane,
  gradePiece,
  gradeWithout,
  slopeRunFrom,
  waneShareOf,
} from '../../../src/grade/softwood/structural.js';

describe('gradeForSlope', () => {
  it('takes one in twelve at the top grade', () => {
    expect(gradeForSlope(12)).toBe('SS');
    expect(gradeForSlope(20)).toBe('SS');
  });

  it('drops a grade as the slope steepens', () => {
    expect(gradeForSlope(11)).toBe('No1');
    expect(gradeForSlope(9)).toBe('No2');
    expect(gradeForSlope(5)).toBe('No3');
  });

  it('gives no grade at all to grain running off the piece', () => {
    expect(gradeForSlope(3)).toBeNull();
  });

  it('refuses a run that is not a positive number', () => {
    expect(() => gradeForSlope(0)).toThrow(GradeError);
    expect(() => gradeForSlope('12')).toThrow(GradeError);
  });
});

describe('gradeForWane', () => {
  it('takes a quarter at the top two grades', () => {
    expect(gradeForWane(0.25)).toBe('SS');
    expect(gradeForWane(0.3)).toBe('No2');
  });

  it('gives no grade to a piece that is mostly missing', () => {
    expect(gradeForWane(0.8)).toBeNull();
  });

  it('refuses a negative share', () => {
    expect(() => gradeForWane(-0.1)).toThrow(GradeError);
  });
});

describe('gradeForSplit', () => {
  it('allows a longer split on a wider piece', () => {
    expect(gradeForSplit(3.5, 3.5)).toBe('SS');
    expect(gradeForSplit(3.5, 9.25)).toBe('SS');
    expect(gradeForSplit(9, 3.5)).toBe('No3');
  });

  it('gives no grade to a piece split end to end', () => {
    expect(gradeForSplit(48, 3.5)).toBeNull();
  });

  it('refuses nonsense measurements', () => {
    expect(() => gradeForSplit(-1, 3.5)).toThrow(GradeError);
    expect(() => gradeForSplit(3, 0)).toThrow(GradeError);
  });
});

describe('gradeForKnots', () => {
  it('gives the top grade to a clean piece', () => {
    expect(gradeForKnots([], 3.5)).toBe('SS');
  });

  it('drops the grade for a knot at the edge', () => {
    expect(gradeForKnots([{ fromEdgeIn: 0, sizeIn: 1 }], 3.5)).toBe('No1');
  });

  it('holds the grade for the same knot in the middle', () => {
    expect(gradeForKnots([{ fromEdgeIn: 1, sizeIn: 1 }], 3.5)).toBe('SS');
  });

  it('gives no grade when nothing will take the knot', () => {
    expect(gradeForKnots([{ fromEdgeIn: 0, sizeIn: 3.4 }], 3.5)).toBeNull();
  });

  it('lets a cluster pull the grade down on its own', () => {
    const clustered = [
      { fromEdgeIn: 1, sizeIn: 1.1, atFt: 3 },
      { fromEdgeIn: 1, sizeIn: 1.1, atFt: 3.2 },
    ];
    expect(gradeForKnots([clustered[0]], 3.5)).toBe('SS');
    expect(gradeForKnots(clustered, 3.5)).not.toBe('SS');
  });
});

describe('gradePiece', () => {
  it('gives the top grade to a clean piece', () => {
    const result = gradePiece({ widthIn: 3.5 });
    expect(result.grade).toBe('SS');
    expect(result.economyOnly).toBe(false);
  });

  it('takes the worst reading rather than an average', () => {
    const result = gradePiece({ widthIn: 3.5, slopeRun: 5 });
    expect(result.grade).toBe('No3');
    expect(result.governedBy).toEqual(['slope of grain']);
  });

  it('names every characteristic that is equally to blame', () => {
    const result = gradePiece({ widthIn: 3.5, slopeRun: 9, waneShare: 0.3 });
    expect(result.grade).toBe('No2');
    expect(result.governedBy.sort()).toEqual(['slope of grain', 'wane']);
  });

  it('does not let a good reading make up for a bad one', () => {
    const good = gradePiece({ widthIn: 3.5, slopeRun: 20 });
    const mixed = gradePiece({ widthIn: 3.5, slopeRun: 20, waneShare: 0.4 });
    expect(good.grade).toBe('SS');
    expect(mixed.grade).toBe('No3');
  });

  it('reports every reading whether it governed or not', () => {
    const result = gradePiece({ widthIn: 3.5, slopeRun: 5 });
    expect(result.readings.map((r) => r.characteristic).sort()).toEqual([
      'knots',
      'slope of grain',
      'splits',
      'wane',
    ]);
  });

  it('gives no grade when one characteristic is off the bottom', () => {
    const result = gradePiece({ widthIn: 3.5, slopeRun: 2 });
    expect(result.grade).toBeNull();
    expect(result.economyOnly).toBe(true);
  });

  it('treats unrecorded slope as no problem', () => {
    expect(gradePiece({ widthIn: 3.5 }).readings.find((r) => r.characteristic === 'slope of grain').grade).toBe(
      'SS'
    );
  });

  it('refuses a piece with no width', () => {
    expect(() => gradePiece({})).toThrow(GradeError);
  });
});

describe('gradeWithout', () => {
  const piece = { widthIn: 3.5, slopeRun: 9, waneShare: 0.4 };

  it('says what fixing the wane would buy', () => {
    expect(gradePiece(piece).grade).toBe('No3');
    expect(gradeWithout(piece, 'wane').grade).toBe('No2');
  });

  it('says fixing the wrong thing buys nothing', () => {
    expect(gradeWithout(piece, 'knots').grade).toBe('No3');
  });

  it('can clear each characteristic in turn', () => {
    for (const characteristic of ['knots', 'slope of grain', 'wane', 'splits']) {
      expect(gradeWithout(piece, characteristic).grade).toBeTruthy();
    }
  });

  it('refuses a characteristic nobody grades', () => {
    expect(() => gradeWithout(piece, 'colour')).toThrow(GradeError);
  });
});

describe('helpers', () => {
  it('works out wane share from the two widths', () => {
    expect(waneShareOf(3.5, 3.5)).toBe(0);
    expect(waneShareOf(3.5, 2.625)).toBe(0.25);
  });

  it('never reports negative wane', () => {
    expect(waneShareOf(3.5, 4)).toBe(0);
  });

  it('works out slope of grain from a deviation over a run', () => {
    expect(slopeRunFrom(1, 12)).toBe(12);
    expect(slopeRunFrom(2, 12)).toBe(6);
  });

  it('treats no deviation as dead straight', () => {
    expect(slopeRunFrom(0, 12)).toBe(Infinity);
  });
});
