import { describe, expect, it } from 'vitest';
import { GRADE_MULTIPLIER, makePriceList, priceFor, valueOf } from '../../src/price/list.js';
import { makeSeries, averageOver, readingOn } from '../../src/price/series.js';
import {
  invoicePrice,
  makeSchedule,
  periodPosition,
  rebateOwed,
} from '../../src/price/discount.js';
import { valueLoad, valueLog, withAveragePrice } from '../../src/price/value.js';
import { makeLog } from '../../src/model/log.js';
import { speciesKeys } from '../../src/model/species.js';
import { ruleIds } from '../../src/scale/rules/index.js';
import { forEachSample, numberBetween, oneOf, rng, someLog } from './generators.js';

const list = makePriceList({
  id: 'PL-1',
  effectiveFrom: '2024-01-01',
  base: Object.fromEntries(speciesKeys().map((key) => [key, 800 + key.length * 40])),
});

describe('the price list', () => {
  it('prices every species at every grade it can produce', () => {
    for (const species of speciesKeys()) {
      for (const grade of Object.keys(GRADE_MULTIPLIER)) {
        expect(priceFor(list, species, grade).perMbf).toBeGreaterThan(0);
      }
    }
  });

  it('never prices a lower grade above a higher one in the same species', () => {
    const ladder = ['FAS', 'F1F', 'SEL', '1C', '2AC', '3AC'];
    for (const species of speciesKeys()) {
      const prices = ladder.map((grade) => priceFor(list, species, grade).perMbf);
      for (let i = 1; i < prices.length; i += 1) {
        expect(prices[i]).toBeLessThan(prices[i - 1]);
      }
    }
  });

  it('values footage in proportion', () => {
    const next = rng(307);
    for (let i = 0; i < 200; i += 1) {
      const feet = numberBetween(next, 0, 20000, 0);
      const price = numberBetween(next, 100, 3000, 0);
      expect(valueOf(feet * 2, price)).toBeCloseTo(valueOf(feet, price) * 2, 1);
    }
  });
});

describe('an index series', () => {
  const readings = Array.from({ length: 40 }, (_, i) => ({
    on: `2025-0${1 + Math.floor(i / 8)}-${String((i % 8) * 3 + 1).padStart(2, '0')}`,
    value: 90 + ((i * 7) % 30),
  }));
  const series = makeSeries('index', readings);

  it('never reads a value published after the date asked for', () => {
    for (let i = 0; i < 200; i += 1) {
      const day = `2025-0${1 + (i % 5)}-${String((i % 28) + 1).padStart(2, '0')}`;
      if (day < series.from) continue;
      expect(readingOn(series, day).on <= day).toBe(true);
    }
  });

  it('never averages a reading published after the date asked for', () => {
    for (const day of ['2025-02-10', '2025-03-15', '2025-05-01']) {
      expect(averageOver(series, day, 90).to <= day).toBe(true);
    }
  });

  it('is monotone in the window, in the sense that a wider one sees at least as much', () => {
    for (const day of ['2025-03-15', '2025-05-01']) {
      expect(averageOver(series, day, 120).readings).toBeGreaterThanOrEqual(
        averageOver(series, day, 30).readings
      );
    }
  });
});

describe('discounts', () => {
  const schedule = makeSchedule({
    customer: 'x',
    bands: [
      { fromMbf: 20, share: 0.02 },
      { fromMbf: 60, share: 0.04 },
      { fromMbf: 120, share: 0.06 },
    ],
    rebateBands: [{ fromMbf: 100, share: 0.01 }],
    freightAllowancePerMbf: 20,
  });

  it('never charges more as the period grows', () => {
    let previous = Infinity;
    for (let periodMbf = 0; periodMbf <= 200; periodMbf += 5) {
      const price = invoicePrice(schedule, 1400, 5, { periodMbf }).netPerMbf;
      expect(price).toBeLessThanOrEqual(previous);
      previous = price;
    }
  });

  it('never discounts more than half', () => {
    for (let periodMbf = 0; periodMbf <= 500; periodMbf += 10) {
      expect(invoicePrice(schedule, 1400, 5, { periodMbf }).discountShare).toBeLessThanOrEqual(0.5);
    }
  });

  it('never owes a rebate that falls as the period grows', () => {
    let previous = -1;
    for (let periodMbf = 0; periodMbf <= 400; periodMbf += 10) {
      const owed = rebateOwed(schedule, periodMbf, 1300).owed;
      expect(owed).toBeGreaterThanOrEqual(previous);
      previous = owed;
    }
  });

  it('always invoices a period at or under the list', () => {
    const next = rng(313);
    for (let i = 0; i < 100; i += 1) {
      const loads = Array.from({ length: 6 }, () => numberBetween(next, 1, 40, 1));
      const position = periodPosition(schedule, loads, 1400);
      expect(position.averagePerMbf).toBeLessThanOrEqual(1400);
      expect(position.invoiced).toBeGreaterThan(0);
    }
  });
});

describe('valuing a load', () => {
  it('never values a culled log at anything', () => {
    forEachSample(20250704, 150, someLog, (raw) => {
      const log = makeLog(raw);
      for (const rule of ruleIds()) {
        const valued = valueLog(log, rule, list);
        if (valued.market === null) expect(valued.value).toBe(0);
      }
    });
  });

  it('never values a load at less than nothing', () => {
    forEachSample(20250705, 100, someLog, (raw) => {
      const log = makeLog(raw);
      const rule = oneOf(rng(raw.id.length + 1), ruleIds());
      expect(valueLoad([log], rule, list).value).toBeGreaterThanOrEqual(0);
    });
  });

  it('always totals a load from its own lines', () => {
    forEachSample(20250706, 60, someLog, (raw, index) => {
      const logs = [makeLog(raw), makeLog({ ...raw, id: `${raw.id}-b-${index}` })];
      const result = withAveragePrice(valueLoad(logs, 'doyle', list));
      const lineTotal = result.lines.reduce((sum, line) => sum + line.value, 0);
      expect(result.value).toBeCloseTo(lineTotal, 1);
    });
  });
});
