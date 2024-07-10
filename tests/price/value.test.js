import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { PriceError, makePriceList } from '../../src/price/list.js';
import {
  compareTerms,
  upgradeValue,
  valueLoad,
  valueLog,
  withAveragePrice,
} from '../../src/price/value.js';

const list = makePriceList({
  id: 'PL-1',
  effectiveFrom: '2024-01-01',
  base: {
    'red oak': 1400,
    'white oak': 1500,
    'black walnut': 2600,
    'yellow poplar': 700,
  },
});

function log(id, species, axis, lengthFt = 12, defects = [], extra = {}) {
  return makeLog({
    id,
    species,
    position: 'butt',
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
    defects,
    ...extra,
  });
}

describe('valueLog', () => {
  it('values a clean walnut butt as veneer', () => {
    const result = valueLog(log('L-1', 'black walnut', 24), 'doyle', list);
    expect(result.market).toBe('veneer');
    expect(result.value).toBeGreaterThan(0);
    expect(result.perMbf).toBeGreaterThan(2600);
  });

  it('values a poplar of the same size far lower and sends it to the factory', () => {
    const walnut = valueLog(log('L-1', 'black walnut', 24), 'doyle', list);
    const poplar = valueLog(log('L-2', 'yellow poplar', 24), 'doyle', list);
    expect(poplar.value).toBeLessThan(walnut.value);
    expect(poplar.market).toBe('factory');
  });

  it('sends a clean red oak butt to veneer too, because we peel red oak', () => {
    expect(valueLog(log('L-2', 'red oak', 24), 'doyle', list).market).toBe('veneer');
  });

  it('gives a culled log nothing and says why', () => {
    const rotten = log('L-3', 'red oak', 20, 12, [
      { type: 'heart rot', widthIn: 14, depthIn: 14, lengthFt: 12 },
    ]);
    const result = valueLog(rotten, 'doyle', list);
    expect(result.value).toBe(0);
    expect(result.reason).toBeTruthy();
  });

  it('carries the rule and the list that produced the number', () => {
    const result = valueLog(log('L-1', 'red oak', 20), 'international', list);
    expect(result.rule).toBe('international');
    expect(result.priceList).toBe('PL-1');
  });

  it('gives a different value under a different rule', () => {
    const one = valueLog(log('L-1', 'red oak', 15), 'doyle', list);
    const two = valueLog(log('L-1', 'red oak', 15), 'international', list);
    expect(one.value).not.toBe(two.value);
    expect(one.grade).toBe(two.grade);
  });

  it('gives a different value when a market is shut', () => {
    const walnut = log('L-1', 'black walnut', 24);
    const open = valueLog(walnut, 'doyle', list);
    const shut = valueLog(walnut, 'doyle', list, { markets: ['factory', 'tie', 'pulp'] });
    expect(shut.value).toBeLessThan(open.value);
    expect(shut.market).toBe('factory');
  });

  it('says so when nothing would take the log', () => {
    const short = makeLog({
      id: 'L-9',
      species: 'red oak',
      axesIn: [20, 20],
      measuredLengthFt: 5,
    });
    expect(valueLog(short, 'doyle', list).reason).toBeTruthy();
  });
});

describe('valueLoad', () => {
  const logs = [
    log('L-1', 'red oak', 20),
    log('L-2', 'white oak', 22),
    log('L-3', 'yellow poplar', 16),
  ];

  it('values every log and totals the load', () => {
    const result = valueLoad(logs, 'doyle', list);
    expect(result.lines).toHaveLength(3);
    expect(result.value).toBeCloseTo(
      result.lines.reduce((sum, line) => sum + line.value, 0),
      2
    );
  });

  it('counts the logs that earned something', () => {
    expect(valueLoad(logs, 'doyle', list).earningCount).toBe(3);
  });

  it('works out the average realised price', () => {
    const result = withAveragePrice(valueLoad(logs, 'doyle', list));
    expect(result.averagePerMbf).toBeGreaterThan(0);
    expect(result.averagePerMbf).toBeCloseTo((result.value / result.netBoardFeet) * 1000, 1);
  });

  it('reports a zero average on an empty load', () => {
    expect(withAveragePrice(valueLoad([], 'doyle', list)).averagePerMbf).toBe(0);
  });
});

describe('compareTerms', () => {
  const logs = [log('L-1', 'red oak', 15), log('L-2', 'red oak', 26)];

  it('separates the scale difference from the price difference', () => {
    const result = compareTerms(
      logs,
      list,
      { rule: 'doyle', label: 'their contract' },
      { rule: 'international', label: 'our study' }
    );
    expect(result.scaleDifferenceBoardFeet).not.toBe(0);
    expect(result.valueDifference).not.toBe(0);
    expect(result.left.label).toBe('their contract');
  });

  it('shows international finding more wood in small logs than doyle', () => {
    const smallOnly = [log('L-1', 'red oak', 15)];
    const result = compareTerms(smallOnly, list, { rule: 'doyle' }, { rule: 'international' });
    expect(result.scaleDifferenceBoardFeet).toBeGreaterThan(0);
  });

  it('reports no price difference when the grades do not move', () => {
    const result = compareTerms(logs, list, { rule: 'doyle' }, { rule: 'doyle' });
    expect(result.valueDifference).toBe(0);
    expect(result.priceDifferencePerMbf).toBe(0);
  });
});

describe('upgradeValue', () => {
  const ladder = ['FAS', 'F1F', 'SEL', '1C', '2AC', '3AC'];
  const logs = [log('L-1', 'red oak', 20)];

  it('refuses a ladder it cannot walk', () => {
    expect(() => upgradeValue(logs, 'doyle', list, ['FAS'])).toThrow(PriceError);
  });

  it('finds nothing to gain on a log already at the top', () => {
    const result = upgradeValue(logs, 'doyle', list, ['F1', 'F2', 'F3']);
    expect(result.upliftValue).toBeGreaterThanOrEqual(0);
  });

  it('finds an uplift for a log one step down a ladder it is on', () => {
    const result = upgradeValue(logs, 'doyle', list, ['F1', 'F2', 'F3']);
    expect(result.baseValue).toBeGreaterThan(0);
    expect(result.upliftShare).toBeGreaterThanOrEqual(0);
  });

  it('walks a ladder the logs are not on and finds nothing', () => {
    expect(upgradeValue(logs, 'doyle', list, ladder).upliftValue).toBe(0);
  });
});
