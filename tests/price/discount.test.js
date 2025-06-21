import { describe, expect, it } from 'vitest';
import { PriceError } from '../../src/price/list.js';
import {
  bandFor,
  invoicePrice,
  makeSchedule,
  periodPosition,
  rebateOwed,
  worthOfCrossing,
} from '../../src/price/discount.js';

const schedule = makeSchedule({
  customer: 'Ferrum Millwork',
  bands: [
    { fromMbf: 20, share: 0.02 },
    { fromMbf: 60, share: 0.04 },
  ],
  rebateBands: [
    { fromMbf: 100, share: 0.01 },
    { fromMbf: 250, share: 0.025 },
  ],
  freightAllowancePerMbf: 30,
});

describe('makeSchedule', () => {
  it('sorts the bands', () => {
    const out = makeSchedule({
      customer: 'x',
      bands: [
        { fromMbf: 60, share: 0.04 },
        { fromMbf: 20, share: 0.02 },
      ],
    });
    expect(out.bands.map((band) => band.fromMbf)).toEqual([20, 60]);
  });

  it('refuses a schedule with no customer', () => {
    expect(() => makeSchedule({})).toThrow(PriceError);
  });

  it('refuses two bands at the same volume', () => {
    expect(() =>
      makeSchedule({
        customer: 'x',
        bands: [
          { fromMbf: 20, share: 0.02 },
          { fromMbf: 20, share: 0.03 },
        ],
      })
    ).toThrow(PriceError);
  });

  it('refuses a share that is not a discount', () => {
    expect(() => makeSchedule({ customer: 'x', bands: [{ fromMbf: 20, share: 0.9 }] })).toThrow(
      PriceError
    );
  });

  it('refuses a negative freight allowance', () => {
    expect(() => makeSchedule({ customer: 'x', freightAllowancePerMbf: -1 })).toThrow(PriceError);
  });
});

describe('bandFor', () => {
  it('finds nothing under the first band', () => {
    expect(bandFor(schedule.bands, 5)).toBeNull();
  });

  it('finds the band a volume reached', () => {
    expect(bandFor(schedule.bands, 30).fromMbf).toBe(20);
    expect(bandFor(schedule.bands, 90).fromMbf).toBe(60);
  });

  it('finds a band at exactly its start', () => {
    expect(bandFor(schedule.bands, 20).fromMbf).toBe(20);
  });
});

describe('invoicePrice', () => {
  it('gives no discount under the first band', () => {
    const result = invoicePrice(schedule, 1400, 10);
    expect(result.discountShare).toBe(0);
    expect(result.netPerMbf).toBe(1400);
  });

  it('discounts once the period reaches a band', () => {
    const result = invoicePrice(schedule, 1400, 10, { periodMbf: 15 });
    expect(result.band).toBe(20);
    expect(result.netPerMbf).toBe(1372);
  });

  it('gives the load that crosses the band the better price itself', () => {
    expect(invoicePrice(schedule, 1400, 25).band).toBe(20);
  });

  it('reprices everything at the band rather than marginally', () => {
    const result = invoicePrice(schedule, 1400, 30, { periodMbf: 50 });
    expect(result.discountShare).toBe(0.04);
  });

  it('takes the freight allowance off the invoice', () => {
    const result = invoicePrice(schedule, 1400, 10);
    expect(result.invoicePerMbf).toBe(1370);
    expect(result.value).toBe(13700);
  });

  it('refuses a discount with no list price', () => {
    expect(() => invoicePrice(schedule, 0, 10)).toThrow(PriceError);
  });
});

describe('rebateOwed', () => {
  it('owes nothing under the first rebate band', () => {
    const result = rebateOwed(schedule, 50, 1300);
    expect(result.owed).toBe(0);
    expect(result.band).toBeNull();
  });

  it('owes on the whole period once a band is reached', () => {
    const result = rebateOwed(schedule, 120, 1300);
    expect(result.band).toBe(100);
    expect(result.owed).toBeCloseTo(120 * 1300 * 0.01, 2);
  });

  it('says how much more would reach the next band', () => {
    const result = rebateOwed(schedule, 120, 1300);
    expect(result.nextBandAt).toBe(250);
    expect(result.moreForNextBand).toBe(130);
  });

  it('says there is no next band at the top', () => {
    expect(rebateOwed(schedule, 400, 1300).nextBandAt).toBeNull();
  });
});

describe('worthOfCrossing', () => {
  it('finds nothing for a package that crosses nothing', () => {
    const result = worthOfCrossing(schedule, 1400, 30, 5, 1300);
    expect(result.crossesRebateBand).toBe(false);
    expect(result.rebateGain).toBe(0);
  });

  it('finds a package that crosses a rebate band worth far more than its own rebate', () => {
    const result = worthOfCrossing(schedule, 1400, 99, 2, 1300);
    expect(result.crossesRebateBand).toBe(true);
    const rebateOnTheExtraAlone = 2 * 1300 * 0.01;
    expect(result.rebateGain).toBeGreaterThan(rebateOnTheExtraAlone * 20);
  });

  it('reports the gain per thousand', () => {
    expect(worthOfCrossing(schedule, 1400, 99, 2, 1300).worthPerMbf).toBeGreaterThan(0);
  });

  it('reports nothing per thousand on an empty package', () => {
    expect(worthOfCrossing(schedule, 1400, 99, 0, 1300).worthPerMbf).toBe(0);
  });
});

describe('periodPosition', () => {
  const loads = [12, 15, 20, 40, 25];

  it('invoices each load at the band the period had reached', () => {
    const position = periodPosition(schedule, loads, 1400);
    expect(position.invoices[0].discountShare).toBe(0);
    expect(position.invoices.at(-1).discountShare).toBe(0.04);
  });

  it('totals the period', () => {
    const position = periodPosition(schedule, loads, 1400);
    expect(position.periodMbf).toBe(112);
    expect(position.loads).toBe(5);
  });

  it('owes a rebate once the period passes the band', () => {
    expect(periodPosition(schedule, loads, 1400).rebate.owed).toBeGreaterThan(0);
  });

  it('owes nothing on a short period', () => {
    expect(periodPosition(schedule, [10], 1400).rebate.owed).toBe(0);
  });

  it('reports an average that is under the list', () => {
    const position = periodPosition(schedule, loads, 1400);
    expect(position.averagePerMbf).toBeLessThan(1400);
  });
});
