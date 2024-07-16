import { describe, expect, it } from 'vitest';
import { makePriceList } from '../../src/price/list.js';
import { BuckError, cutCandidates, makeStem } from '../../src/buck/stem.js';
import { withLengthClasses } from '../../src/buck/candidates.js';
import { buckStem, compareBucking } from '../../src/buck/optimize.js';

const list = makePriceList({
  id: 'PL-1',
  effectiveFrom: '2024-01-01',
  base: { 'red oak': 1400, 'yellow poplar': 700 },
});

function stemOf(defects = [], species = 'red oak') {
  return makeStem({
    id: 'S-1',
    species,
    profile: [
      { atFt: 0, diameterIn: 26 },
      { atFt: 4, diameterIn: 22 },
      { atFt: 20, diameterIn: 18 },
      { atFt: 40, diameterIn: 12 },
      { atFt: 52, diameterIn: 6 },
    ],
    defects,
  });
}

function positionsFor(stem) {
  const top = 40;
  return withLengthClasses(stem, cutCandidates(stem, { topDiameterIn: 12 }), { topFt: top });
}

describe('buckStem', () => {
  const stem = stemOf();
  const positions = positionsFor(stem);

  it('cuts a clean stem into logs worth something', () => {
    const result = buckStem(stem, positions, 'doyle', list);
    expect(result.logCount).toBeGreaterThan(1);
    expect(result.value).toBeGreaterThan(0);
  });

  it('never overlaps two logs', () => {
    const result = buckStem(stem, positions, 'doyle', list);
    for (let i = 1; i < result.logs.length; i += 1) {
      expect(result.logs[i].fromFt).toBeGreaterThanOrEqual(result.logs[i - 1].toFt);
    }
  });

  it('totals to the value of the logs it chose', () => {
    const result = buckStem(stem, positions, 'doyle', list);
    const sum = result.logs.reduce((total, log) => total + log.value, 0);
    expect(result.value).toBeCloseTo(sum, 2);
  });

  it('reports the wood it left behind', () => {
    const result = buckStem(stem, positions, 'doyle', list);
    expect(result.wasteLengthFt).toBeGreaterThanOrEqual(0);
    expect(result.usedLengthFt + result.wasteLengthFt).toBeCloseTo(40 - stem.stumpHeightFt, 1);
  });

  it('takes fewer logs when it is only allowed fewer', () => {
    const many = buckStem(stem, positions, 'doyle', list);
    const one = buckStem(stem, positions, 'doyle', list, { maxLogs: 1 });
    expect(one.logCount).toBe(1);
    expect(one.value).toBeLessThan(many.value);
  });

  it('never returns more logs than it was allowed', () => {
    for (const maxLogs of [1, 2, 3]) {
      expect(buckStem(stem, positions, 'doyle', list, { maxLogs }).logCount).toBeLessThanOrEqual(
        maxLogs
      );
    }
  });

  it('refuses fewer than two positions or no logs at all', () => {
    expect(() => buckStem(stem, [0.5], 'doyle', list)).toThrow(BuckError);
    expect(() => buckStem(stem, positions, 'doyle', list, { maxLogs: 0 })).toThrow(BuckError);
  });

  it('finds nothing on a stem with nothing merchantable in it', () => {
    const tiny = makeStem({
      id: 'S-2',
      species: 'red oak',
      profile: [
        { atFt: 0, diameterIn: 7 },
        { atFt: 10, diameterIn: 5 },
      ],
    });
    const result = buckStem(tiny, [0.5, 10], 'doyle', list);
    expect(result.logCount).toBe(0);
    expect(result.value).toBe(0);
  });

  it('is worth less on a defective stem than on a clean one cut the same way', () => {
    const knotty = stemOf([{ type: 'catface', atFt: 20, lengthFt: 3 }]);
    const shared = positionsFor(knotty);
    const withDefect = buckStem(knotty, shared, 'doyle', list);
    const withoutDefect = buckStem(stemOf(), shared, 'doyle', list);
    expect(withDefect.value).toBeGreaterThan(0);
    expect(withDefect.value).toBeLessThanOrEqual(withoutDefect.value);
  });

  it('finds more value when it is offered more places to cut', () => {
    const clean = stemOf();
    const few = buckStem(clean, cutCandidates(clean, { topDiameterIn: 12 }), 'doyle', list);
    const many = buckStem(clean, positionsFor(clean), 'doyle', list);
    expect(many.value).toBeGreaterThan(few.value);
  });

  it('does not visit the same state twice', () => {
    const result = buckStem(stem, positions, 'doyle', list);
    expect(result.statesVisited).toBeGreaterThan(0);
    expect(result.statesVisited).toBeLessThan(positions.length * positions.length);
  });
});

describe('compareBucking', () => {
  const stem = stemOf();
  const positions = positionsFor(stem);

  it('gives the same pattern the same value under the same terms', () => {
    const result = compareBucking(
      stem,
      positions,
      { rule: 'doyle', priceList: list },
      { rule: 'doyle', priceList: list }
    );
    expect(result.samePattern).toBe(true);
    expect(result.valueDifference).toBe(0);
  });

  it('finds a different total under a different rule', () => {
    const result = compareBucking(
      stem,
      positions,
      { rule: 'doyle', priceList: list, label: 'their contract' },
      { rule: 'international', priceList: list, label: 'our study' }
    );
    expect(result.valueDifference).not.toBe(0);
    expect(result.left.label).toBe('their contract');
  });

  it('can move where the cuts go, not just what they are worth', () => {
    const cheap = makePriceList({
      id: 'PL-2',
      effectiveFrom: '2024-01-01',
      base: { 'red oak': 400 },
    });
    const result = compareBucking(
      stem,
      positions,
      { rule: 'doyle', priceList: list },
      { rule: 'international', priceList: cheap }
    );
    expect(result.right.value).toBeLessThan(result.left.value);
  });
});
