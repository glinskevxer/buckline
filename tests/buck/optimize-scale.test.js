import { describe, expect, it } from 'vitest';
import { makePriceList } from '../../src/price/list.js';
import { cutCandidates, makeStem } from '../../src/buck/stem.js';
import { withLengthClasses } from '../../src/buck/candidates.js';
import { buckStem } from '../../src/buck/optimize.js';

const list = makePriceList({
  id: 'PL-1',
  effectiveFrom: '2024-01-01',
  base: { 'red oak': 1400 },
});

/**
 * A long stem with a defect every few feet, which is what produces a fine
 * position grid. The old recursive optimiser nested once per log down the
 * stem and this is the shape that found the bottom of the stack.
 */
function longStem(defectCount) {
  const defects = [];
  for (let i = 0; i < defectCount; i += 1) {
    defects.push({ type: 'seam', atFt: 3 + i * 2.5, lengthFt: 0.5 });
  }
  return makeStem({
    id: 'S-long',
    species: 'red oak',
    profile: [
      { atFt: 0, diameterIn: 34 },
      { atFt: 6, diameterIn: 30 },
      { atFt: 40, diameterIn: 24 },
      { atFt: 80, diameterIn: 14 },
      { atFt: 100, diameterIn: 6 },
    ],
    defects,
  });
}

describe('a long stem with a fine position grid', () => {
  const stem = longStem(12);
  const positions = withLengthClasses(stem, cutCandidates(stem, { topDiameterIn: 12 }), {
    topFt: 86,
  });

  it('offers well over a hundred cut positions', () => {
    expect(positions.length).toBeGreaterThan(60);
  });

  it('bucks it without running out of stack', () => {
    const result = buckStem(stem, positions, 'doyle', list, { maxLogs: 6 });
    expect(result.logCount).toBeGreaterThan(0);
    expect(result.value).toBeGreaterThan(0);
  });

  it('visits a bounded number of states', () => {
    const result = buckStem(stem, positions, 'doyle', list, { maxLogs: 6 });
    expect(result.statesVisited).toBeLessThanOrEqual(6 * positions.length);
  });

  it('never overlaps two logs however many positions there are', () => {
    const result = buckStem(stem, positions, 'doyle', list, { maxLogs: 6 });
    for (let i = 1; i < result.logs.length; i += 1) {
      expect(result.logs[i].fromFt).toBeGreaterThanOrEqual(result.logs[i - 1].toFt);
    }
  });

  it('finds at least as much value when allowed more logs', () => {
    const four = buckStem(stem, positions, 'doyle', list, { maxLogs: 4 }).value;
    const six = buckStem(stem, positions, 'doyle', list, { maxLogs: 6 }).value;
    expect(six).toBeGreaterThanOrEqual(four);
  });

  it('never takes more logs than the stem has length for', () => {
    const result = buckStem(stem, positions, 'doyle', list, { maxLogs: 20 });
    expect(result.usedLengthFt).toBeLessThanOrEqual(86);
  });
});
