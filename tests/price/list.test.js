import { describe, expect, it } from 'vitest';
import {
  GRADE_MULTIPLIER,
  PriceError,
  inForceOn,
  listOn,
  makePriceList,
  priceFor,
  valueOf,
} from '../../src/price/list.js';

const spec = {
  id: 'PL-2024-06',
  effectiveFrom: '2024-06-01',
  effectiveTo: '2024-08-31',
  rows: [
    { species: 'red oak', grade: 'FAS', quarters: 4, perMbf: 1450 },
    { species: 'red oak', grade: 'FAS', perMbf: 1380 },
    { species: 'red oak', grade: '1C', perMbf: 720 },
  ],
  base: { 'hard maple': 1600, 'Yellow Poplar': 700 },
};

const list = makePriceList(spec);

describe('makePriceList', () => {
  it('needs an identifier and a date', () => {
    expect(() => makePriceList({ effectiveFrom: '2024-01-01' })).toThrow(PriceError);
    expect(() => makePriceList({ id: 'a' })).toThrow(PriceError);
  });

  it('refuses a list that ends before it starts', () => {
    expect(() =>
      makePriceList({ id: 'a', effectiveFrom: '2024-06-01', effectiveTo: '2024-01-01' })
    ).toThrow(PriceError);
  });

  it('refuses a quote with no price', () => {
    expect(() =>
      makePriceList({
        id: 'a',
        effectiveFrom: '2024-06-01',
        rows: [{ species: 'red oak', grade: 'FAS', perMbf: 0 }],
      })
    ).toThrow(PriceError);
  });

  it('refuses a base price that is not a price', () => {
    expect(() =>
      makePriceList({ id: 'a', effectiveFrom: '2024-06-01', base: { 'red oak': -5 } })
    ).toThrow(PriceError);
  });

  it('normalises the species on the way in', () => {
    expect(priceFor(list, 'YELLOW POPLAR', 'FAS').perMbf).toBe(700);
  });
});

describe('priceFor', () => {
  it('takes the exact quote when the thickness matches', () => {
    const result = priceFor(list, 'red oak', 'FAS', { quarters: 4 });
    expect(result.perMbf).toBe(1450);
    expect(result.route).toContain('this thickness');
  });

  it('falls back to the any thickness quote', () => {
    const result = priceFor(list, 'red oak', 'FAS', { quarters: 8 });
    expect(result.perMbf).toBe(1380);
    expect(result.route).toContain('any thickness');
  });

  it('falls back to the species base times the grade multiplier', () => {
    const result = priceFor(list, 'hard maple', '1C');
    expect(result.perMbf).toBeCloseTo(1600 * GRADE_MULTIPLIER['1C'], 2);
    expect(result.route).toContain('multiplier');
  });

  it('never falls back across species', () => {
    expect(() => priceFor(list, 'white oak', 'FAS')).toThrow(PriceError);
  });

  it('refuses a grade it has no multiplier for', () => {
    expect(() => priceFor(list, 'hard maple', 'F5')).toThrow(PriceError);
  });

  it('prices veneer above every sawlog grade', () => {
    expect(priceFor(list, 'hard maple', 'veneer').perMbf).toBeGreaterThan(
      priceFor(list, 'hard maple', 'FAS').perMbf
    );
  });

  it('prices the grades in order within a species', () => {
    const order = ['FAS', 'F1F', 'SEL', '1C', '2AC', '3AC'];
    const prices = order.map((grade) => priceFor(list, 'hard maple', grade).perMbf);
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]).toBeLessThan(prices[i - 1]);
    }
  });

  it('names the species and grade it priced', () => {
    expect(priceFor(list, 'Red Oak', '1C')).toMatchObject({ species: 'red oak', grade: '1C' });
  });
});

describe('inForceOn', () => {
  it('is in force inside its window', () => {
    expect(inForceOn(list, '2024-07-01')).toBe(true);
  });

  it('is not in force either side', () => {
    expect(inForceOn(list, '2024-05-31')).toBe(false);
    expect(inForceOn(list, '2024-09-01')).toBe(false);
  });

  it('runs open ended when there is no end date', () => {
    const open = makePriceList({ id: 'b', effectiveFrom: '2024-09-01' });
    expect(inForceOn(open, '2030-01-01')).toBe(true);
  });
});

describe('listOn', () => {
  const later = makePriceList({ id: 'PL-2024-07', effectiveFrom: '2024-07-01' });

  it('picks the list in force on the date', () => {
    expect(listOn([list, later], '2024-06-15').id).toBe('PL-2024-06');
  });

  it('picks the latest when two overlap', () => {
    expect(listOn([list, later], '2024-07-15').id).toBe('PL-2024-07');
  });

  it('refuses a date no list covers', () => {
    expect(() => listOn([list], '2023-01-01')).toThrow(PriceError);
  });
});

describe('valueOf', () => {
  it('prices per thousand board feet', () => {
    expect(valueOf(1000, 1450)).toBe(1450);
    expect(valueOf(500, 1450)).toBe(725);
  });

  it('prices nothing at nothing', () => {
    expect(valueOf(0, 1450)).toBe(0);
  });

  it('refuses negative footage', () => {
    expect(() => valueOf(-100, 1450)).toThrow(PriceError);
  });
});
