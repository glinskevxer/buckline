import { describe, expect, it } from 'vitest';
import { makeBoard } from '../../src/model/board.js';
import { MillError } from '../../src/mill/pattern.js';
import {
  TRIM_LENGTHS,
  bestTrim,
  costOfOneEnded,
  pieceOf,
  quickGrade,
  trimOptions,
  trimValues,
} from '../../src/mill/trimmer.js';

const prices = { FAS: 1450, F1F: 1300, SEL: 1130, '1C': 800, '2AC': 460, '3AC': 260 };

function board(defects = [], over = {}) {
  return makeBoard({
    id: 'B-1',
    species: 'red oak',
    thicknessIn: 1,
    widthIn: 8,
    lengthFt: 12,
    defects,
    ...over,
  });
}

describe('trimOptions', () => {
  it('always offers leaving the board alone', () => {
    expect(trimOptions(board())[0].trimmed).toBe('nothing');
  });

  it('offers both ends at every shorter standard length', () => {
    const options = trimOptions(board());
    const tens = options.filter((option) => option.lengthFt === 10);
    expect(tens.map((option) => option.trimmed).sort()).toEqual(['butt', 'tail']);
  });

  it('offers nothing longer than the board', () => {
    for (const option of trimOptions(board())) {
      expect(option.lengthFt).toBeLessThanOrEqual(12);
    }
  });

  it('takes a different set of lengths', () => {
    const options = trimOptions(board(), { lengths: [8] });
    expect(options).toHaveLength(3);
  });

  it('knows the standard lengths', () => {
    expect(TRIM_LENGTHS[0]).toBe(4);
    expect(TRIM_LENGTHS.at(-1)).toBe(16);
  });
});

describe('pieceOf', () => {
  const defects = [
    { type: 'knot', face: 0, startFt: 10.5, lengthFt: 0.5, fromEdgeIn: 0, widthIn: 8 },
  ];

  it('drops a defect the trim cut away', () => {
    const piece = pieceOf(board(defects), { fromFt: 0, toFt: 10, lengthFt: 10 });
    expect(piece.defects).toHaveLength(0);
  });

  it('keeps a defect the trim left on', () => {
    const piece = pieceOf(board(defects), { fromFt: 2, toFt: 12, lengthFt: 10 });
    expect(piece.defects).toHaveLength(1);
    expect(piece.defects[0].startFt).toBe(8.5);
  });

  it('recomputes the tally figures for the shorter piece', () => {
    const piece = pieceOf(board(), { fromFt: 0, toFt: 8, lengthFt: 8 });
    expect(piece.boardFeet).toBeCloseTo(5.33, 1);
    expect(piece.surfaceMeasure).toBe(5);
  });
});

describe('quickGrade', () => {
  it('gives a clean board the top grade', () => {
    expect(quickGrade(board())).toBe('FAS');
  });

  it('gives a ruined board no grade at all', () => {
    const ruined = board([
      { type: 'shake', face: 0, startFt: 0, lengthFt: 12, fromEdgeIn: 0, widthIn: 8 },
    ]);
    expect(quickGrade(ruined)).toBeNull();
  });
});

describe('trimValues', () => {
  it('prices every option', () => {
    const rows = trimValues(board(), prices);
    expect(rows.length).toBe(trimOptions(board()).length);
  });

  it('puts the most valuable first', () => {
    const rows = trimValues(board(), prices);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].value).toBeLessThanOrEqual(rows[i - 1].value);
    }
  });

  it('leaves a clean board alone', () => {
    expect(trimValues(board(), prices)[0].trimmed).toBe('nothing');
  });

  it('refuses a board with no dimensions', () => {
    expect(() => trimValues({ lengthFt: 0, widthIn: 8 }, prices)).toThrow(MillError);
  });
});

describe('bestTrim', () => {
  it('does not trim a clean board', () => {
    const result = bestTrim(board(), prices);
    expect(result.worthTrimming).toBe(false);
    expect(result.gain).toBe(0);
  });

  it('trims a board whose defect is near one end', () => {
    const spotty = board([
      { type: 'knot', face: 0, startFt: 9.5, lengthFt: 1, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = bestTrim(spotty, prices);
    expect(result.worthTrimming).toBe(true);
    expect(result.best.grade).toBe('FAS');
    expect(result.best.lengthFt).toBeLessThan(12);
  });

  it('always reports what leaving it alone was worth', () => {
    const result = bestTrim(board(), prices);
    expect(result.untrimmed.trimmed).toBe('nothing');
  });

  it('does not trim when the grade does not move', () => {
    const flat = { FAS: 1000, F1F: 1000, SEL: 1000, '1C': 1000, '2AC': 1000, '3AC': 1000 };
    expect(
      bestTrim(
        board([{ type: 'knot', face: 0, startFt: 10.5, lengthFt: 1, fromEdgeIn: 0, widthIn: 8 }]),
        flat
      ).worthTrimming
    ).toBe(false);
  });
});

describe('costOfOneEnded', () => {
  it('costs nothing when the defect is at the tail', () => {
    const spotty = board([
      { type: 'knot', face: 0, startFt: 9.5, lengthFt: 1, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = costOfOneEnded(spotty, prices);
    expect(result.mattersHere).toBe(false);
    expect(result.lostValue).toBe(0);
  });

  it('costs real money when the defect is at the butt', () => {
    const spotty = board([
      { type: 'knot', face: 0, startFt: 2, lengthFt: 0.5, fromEdgeIn: 0, widthIn: 8 },
    ]);
    const result = costOfOneEnded(spotty, prices);
    expect(result.bothEnds.trimmed).toBe('butt');
    expect(result.mattersHere).toBe(true);
    expect(result.lostValue).toBeGreaterThan(0);
  });
});
