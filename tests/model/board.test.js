import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors.js';
import {
  cuttingUnits,
  describeBoard,
  makeBoard,
  surfaceMeasure,
  tallyBoardFeet,
  wanePercent,
} from '../../src/model/board.js';

const raw = {
  id: 'B-1',
  species: 'red oak',
  thicknessIn: 1,
  widthIn: 7,
  lengthFt: 12,
};

describe('surfaceMeasure', () => {
  it('is width times length over twelve', () => {
    expect(surfaceMeasure(6, 10)).toBe(5);
    expect(surfaceMeasure(12, 8)).toBe(8);
  });

  it('counts a half or more as a whole foot', () => {
    expect(surfaceMeasure(7, 12)).toBe(7);
    expect(surfaceMeasure(5, 11)).toBe(5);
  });

  it('drops less than a half', () => {
    expect(surfaceMeasure(5, 10)).toBe(4);
    expect(surfaceMeasure(4, 10)).toBe(3);
  });

  it('rounds exactly a half upward', () => {
    expect(surfaceMeasure(6, 9)).toBe(5);
  });

  it('is blind to thickness because it is a face measurement', () => {
    expect(surfaceMeasure(7, 12)).toBe(surfaceMeasure(7, 12));
  });
});

describe('cuttingUnits', () => {
  it('counts an inch of width by a foot of length as one unit', () => {
    expect(cuttingUnits(4, 3)).toBe(12);
    expect(cuttingUnits(6, 8)).toBe(48);
  });

  it('is twelve times surface measure on a whole board', () => {
    expect(cuttingUnits(6, 10)).toBe(surfaceMeasure(6, 10) * 12);
  });
});

describe('makeBoard', () => {
  it('derives the tally figures', () => {
    const board = makeBoard(raw);
    expect(board.quarters).toBe(4);
    expect(board.surfaceMeasure).toBe(7);
    expect(board.boardFeet).toBe(7);
    expect(board.totalUnits).toBe(84);
  });

  it('handles thick stock', () => {
    const board = makeBoard({ ...raw, thicknessIn: 2 });
    expect(board.quarters).toBe(8);
    expect(board.boardFeet).toBe(14);
    expect(board.surfaceMeasure).toBe(7);
  });

  it('refuses a thickness that is not a whole quarter', () => {
    expect(() => makeBoard({ ...raw, thicknessIn: 1.1 })).toThrow(RangeError);
  });

  it('defaults the wide width to the narrow one', () => {
    expect(makeBoard(raw).wideWidthIn).toBe(7);
    expect(makeBoard(raw).wane).toBe(0);
  });

  it('works out wane from the two widths', () => {
    const board = makeBoard({ ...raw, wideWidthIn: 8 });
    expect(board.wane).toBe(12.5);
  });

  it('refuses a board narrower at the wide point', () => {
    expect(() => makeBoard({ ...raw, wideWidthIn: 6 })).toThrow(RangeError);
  });

  it('defaults the defect list to empty', () => {
    expect(makeBoard(raw).defects).toEqual([]);
  });

  it('keeps a defect list with its face and position', () => {
    const board = makeBoard({
      ...raw,
      defects: [{ type: 'knot', startFt: 3, lengthFt: 0.5, widthIn: 1.5 }],
    });
    expect(board.defects[0].face).toBe(0);
    expect(board.defects[0].fromEdgeIn).toBe(0);
  });

  it('refuses a defect on a third face', () => {
    expect(() =>
      makeBoard({
        ...raw,
        defects: [{ type: 'knot', face: 2, startFt: 1, lengthFt: 1, widthIn: 1 }],
      })
    ).toThrow(ValidationError);
  });

  it('refuses a board with no identity or an impossible width', () => {
    expect(() => makeBoard({ ...raw, id: '' })).toThrow(ValidationError);
    expect(() => makeBoard({ ...raw, widthIn: 0 })).toThrow(ValidationError);
  });
});

describe('wanePercent', () => {
  it('is zero on a square edged board', () => {
    expect(wanePercent(7, 7)).toBe(0);
  });

  it('rises as the narrow point falls away', () => {
    expect(wanePercent(6, 8)).toBe(25);
  });

  it('is zero rather than infinite on a nonsense width', () => {
    expect(wanePercent(6, 0)).toBe(0);
  });
});

describe('tallyBoardFeet', () => {
  it('sums a tally', () => {
    const boards = [makeBoard(raw), makeBoard({ ...raw, id: 'B-2', widthIn: 9 })];
    expect(tallyBoardFeet(boards)).toBe(16);
  });

  it('sums an empty tally at zero', () => {
    expect(tallyBoardFeet([])).toBe(0);
  });
});

describe('describeBoard', () => {
  it('writes a tally sheet line', () => {
    expect(describeBoard(makeBoard(raw))).toBe('B-1 4/4 7in x 12ft sm 7');
  });
});
