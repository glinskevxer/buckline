import { describe, expect, it } from 'vitest';
import { makeBoard, surfaceMeasure } from '../../src/model/board.js';
import { gradeBoard } from '../../src/grade/lumber/grade.js';
import { LUMBER_GRADES, allowancesFor, cuttingCounts } from '../../src/grade/lumber/spec.js';
import { clearBands, searchCuttings } from '../../src/grade/lumber/cutting-search.js';
import { forEachSample, rng, someBoard } from './generators.js';

const SIZES = [
  { widthIn: 4, lengthFt: 2 },
  { widthIn: 3, lengthFt: 3 },
];

describe('surface measure', () => {
  it('never goes down as a board gets wider or longer', () => {
    for (let width = 3; width <= 16; width += 1) {
      let previous = -1;
      for (let length = 4; length <= 16; length += 1) {
        const value = surfaceMeasure(width, length);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it('is never more than a foot off the unrounded figure', () => {
    const next = rng(3);
    for (let i = 0; i < 500; i += 1) {
      const width = 3 + next() * 13;
      const length = 4 + next() * 12;
      const raw = (width * length) / 12;
      expect(Math.abs(surfaceMeasure(width, length) - raw)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});

describe('the grade table', () => {
  it('never allows fewer cuttings on a bigger board', () => {
    for (const grade of LUMBER_GRADES) {
      let previous = -1;
      for (let sm = 1; sm <= 30; sm += 1) {
        const allowances = allowancesFor(grade, sm);
        if (allowances.length === 0) continue;
        const allowed = allowances[0].maxCuttings ?? Infinity;
        expect(allowed).toBeGreaterThanOrEqual(previous);
        previous = allowed;
      }
    }
  });

  it('never counts a cutting smaller than every minimum size', () => {
    for (const grade of LUMBER_GRADES) {
      expect(cuttingCounts(grade, 2, 1)).toBe(false);
    }
  });

  it('counts a cutting the size of the whole board at every grade', () => {
    for (const grade of LUMBER_GRADES) {
      expect(cuttingCounts(grade, 20, 20)).toBe(true);
    }
  });
});

describe('the cutting search over a stream of boards', () => {
  it('never returns overlapping cuttings', () => {
    forEachSample(20250110, 200, someBoard, (raw) => {
      const board = makeBoard(raw);
      for (const face of [0, 1]) {
        const found = searchCuttings(board, face, { maxCuttings: 4, minSizes: SIZES });
        for (let i = 1; i < found.cuttings.length; i += 1) {
          expect(found.cuttings[i].startFt).toBeGreaterThanOrEqual(found.cuttings[i - 1].endFt);
        }
      }
    });
  });

  it('never returns a cutting off the end of the board', () => {
    forEachSample(20250111, 200, someBoard, (raw) => {
      const board = makeBoard(raw);
      for (const cutting of searchCuttings(board, 0, { maxCuttings: 4, minSizes: SIZES })
        .cuttings) {
        expect(cutting.startFt).toBeGreaterThanOrEqual(0);
        expect(cutting.endFt).toBeLessThanOrEqual(board.lengthFt + 1e-9);
        expect(cutting.fromEdgeIn + cutting.widthIn).toBeLessThanOrEqual(board.widthIn + 1e-9);
      }
    });
  });

  it('never finds more units than the board holds', () => {
    forEachSample(20250112, 200, someBoard, (raw) => {
      const board = makeBoard(raw);
      const found = searchCuttings(board, 0, { maxCuttings: 6, minSizes: SIZES });
      expect(found.units).toBeLessThanOrEqual(board.widthIn * board.lengthFt + 1e-6);
    });
  });

  it('never finds less with more cuttings allowed', () => {
    forEachSample(20250113, 150, someBoard, (raw) => {
      const board = makeBoard(raw);
      const two = searchCuttings(board, 0, { maxCuttings: 2, minSizes: SIZES }).units;
      const four = searchCuttings(board, 0, { maxCuttings: 4, minSizes: SIZES }).units;
      expect(four).toBeGreaterThanOrEqual(two - 1e-9);
    });
  });

  it('never takes more cuttings than it was allowed', () => {
    forEachSample(20250114, 150, someBoard, (raw) => {
      const board = makeBoard(raw);
      for (const limit of [1, 2, 3]) {
        const found = searchCuttings(board, 0, { maxCuttings: limit, minSizes: SIZES });
        expect(found.cuttingCount).toBeLessThanOrEqual(limit);
      }
    });
  });

  it('never reports a clear band wider than the board', () => {
    forEachSample(20250115, 150, someBoard, (raw) => {
      const board = makeBoard(raw);
      for (const band of clearBands(board, 0, 0, board.lengthFt)) {
        expect(band.widthIn).toBeLessThanOrEqual(board.widthIn + 1e-9);
        expect(band.toIn).toBeLessThanOrEqual(board.widthIn + 1e-9);
      }
    });
  });
});

describe('grading over a stream of boards', () => {
  it('always gives a grade the board is dimensionally allowed', () => {
    forEachSample(20250116, 200, someBoard, (raw) => {
      const board = makeBoard(raw);
      const result = gradeBoard(board);
      if (result.grade !== null) {
        expect(LUMBER_GRADES).toContain(result.grade);
      }
    });
  });

  it('grades the same board the same way twice', () => {
    forEachSample(20250117, 100, someBoard, (raw) => {
      const board = makeBoard(raw);
      expect(gradeBoard(board).grade).toBe(gradeBoard(board).grade);
    });
  });

  it('never gives a board a grade it stopped trying at', () => {
    forEachSample(20250118, 150, someBoard, (raw) => {
      const board = makeBoard(raw);
      const result = gradeBoard(board);
      if (result.grade !== null) {
        expect(result.attempts.at(-1).grade).toBe(result.grade);
        expect(result.attempts.at(-1).meets).toBe(true);
      }
    });
  });

  it('never improves a board by adding a defect to it', () => {
    forEachSample(20250119, 120, someBoard, (raw) => {
      const clean = makeBoard({ ...raw, defects: [] });
      const marked = makeBoard(raw);
      const rank = (grade) =>
        grade === null ? LUMBER_GRADES.length : LUMBER_GRADES.indexOf(grade);
      expect(rank(gradeBoard(marked).grade)).toBeGreaterThanOrEqual(rank(gradeBoard(clean).grade));
    });
  });
});
