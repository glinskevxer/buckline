import { describe, expect, it } from 'vitest';
import { makePriceList } from '../../src/price/list.js';
import { BuckError, cutCandidates, makeStem } from '../../src/buck/stem.js';
import { withLengthClasses } from '../../src/buck/candidates.js';
import { buckStem } from '../../src/buck/optimize.js';
import { againstPlan, cuttingCard, expectedTally, valueLoss } from '../../src/buck/report.js';

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
  defects: [{ type: 'catface', atFt: 24, lengthFt: 2 }],
});

const positions = withLengthClasses(stem, cutCandidates(stem, { topDiameterIn: 12 }), {
  topFt: 40,
});
const result = buckStem(stem, positions, 'doyle', list);

describe('cuttingCard', () => {
  const card = cuttingCard(result);

  it('starts by squaring the butt', () => {
    expect(card[0].action).toBe('trim');
  });

  it('writes one line per log', () => {
    expect(card.filter((line) => line.action === 'log')).toHaveLength(result.logCount);
  });

  it('numbers the steps in order', () => {
    expect(card.map((line) => line.step)).toEqual(card.map((_, index) => index + 1));
  });

  it('measures from the last cut, not from the stump', () => {
    for (const line of card.filter((entry) => entry.action === 'log')) {
      expect(line.fromLastCutFt).toBeLessThan(line.atFt + 1e-9);
      expect(line.fromLastCutFt).toBeGreaterThan(0);
    }
  });

  it('says what each log is meant to be', () => {
    const first = card.find((line) => line.action === 'log');
    expect(first.note).toContain('ft');
    expect(first.logNumber).toBe(1);
  });

  it('calls out a piece that is cut out and thrown away', () => {
    const gapped = {
      logs: [
        { fromFt: 0.5, toFt: 12.5, nominalLengthFt: 12, scalingDiameterIn: 20, grade: 'F1' },
        { fromFt: 16, toFt: 28, nominalLengthFt: 12, scalingDiameterIn: 16, grade: 'F2' },
      ],
    };
    const lines = cuttingCard(gapped);
    expect(lines.some((line) => line.action === 'cut out')).toBe(true);
  });

  it('refuses anything that is not a bucking result', () => {
    expect(() => cuttingCard(null)).toThrow(BuckError);
    expect(() => cuttingCard({})).toThrow(BuckError);
  });
});

describe('valueLoss', () => {
  const loss = valueLoss(stem, positions, 'doyle', list, result);

  it('reports what the chosen pattern was worth', () => {
    expect(loss.chosenValue).toBe(result.value);
  });

  it('reports the best single log as a reference point', () => {
    expect(loss.bestSingleLogValue).toBeGreaterThan(0);
    expect(loss.bestSingleLogValue).toBeLessThanOrEqual(loss.chosenValue);
  });

  it('prices the waste at the average the stem realised', () => {
    expect(loss.wasteValueAtAverage).toBeGreaterThanOrEqual(0);
    if (loss.wasteLengthFt > 0) {
      expect(loss.wasteValueAtAverage).toBeGreaterThan(0);
    }
  });

  it('reports value per foot of stem used', () => {
    expect(loss.valuePerFoot).toBeCloseTo(result.value / result.usedLengthFt, 1);
  });

  it('reports zero per foot when nothing was cut', () => {
    const empty = { ...result, logs: [], logCount: 0, value: 0, usedLengthFt: 0, gaps: [] };
    expect(valueLoss(stem, positions, 'doyle', list, empty).valuePerFoot).toBe(0);
  });
});

describe('expectedTally', () => {
  it('writes a line per log with what the office should see', () => {
    const tally = expectedTally(result);
    expect(tally).toHaveLength(result.logCount);
    expect(tally[0]).toMatchObject({ logNumber: 1 });
    expect(tally[0].netBoardFeet).toBeGreaterThan(0);
  });

  it('carries the log id the candidate was built with', () => {
    expect(expectedTally(result)[0].logId).toContain('S-1');
  });
});

describe('againstPlan', () => {
  it('calls a matching cut as planned', () => {
    const actual = result.logs.map((log) => ({ lengthFt: log.nominalLengthFt }));
    const comparison = againstPlan(result, actual);
    expect(comparison.followedShare).toBe(1);
    expect(comparison.rows.every((row) => row.verdict === 'as planned')).toBe(true);
  });

  it('flags a log cut to the wrong length', () => {
    const actual = result.logs.map((log, index) => ({
      lengthFt: index === 0 ? log.nominalLengthFt - 4 : log.nominalLengthFt,
    }));
    const comparison = againstPlan(result, actual);
    expect(comparison.rows[0].verdict).toBe('off plan');
    expect(comparison.followedShare).toBeLessThan(1);
  });

  it('flags a log the crew did not cut', () => {
    const actual = result.logs.slice(0, -1).map((log) => ({ lengthFt: log.nominalLengthFt }));
    expect(againstPlan(result, actual).rows.at(-1).verdict).toBe('log not cut');
  });

  it('flags a log the crew cut that was not planned', () => {
    const actual = [
      ...result.logs.map((log) => ({ lengthFt: log.nominalLengthFt })),
      { lengthFt: 8 },
    ];
    expect(againstPlan(result, actual).rows.at(-1).verdict).toBe('extra log cut');
  });

  it('forgives a cut inside the tolerance', () => {
    const actual = result.logs.map((log) => ({ lengthFt: log.nominalLengthFt + 0.25 }));
    expect(againstPlan(result, actual).followedShare).toBe(1);
  });

  it('can be told a tighter tolerance', () => {
    const actual = result.logs.map((log) => ({ lengthFt: log.nominalLengthFt + 0.25 }));
    expect(againstPlan(result, actual, { toleranceFt: 0.1 }).followedShare).toBe(0);
  });
});
