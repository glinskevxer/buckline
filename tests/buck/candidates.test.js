import { describe, expect, it } from 'vitest';
import { makePriceList } from '../../src/price/list.js';
import { BuckError, cutCandidates, makeStem } from '../../src/buck/stem.js';
import {
  bestSingleLog,
  candidateLog,
  totalValue,
  valuedCandidates,
  withLengthClasses,
} from '../../src/buck/candidates.js';

const list = makePriceList({
  id: 'PL-1',
  effectiveFrom: '2024-01-01',
  base: { 'red oak': 1400 },
});

const stem = makeStem({
  id: 'S-1',
  species: 'red oak',
  profile: [
    { atFt: 0, diameterIn: 26 },
    { atFt: 4, diameterIn: 22 },
    { atFt: 20, diameterIn: 18 },
    { atFt: 40, diameterIn: 12 },
    { atFt: 52, diameterIn: 6 },
  ],
  defects: [{ type: 'catface', atFt: 22, lengthFt: 2 }],
});

describe('candidateLog', () => {
  it('takes the small end off the upper cut', () => {
    const log = candidateLog(stem, 0.5, 16.5);
    expect(log.axesIn[0]).toBeCloseTo(18.875, 2);
    expect(log.largeEndIn).toBeCloseTo(25.5, 1);
  });

  it('calls the first cut a butt log', () => {
    expect(candidateLog(stem, 0.5, 16.5).position).toBe('butt');
  });

  it('calls anything above it an upper log', () => {
    expect(candidateLog(stem, 16.5, 32.5).position).toBe('upper');
  });

  it('shifts the defects into log coordinates', () => {
    const log = candidateLog(stem, 20, 36);
    expect(log.defects).toHaveLength(1);
    expect(log.defects[0].startFt).toBe(2);
  });

  it('returns nothing for a stretch too short to sell', () => {
    expect(candidateLog(stem, 0.5, 6)).toBeNull();
  });

  it('returns nothing for a stretch with no length', () => {
    expect(candidateLog(stem, 10, 10)).toBeNull();
  });

  it('names the log after the cuts that made it', () => {
    expect(candidateLog(stem, 0.5, 16.5).id).toBe('S-1-0.5-16.5');
  });
});

describe('valuedCandidates', () => {
  const positions = [0.5, 16.5, 32.5, 40];

  it('builds a grid of the candidates between the positions', () => {
    const grid = valuedCandidates(stem, positions, 'doyle', list);
    expect(grid[0][1]).toBeTruthy();
    expect(grid[0][1].nominalLengthFt).toBe(16);
  });

  it('leaves nothing below the diagonal', () => {
    const grid = valuedCandidates(stem, positions, 'doyle', list);
    expect(grid[1][0]).toBeUndefined();
  });

  it('drops a candidate that would earn nothing', () => {
    const grid = valuedCandidates(stem, [0.5, 5, 40], 'doyle', list);
    expect(grid[0][1]).toBeNull();
  });

  it('values a butt log above the same wood taken as an upper log', () => {
    const grid = valuedCandidates(stem, positions, 'doyle', list);
    const butt = grid[0][1];
    expect(butt.market).toBeTruthy();
    expect(butt.value).toBeGreaterThan(0);
  });

  it('refuses fewer than two positions', () => {
    expect(() => valuedCandidates(stem, [0.5], 'doyle', list)).toThrow(BuckError);
  });

  it('gives different values under different rules', () => {
    const doyle = valuedCandidates(stem, positions, 'doyle', list)[0][1].value;
    const international = valuedCandidates(stem, positions, 'international', list)[0][1].value;
    expect(doyle).not.toBe(international);
  });
});

describe('withLengthClasses', () => {
  it('adds a cut at every nominal length above each position', () => {
    const positions = withLengthClasses(stem, [0.5, 40], { topFt: 40 });
    expect(positions).toContain(round(0.5 + 12 + 4 / 12));
    expect(positions.length).toBeGreaterThan(2);
  });

  it('never offers a cut above the ceiling', () => {
    const positions = withLengthClasses(stem, [0.5, 40], { topFt: 40 });
    expect(Math.max(...positions)).toBeLessThanOrEqual(40);
  });

  it('keeps the positions it was given', () => {
    const positions = withLengthClasses(stem, [0.5, 22, 40], { topFt: 40 });
    expect(positions).toContain(22);
  });

  it('offers more cuts under a policy with more length classes', () => {
    const hardwood = withLengthClasses(stem, [0.5], { topFt: 40, trimPolicy: 'hardwood' });
    const softwood = withLengthClasses(stem, [0.5], { topFt: 40, trimPolicy: 'softwood' });
    expect(hardwood.length).toBeGreaterThan(softwood.length);
  });

  it('comes back sorted and without repeats', () => {
    const positions = withLengthClasses(stem, [0.5, 12.833, 40], { topFt: 40 });
    expect(positions).toEqual([...new Set(positions)].sort((a, b) => a - b));
  });
});

describe('bestSingleLog', () => {
  it('finds the best one log off the stem', () => {
    const best = bestSingleLog(stem, cutCandidates(stem, { topDiameterIn: 12 }), 'doyle', list);
    expect(best).toBeTruthy();
    expect(best.value).toBeGreaterThan(0);
  });

  it('finds nothing when no stretch makes a log', () => {
    expect(bestSingleLog(stem, [0.5, 4], 'doyle', list)).toBeNull();
  });
});

describe('totalValue', () => {
  it('adds a set of candidates up', () => {
    expect(totalValue([{ value: 100.5 }, { value: 200.25 }])).toBe(300.75);
  });

  it('adds nothing to nothing', () => {
    expect(totalValue([])).toBe(0);
  });
});

function round(value) {
  return Math.round(value * 1000) / 1000;
}
