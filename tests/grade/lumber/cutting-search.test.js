import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import { makeBoard } from '../../../src/model/board.js';
import {
  bestCutting,
  clearBands,
  cutPositions,
  searchCuttings,
} from '../../../src/grade/lumber/cutting-search.js';

const SIZES = [
  { widthIn: 4, lengthFt: 2 },
  { widthIn: 3, lengthFt: 3 },
];

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

describe('clearBands', () => {
  it('finds the whole width clear on a clean board', () => {
    expect(clearBands(board(), 0, 0, 12)).toEqual([{ fromIn: 0, toIn: 8, widthIn: 8 }]);
  });

  it('splits the width either side of a defect', () => {
    const knotty = board([{ type: 'knot', startFt: 4, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 }]);
    expect(clearBands(knotty, 0, 4, 5)).toEqual([
      { fromIn: 0, toIn: 3, widthIn: 3 },
      { fromIn: 5, toIn: 8, widthIn: 3 },
    ]);
  });

  it('ignores a defect that does not reach the interval', () => {
    const knotty = board([{ type: 'knot', startFt: 4, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 }]);
    expect(clearBands(knotty, 0, 6, 12)[0].widthIn).toBe(8);
  });

  it('lets a defect anywhere in the interval narrow the whole interval', () => {
    const knotty = board([{ type: 'knot', startFt: 4, lengthFt: 0.5, fromEdgeIn: 3, widthIn: 2 }]);
    expect(clearBands(knotty, 0, 0, 12)[0].widthIn).toBe(3);
  });

  it('merges two overlapping defects across the width', () => {
    const knotty = board([
      { type: 'knot', startFt: 4, lengthFt: 1, fromEdgeIn: 2, widthIn: 2 },
      { type: 'knot', startFt: 4, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 },
    ]);
    expect(clearBands(knotty, 0, 4, 5)).toEqual([
      { fromIn: 5, toIn: 8, widthIn: 3 },
      { fromIn: 0, toIn: 2, widthIn: 2 },
    ]);
  });

  it('reads the two faces separately', () => {
    const knotty = board([
      { type: 'knot', face: 1, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
    ]);
    expect(clearBands(knotty, 0, 0, 12)[0].widthIn).toBe(8);
    expect(clearBands(knotty, 1, 0, 12)).toEqual([]);
  });

  it('returns nothing for an empty interval', () => {
    expect(clearBands(board(), 0, 5, 5)).toEqual([]);
  });
});

describe('cutPositions', () => {
  it('is just the two ends on a clean board', () => {
    expect(cutPositions(board(), 0)).toEqual([0, 12]);
  });

  it('adds both ends of every defect', () => {
    const knotty = board([{ type: 'knot', startFt: 4, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 }]);
    expect(cutPositions(knotty, 0)).toEqual([0, 4, 5, 12]);
  });

  it('clips a defect that runs off the end', () => {
    const knotty = board([{ type: 'knot', startFt: 11, lengthFt: 4, fromEdgeIn: 0, widthIn: 2 }]);
    expect(cutPositions(knotty, 0)).toEqual([0, 11, 12]);
  });

  it('does not repeat a position two defects share', () => {
    const knotty = board([
      { type: 'knot', startFt: 4, lengthFt: 1, fromEdgeIn: 0, widthIn: 2 },
      { type: 'knot', startFt: 4, lengthFt: 1, fromEdgeIn: 6, widthIn: 2 },
    ]);
    expect(cutPositions(knotty, 0)).toEqual([0, 4, 5, 12]);
  });
});

describe('bestCutting', () => {
  it('takes the whole face on a clean board', () => {
    expect(bestCutting(board(), 0, 0, 12, SIZES)).toMatchObject({ widthIn: 8, units: 96 });
  });

  it('takes the wider of two bands', () => {
    const knotty = board([{ type: 'knot', startFt: 0, lengthFt: 12, fromEdgeIn: 3, widthIn: 1 }]);
    expect(bestCutting(knotty, 0, 0, 12, SIZES)).toMatchObject({ widthIn: 4, fromEdgeIn: 4 });
  });

  it('returns nothing when no band meets a minimum size', () => {
    const knotty = board([{ type: 'knot', startFt: 0, lengthFt: 12, fromEdgeIn: 2, widthIn: 4 }]);
    expect(bestCutting(knotty, 0, 0, 12, SIZES)).toBeNull();
  });

  it('takes a narrow band when it is long enough to qualify', () => {
    const knotty = board([{ type: 'knot', startFt: 0, lengthFt: 12, fromEdgeIn: 3, widthIn: 2 }]);
    const cutting = bestCutting(knotty, 0, 0, 12, [{ widthIn: 3, lengthFt: 3 }]);
    expect(cutting.widthIn).toBe(3);
  });

  it('refuses a cutting that is long enough but too narrow for either pair', () => {
    expect(bestCutting(board(), 0, 0, 1, SIZES)).toBeNull();
  });
});

describe('searchCuttings', () => {
  it('takes the whole clean board as one cutting', () => {
    const result = searchCuttings(board(), 0, { maxCuttings: 2, minSizes: SIZES });
    expect(result.cuttingCount).toBe(1);
    expect(result.units).toBe(96);
  });

  it('cuts around a defect when two cuttings are allowed', () => {
    const knotty = board([{ type: 'knot', startFt: 5, lengthFt: 1, fromEdgeIn: 0, widthIn: 8 }]);
    const result = searchCuttings(knotty, 0, { maxCuttings: 2, minSizes: SIZES });
    expect(result.cuttingCount).toBe(2);
    expect(result.units).toBe(8 * 5 + 8 * 6);
  });

  it('takes the better single cutting when only one is allowed', () => {
    const knotty = board([{ type: 'knot', startFt: 5, lengthFt: 1, fromEdgeIn: 0, widthIn: 8 }]);
    const result = searchCuttings(knotty, 0, { maxCuttings: 1, minSizes: SIZES });
    expect(result.cuttingCount).toBe(1);
    expect(result.units).toBe(48);
  });

  it('trades length for width where that pays', () => {
    const knotty = board([{ type: 'knot', startFt: 10, lengthFt: 2, fromEdgeIn: 5, widthIn: 3 }]);
    const wide = searchCuttings(knotty, 0, { maxCuttings: 1, minSizes: SIZES });
    expect(wide.cuttings[0]).toMatchObject({ startFt: 0, endFt: 10, widthIn: 8 });
    expect(wide.units).toBe(80);
  });

  it('gets more out of the same board when it may take an extra cutting', () => {
    const knotty = board([{ type: 'knot', startFt: 10, lengthFt: 2, fromEdgeIn: 5, widthIn: 3 }]);
    const one = searchCuttings(knotty, 0, { maxCuttings: 1, minSizes: SIZES });
    const two = searchCuttings(knotty, 0, { maxCuttings: 2, minSizes: SIZES });
    expect(two.units).toBeGreaterThan(one.units);
  });

  it('takes as many as it likes when there is no limit', () => {
    const knotty = board([
      { type: 'knot', startFt: 3, lengthFt: 0.5, fromEdgeIn: 0, widthIn: 8 },
      { type: 'knot', startFt: 6, lengthFt: 0.5, fromEdgeIn: 0, widthIn: 8 },
      { type: 'knot', startFt: 9, lengthFt: 0.5, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = searchCuttings(knotty, 0, { maxCuttings: null, minSizes: SIZES });
    expect(result.cuttingCount).toBe(4);
  });

  it('finds nothing on a face that is defect from end to end', () => {
    const ruined = board([{ type: 'shake', startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 }]);
    const result = searchCuttings(ruined, 0, { maxCuttings: 3, minSizes: SIZES });
    expect(result.units).toBe(0);
    expect(result.cuttings).toEqual([]);
  });

  it('returns nothing when no cuttings are allowed', () => {
    expect(searchCuttings(board(), 0, { maxCuttings: 0, minSizes: SIZES }).units).toBe(0);
  });

  it('never returns overlapping cuttings', () => {
    const knotty = board([
      { type: 'knot', startFt: 3, lengthFt: 0.5, fromEdgeIn: 2, widthIn: 2 },
      { type: 'knot', startFt: 7, lengthFt: 0.5, fromEdgeIn: 4, widthIn: 2 },
    ]);
    const result = searchCuttings(knotty, 0, { maxCuttings: 3, minSizes: SIZES });
    for (let i = 1; i < result.cuttings.length; i += 1) {
      expect(result.cuttings[i].startFt).toBeGreaterThanOrEqual(result.cuttings[i - 1].endFt);
    }
  });

  it('refuses a search with no minimum sizes', () => {
    expect(() => searchCuttings(board(), 0, { minSizes: [] })).toThrow(GradeError);
  });
});
