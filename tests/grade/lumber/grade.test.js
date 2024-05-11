import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import { makeBoard } from '../../../src/model/board.js';
import { searchCuttings } from '../../../src/grade/lumber/cutting-search.js';
import { gradeBoard, meetsLumberGrade, readFaceAtGrade } from '../../../src/grade/lumber/grade.js';

function board(defects = [], extra = {}) {
  return makeBoard({
    id: 'B-1',
    species: 'red oak',
    thicknessIn: 1,
    widthIn: 8,
    lengthFt: 12,
    defects,
    ...extra,
  });
}

describe('readFaceAtGrade', () => {
  it('passes a clean face at FAS with the whole board as one cutting', () => {
    const result = readFaceAtGrade(board(), 0, 'FAS');
    expect(result.meets).toBe(true);
    expect(result.cuttings).toHaveLength(1);
    expect(result.units).toBe(96);
    expect(result.required).toBe(80);
  });

  it('says how far short a face fell', () => {
    const knotty = board([
      { type: 'knot', startFt: 0, lengthFt: 12, fromEdgeIn: 3, widthIn: 2 },
    ]);
    const result = readFaceAtGrade(knotty, 0, 'FAS');
    expect(result.meets).toBe(false);
    expect(result.shortBy).toBeGreaterThan(0);
    expect(result.reason).toContain('cutting units');
  });

  it('takes the plain allowance when the plain allowance is enough', () => {
    const result = readFaceAtGrade(board(), 0, '1C');
    expect(result.allowance.extra).toBe(false);
  });

  it('buys a second cutting with a higher yield when one cutting is not enough', () => {
    const small = makeBoard({
      id: 'B-4',
      species: 'red oak',
      thicknessIn: 1,
      widthIn: 4,
      lengthFt: 6,
      defects: [{ type: 'knot', startFt: 2.875, lengthFt: 0.25, fromEdgeIn: 0, widthIn: 4 }],
    });
    expect(small.surfaceMeasure).toBe(2);
    const result = readFaceAtGrade(small, 0, '1C');
    expect(result.meets).toBe(true);
    expect(result.allowance.extra).toBe(true);
    expect(result.cuttings).toHaveLength(2);
    expect(result.units).toBe(23);
    expect(result.required).toBe(20);
  });

  it('would have failed that board on the plain allowance', () => {
    const small = makeBoard({
      id: 'B-4',
      species: 'red oak',
      thicknessIn: 1,
      widthIn: 4,
      lengthFt: 6,
      defects: [{ type: 'knot', startFt: 2.875, lengthFt: 0.25, fromEdgeIn: 0, widthIn: 4 }],
    });
    const one = searchCuttings(small, 0, {
      maxCuttings: 1,
      minSizes: [
        { widthIn: 4, lengthFt: 2 },
        { widthIn: 3, lengthFt: 3 },
      ],
    });
    expect(one.units).toBeLessThan(16);
  });

  it('reports a surface measure off the table rather than guessing', () => {
    const small = makeBoard({
      id: 'B-2',
      species: 'red oak',
      thicknessIn: 1,
      widthIn: 4,
      lengthFt: 6,
    });
    const result = readFaceAtGrade(small, 0, 'FAS');
    expect(result.meets).toBe(false);
    expect(result.reason).toContain('off the FAS table');
  });
});

describe('meetsLumberGrade', () => {
  it('takes a clean board at FAS', () => {
    expect(meetsLumberGrade(board(), 'FAS').meets).toBe(true);
  });

  it('refuses on dimensions before it looks at a single defect', () => {
    const narrow = makeBoard({
      id: 'B-3',
      species: 'red oak',
      thicknessIn: 1,
      widthIn: 4,
      lengthFt: 12,
    });
    const result = meetsLumberGrade(narrow, 'FAS');
    expect(result.meets).toBe(false);
    expect(result.faces).toEqual([]);
    expect(result.reasons.join(' ')).toContain('inch minimum');
  });

  it('grades FAS on the better of the two faces', () => {
    const oneBadFace = board([
      { type: 'knot', face: 1, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = meetsLumberGrade(oneBadFace, 'FAS');
    expect(result.meets).toBe(true);
    expect(result.betterFace).toBe(0);
  });

  it('does not care which way up the board arrived', () => {
    const badFront = board([
      { type: 'knot', face: 0, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = meetsLumberGrade(badFront, 'FAS');
    expect(result.meets).toBe(true);
    expect(result.betterFace).toBe(1);
  });

  it('reads both faces at the one face grades', () => {
    const result = meetsLumberGrade(board(), 'F1F');
    expect(result.faces).toHaveLength(2);
    expect(result.faces[0].grade).toBe('F1F');
    expect(result.faces[1].grade).toBe('1C');
  });

  it('fails a one face grade when the back face is worse than common', () => {
    const ruinedBack = board([
      { type: 'shake', face: 1, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = meetsLumberGrade(ruinedBack, 'F1F');
    expect(result.meets).toBe(false);
    expect(result.reasons.join(' ')).toContain('back face');
  });

  it('names the face that failed', () => {
    const ruinedBoth = board([
      { type: 'shake', face: 0, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
      { type: 'shake', face: 1, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = meetsLumberGrade(ruinedBoth, 'F1F');
    expect(result.reasons.join(' ')).toContain('better face');
  });
});

describe('gradeBoard', () => {
  it('gives a clean wide board the top grade', () => {
    expect(gradeBoard(board()).grade).toBe('FAS');
  });

  it('drops to a one face grade when one face is poor', () => {
    const oneBadFace = board([
      { type: 'knot', face: 1, startFt: 0, lengthFt: 12, fromEdgeIn: 3, widthIn: 2 },
    ]);
    const result = gradeBoard(oneBadFace);
    expect(['FAS', 'F1F']).toContain(result.grade);
  });

  it('drops to a common grade when both faces are knotty', () => {
    const knotty = board([
      { type: 'knot', face: 0, startFt: 3, lengthFt: 1, fromEdgeIn: 2, widthIn: 4 },
      { type: 'knot', face: 0, startFt: 7, lengthFt: 1, fromEdgeIn: 2, widthIn: 4 },
      { type: 'knot', face: 1, startFt: 3, lengthFt: 1, fromEdgeIn: 2, widthIn: 4 },
      { type: 'knot', face: 1, startFt: 7, lengthFt: 1, fromEdgeIn: 2, widthIn: 4 },
    ]);
    expect(['1C', '2AC', '3AC']).toContain(gradeBoard(knotty).grade);
  });

  it('gives no grade to a board with nothing clear on it', () => {
    const ruined = board([
      { type: 'shake', face: 0, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
      { type: 'shake', face: 1, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = gradeBoard(ruined);
    expect(result.grade).toBeNull();
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('stops trying once a grade is made', () => {
    const result = gradeBoard(board());
    expect(result.attempts).toHaveLength(1);
  });

  it('can be told which grades are on offer', () => {
    const result = gradeBoard(board(), { grades: ['1C', '2AC'] });
    expect(result.grade).toBe('1C');
  });

  it('refuses an empty grade list', () => {
    expect(() => gradeBoard(board(), { grades: [] })).toThrow(GradeError);
  });

  it('carries the tally figures through', () => {
    const result = gradeBoard(board());
    expect(result.surfaceMeasure).toBe(8);
    expect(result.boardFeet).toBe(8);
  });
});
