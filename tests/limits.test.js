import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  LimitError,
  checkBoard,
  checkFile,
  checkLimit,
  checkLoad,
  checkPositions,
  checkStem,
  withinLimit,
} from '../src/limits.js';
import { makeBoard } from '../src/model/board.js';
import { makeLoad } from '../src/model/load.js';
import { makeStem } from '../src/buck/stem.js';

function defects(count) {
  return Array.from({ length: count }, (_, i) => ({
    type: 'knot',
    face: 0,
    startFt: i * 0.001,
    lengthFt: 0.1,
    fromEdgeIn: 0,
    widthIn: 1,
  }));
}

describe('checkLimit', () => {
  it('lets anything under the cap through', () => {
    expect(checkLimit('logsPerLoad', 10)).toBe(10);
    expect(checkLimit('logsPerLoad', LIMITS.logsPerLoad)).toBe(LIMITS.logsPerLoad);
  });

  it('refuses one past it and says the cap', () => {
    let caught;
    try {
      checkLimit('logsPerLoad', LIMITS.logsPerLoad + 1);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LimitError);
    expect(caught.details.cap).toBe(LIMITS.logsPerLoad);
    expect(caught.hint).toContain('probably wrong');
  });

  it('takes a cap of its own', () => {
    expect(() => checkLimit('logsPerLoad', 5, { cap: 4 })).toThrow(LimitError);
  });

  it('refuses a limit nobody set', () => {
    expect(() => checkLimit('boardsPerAcre', 1)).toThrow(LimitError);
  });

  it('answers without throwing', () => {
    expect(withinLimit('logsPerLoad', 10)).toBe(true);
    expect(withinLimit('logsPerLoad', 100000)).toBe(false);
  });
});

describe('the limits themselves', () => {
  it('are all far above anything real', () => {
    expect(LIMITS.logsPerLoad).toBeGreaterThan(100);
    expect(LIMITS.defectsPerLog).toBeGreaterThan(20);
    expect(LIMITS.cutPositionsPerStem).toBeGreaterThan(100);
  });

  it('are all whole numbers', () => {
    for (const value of Object.values(LIMITS)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('at the edges', () => {
  it('refuses a load with too many logs', () => {
    const logs = Array.from({ length: LIMITS.logsPerLoad + 1 }, (_, i) => ({ id: `L-${i}` }));
    expect(() => checkLoad({ logs })).toThrow(LimitError);
  });

  it('names the log with too many defects on it', () => {
    let caught;
    try {
      checkLoad({
        logs: [{ id: 'L-1' }, { id: 'L-2', defects: defects(LIMITS.defectsPerLog + 1) }],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught.path).toBe('logs[1].defects');
  });

  it('refuses a board with too many defects before the search runs', () => {
    expect(() => checkBoard({ defects: defects(LIMITS.defectsPerBoard + 1) })).toThrow(LimitError);
  });

  it('refuses a stem profile with too many points', () => {
    const profile = Array.from({ length: LIMITS.profilePointsPerStem + 1 }, (_, i) => ({
      atFt: i,
      diameterIn: 40 - i * 0.1,
    }));
    expect(() => checkStem({ profile })).toThrow(LimitError);
  });

  it('refuses a position list the search would go quadratic over', () => {
    const positions = Array.from({ length: LIMITS.cutPositionsPerStem + 1 }, (_, i) => i);
    expect(() => checkPositions(positions)).toThrow(LimitError);
  });

  it('refuses a file with too many records', () => {
    expect(() => checkFile({ length: 1 })).not.toThrow();
    expect(() => checkFile(new Array(LIMITS.recordsPerFile + 1).fill({}))).toThrow(LimitError);
  });
});

describe('the constructors carry the guard', () => {
  it('refuses a board with a broken defect list rather than searching it', () => {
    expect(() =>
      makeBoard({
        id: 'B-1',
        species: 'red oak',
        thicknessIn: 1,
        widthIn: 8,
        lengthFt: 12,
        defects: defects(LIMITS.defectsPerBoard + 1),
      })
    ).toThrow(LimitError);
  });

  it('takes a board with a plausible number of defects', () => {
    expect(
      makeBoard({
        id: 'B-1',
        species: 'red oak',
        thicknessIn: 1,
        widthIn: 8,
        lengthFt: 12,
        defects: defects(6),
      }).defects
    ).toHaveLength(6);
  });

  it('refuses a load with a broken log list', () => {
    const logs = Array.from({ length: LIMITS.logsPerLoad + 1 }, (_, i) => ({
      id: `L-${i}`,
      species: 'red oak',
      axesIn: [16, 16],
      measuredLengthFt: 12.25,
    }));
    expect(() => makeLoad({ id: 'LD-1', tractId: 'T-7', logs })).toThrow(LimitError);
  });

  it('refuses a stem with a broken profile', () => {
    const profile = Array.from({ length: LIMITS.profilePointsPerStem + 1 }, (_, i) => ({
      atFt: i,
      diameterIn: 200 - i,
    }));
    expect(() => makeStem({ id: 'S-1', species: 'red oak', profile })).toThrow(LimitError);
  });
});
