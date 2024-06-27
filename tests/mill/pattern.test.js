import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import {
  MillError,
  PATTERNS,
  cantSaw,
  chordWidth,
  comparePatterns,
  gradeSaw,
  liveSaw,
  quarterSaw,
  saw,
} from '../../src/mill/pattern.js';

const log = makeLog({
  id: 'L-1',
  species: 'red oak',
  axesIn: [21.8, 21.8],
  measuredLengthFt: 12.25,
});

describe('chordWidth', () => {
  it('is the full diameter at the centre', () => {
    expect(chordWidth(20, 0)).toBe(20);
  });

  it('narrows toward the outside', () => {
    expect(chordWidth(20, 6)).toBeCloseTo(16, 3);
    expect(chordWidth(20, 9)).toBeLessThan(chordWidth(20, 6));
  });

  it('is nothing past the edge', () => {
    expect(chordWidth(20, 10)).toBe(0);
    expect(chordWidth(20, 12)).toBe(0);
  });
});

describe('liveSaw', () => {
  const result = liveSaw(log);

  it('takes boards from a twenty inch log', () => {
    expect(log.scalingDiameterIn).toBe(20);
    expect(result.boardCount).toBeGreaterThan(10);
  });

  it('makes the middle boards the widest', () => {
    const sorted = [...result.boards].sort((a, b) => a.fromCentre - b.fromCentre);
    expect(sorted[0].widthIn).toBeGreaterThan(sorted.at(-1).widthIn);
  });

  it('drops boards under the minimum width', () => {
    for (const board of result.boards) {
      expect(board.widthIn).toBeGreaterThanOrEqual(4);
    }
  });

  it('takes fewer boards on a thicker cut', () => {
    expect(liveSaw(log, { thicknessIn: 2 }).boardCount).toBeLessThan(result.boardCount);
  });

  it('loses volume to a wider kerf', () => {
    expect(liveSaw(log, { kerfIn: 0.25 }).boardFeet).toBeLessThan(result.boardFeet);
  });

  it('is symmetric about the centre', () => {
    const above = result.boards.filter((board) => board.offsetIn > 0).length;
    const below = result.boards.filter((board) => board.offsetIn < 0).length;
    expect(above).toBe(below);
  });

  it('refuses a nonsense thickness', () => {
    expect(() => liveSaw(log, { thicknessIn: 0 })).toThrow(MillError);
  });
});

describe('cantSaw', () => {
  const result = cantSaw(log);

  it('makes every board the same width', () => {
    expect(new Set(result.boards.map((board) => board.widthIn)).size).toBe(1);
  });

  it('makes narrower boards than live sawing does at the centre', () => {
    expect(result.widestIn).toBeLessThan(liveSaw(log).widestIn);
  });

  it('makes a more even tally than live sawing', () => {
    const live = liveSaw(log);
    const liveSpread = live.widestIn - Math.min(...live.boards.map((b) => b.widthIn));
    expect(liveSpread).toBeGreaterThan(0);
  });

  it('carries the cant size in the settings', () => {
    expect(result.settings.cantIn).toBeCloseTo(20 * 0.71, 2);
  });
});

describe('gradeSaw', () => {
  it('takes fewer boards than live sawing because of the turns', () => {
    expect(gradeSaw(log).boardCount).toBeLessThan(liveSaw(log).boardCount);
  });

  it('keeps the boards nearest the centre', () => {
    const result = gradeSaw(log);
    expect(Math.max(...result.boards.map((b) => b.fromCentre))).toBeLessThan(
      Math.max(...liveSaw(log).boards.map((b) => b.fromCentre))
    );
  });

  it('claims a grade lift that live sawing does not', () => {
    expect(gradeSaw(log).settings.gradeLift).toBeGreaterThan(liveSaw(log).settings.gradeLift);
  });

  it('takes fewer still when the log is turned more often', () => {
    expect(gradeSaw(log, { turns: 6 }).boardCount).toBeLessThan(gradeSaw(log, { turns: 2 }).boardCount);
  });
});

describe('quarterSaw', () => {
  it('gets less volume out of the log than live sawing', () => {
    expect(quarterSaw(log).boardFeet).toBeLessThan(liveSaw(log).boardFeet);
  });

  it('claims the biggest grade lift of any pattern', () => {
    const lifts = PATTERNS.map((pattern) => saw(log, pattern).settings.gradeLift);
    expect(quarterSaw(log).settings.gradeLift).toBe(Math.max(...lifts));
  });

  it('works all four quarters', () => {
    expect(new Set(quarterSaw(log).boards.map((board) => board.quarter)).size).toBe(4);
  });

  it('makes narrower boards than live sawing', () => {
    expect(quarterSaw(log).averageWidthIn).toBeLessThan(liveSaw(log).averageWidthIn);
  });
});

describe('saw', () => {
  it('runs any named pattern', () => {
    for (const pattern of PATTERNS) {
      expect(saw(log, pattern).pattern).toBe(pattern);
    }
  });

  it('refuses a pattern the mill does not run', () => {
    expect(() => saw(log, 'freehand')).toThrow(MillError);
  });

  it('stamps the log id on the result', () => {
    expect(saw(log, 'live').logId).toBe('L-1');
  });
});

describe('comparePatterns', () => {
  it('puts the biggest volume first', () => {
    const rows = comparePatterns(log);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].boardFeet).toBeLessThanOrEqual(rows[i - 1].boardFeet);
    }
  });

  it('shows live sawing beating quarter sawing on volume and losing on lift', () => {
    const rows = comparePatterns(log);
    const live = rows.find((row) => row.pattern === 'live');
    const quarter = rows.find((row) => row.pattern === 'quarter');
    expect(live.boardFeet).toBeGreaterThan(quarter.boardFeet);
    expect(live.gradeLift).toBeLessThan(quarter.gradeLift);
  });

  it('covers every pattern', () => {
    expect(comparePatterns(log).map((row) => row.pattern).sort()).toEqual([...PATTERNS].sort());
  });
});
