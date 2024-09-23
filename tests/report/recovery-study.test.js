import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { makePriceList } from '../../src/price/list.js';
import { PATTERNS } from '../../src/mill/pattern.js';
import {
  StudyError,
  studyAssumptions,
  studyDeck,
  studyLog,
  studyPatterns,
  studySummary,
} from '../../src/report/recovery-study.js';

const list = makePriceList({
  id: 'PL-1',
  effectiveFrom: '2024-01-01',
  base: { 'red oak': 1400, 'yellow poplar': 700 },
});

function log(id, axis, species = 'red oak') {
  return makeLog({ id, species, axesIn: [axis, axis], measuredLengthFt: 12.25 });
}

const deck = [log('L-1', 21.8), log('L-2', 15.2), log('L-3', 26.1, 'yellow poplar')];

describe('studyLog', () => {
  it('splits the tally between the base grade and the lifted grade', () => {
    const result = studyLog(log('L-1', 21.8), 'quarter', list);
    expect(result.liftedBoardFeet).toBeGreaterThan(0);
    expect(result.liftedBoardFeet + result.baseBoardFeet).toBeCloseTo(result.boardFeet, 1);
  });

  it('lifts nothing under live sawing', () => {
    expect(studyLog(log('L-1', 21.8), 'live', list).liftedBoardFeet).toBe(0);
  });

  it('prices the lifted footage higher', () => {
    const live = studyLog(log('L-1', 21.8), 'live', list);
    const quarter = studyLog(log('L-1', 21.8), 'quarter', list);
    expect(quarter.value / quarter.boardFeet).toBeGreaterThan(live.value / live.boardFeet);
  });

  it('carries the board count and the average width', () => {
    const result = studyLog(log('L-1', 21.8), 'live', list);
    expect(result.boardCount).toBeGreaterThan(0);
    expect(result.averageWidthIn).toBeGreaterThan(0);
  });
});

describe('studyPatterns', () => {
  it('runs every pattern', () => {
    expect(
      studyPatterns(log('L-1', 21.8), list)
        .map((row) => row.pattern)
        .sort()
    ).toEqual([...PATTERNS].sort());
  });

  it('puts the most valuable first', () => {
    const rows = studyPatterns(log('L-1', 21.8), list);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].value).toBeLessThanOrEqual(rows[i - 1].value);
    }
  });
});

describe('studyDeck', () => {
  const study = studyDeck(deck, list);

  it('studies every log', () => {
    expect(study.logCount).toBe(3);
    expect(study.perLog).toHaveLength(3);
  });

  it('totals each pattern across the deck', () => {
    expect(study.byPattern).toHaveLength(PATTERNS.length);
    expect(study.byPattern[0].value).toBeGreaterThan(0);
  });

  it('counts how many logs each pattern is best for', () => {
    const counted = study.byPattern.reduce((sum, row) => sum + row.bestForLogs, 0);
    expect(counted).toBe(3);
  });

  it('never values one pattern for the whole deck above picking per log', () => {
    expect(study.perLogValue).toBeGreaterThanOrEqual(study.singlePatternValue);
    expect(study.uplift).toBeGreaterThanOrEqual(0);
  });

  it('names the best single pattern', () => {
    expect(PATTERNS).toContain(study.bestSinglePattern);
  });

  it('refuses an empty deck', () => {
    expect(() => studyDeck([], list)).toThrow(StudyError);
  });
});

describe('studySummary', () => {
  it('reports recovery factor and overrun together', () => {
    const study = studyDeck(deck, list);
    const summary = studySummary(deck, study, 'doyle');
    expect(summary.lrf).toBeGreaterThan(0);
    expect(summary.rule).toBe('doyle');
    expect(summary.valuePerMbf).toBeGreaterThan(0);
  });

  it('gives a different overrun under a different rule and the same recovery', () => {
    const study = studyDeck(deck, list);
    const doyle = studySummary(deck, study, 'doyle');
    const international = studySummary(deck, study, 'international');
    expect(doyle.overrunShare).not.toBe(international.overrunShare);
    expect(doyle.lrf).toBe(international.lrf);
  });
});

describe('studyAssumptions', () => {
  it('says what it assumed', () => {
    const lines = studyAssumptions();
    expect(lines.join(' ')).toContain('1C');
    expect(lines.join(' ')).toContain('no defect map');
  });

  it('reflects the options it was given', () => {
    expect(studyAssumptions({ baseGrade: '2AC' }).join(' ')).toContain('2AC');
  });
});
