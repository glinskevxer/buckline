import { describe, expect, it } from 'vitest';
import {
  VarianceError,
  biggestMovers,
  decompose,
  mixOf,
  shares,
  summarise,
} from '../../src/analysis/variance.js';

const plan = [
  { grade: 'FAS', mbf: 40, perMbf: 1400 },
  { grade: '1C', mbf: 60, perMbf: 800 },
];

describe('mixOf', () => {
  it('reports the share per grade', () => {
    const mix = mixOf(plan);
    expect(mix.get('FAS')).toBeCloseTo(0.4, 6);
    expect(mix.get('1C')).toBeCloseTo(0.6, 6);
  });

  it('reports nothing for an empty month', () => {
    expect(mixOf([{ grade: 'FAS', mbf: 0, perMbf: 1400 }]).size).toBe(0);
  });
});

describe('decompose', () => {
  it('finds nothing moved when the month matched the plan', () => {
    const result = decompose(plan, plan);
    expect(result.difference).toBe(0);
    for (const part of result.parts) expect(part.amount).toBe(0);
  });

  it('puts more wood at the same mix and price entirely on volume', () => {
    const more = plan.map((line) => ({ ...line, mbf: line.mbf * 1.2 }));
    const result = decompose(plan, more);
    expect(result.parts.find((part) => part.part === 'volume').amount).toBeGreaterThan(0);
    expect(result.parts.find((part) => part.part === 'mix').amount).toBe(0);
    expect(result.parts.find((part) => part.part === 'price').amount).toBe(0);
  });

  it('puts a better grade mix at the same volume entirely on mix', () => {
    const better = [
      { grade: 'FAS', mbf: 60, perMbf: 1400 },
      { grade: '1C', mbf: 40, perMbf: 800 },
    ];
    const result = decompose(plan, better);
    expect(result.parts.find((part) => part.part === 'volume').amount).toBe(0);
    expect(result.parts.find((part) => part.part === 'mix').amount).toBeGreaterThan(0);
  });

  it('puts a market move entirely on price', () => {
    const dearer = plan.map((line) => ({ ...line, perMbf: line.perMbf * 1.1 }));
    const result = decompose(plan, dearer);
    expect(result.parts.find((part) => part.part === 'price').amount).toBeGreaterThan(0);
    expect(result.parts.find((part) => part.part === 'volume').amount).toBe(0);
  });

  it('always adds the parts back to the difference', () => {
    const messy = [
      { grade: 'FAS', mbf: 55, perMbf: 1500 },
      { grade: '1C', mbf: 35, perMbf: 760 },
    ];
    const result = decompose(plan, messy);
    expect(result.unexplained).toBeCloseTo(0, 1);
  });

  it('says the rate is not known when no costs were given', () => {
    const result = decompose(plan, plan);
    expect(result.rateKnown).toBe(false);
    expect(result.parts.map((part) => part.part)).not.toContain('rate');
  });

  it('adds a rate part when the costs are known', () => {
    const result = decompose(plan, plan, { planCost: 40000, actualCost: 44000 });
    expect(result.rateKnown).toBe(true);
    expect(result.parts.find((part) => part.part === 'rate').amount).toBe(-4000);
  });

  it('names an owner for every part', () => {
    const result = decompose(plan, plan, { planCost: 1, actualCost: 1 });
    for (const part of result.parts) expect(part.owner).toBeTruthy();
  });

  it('carries the two volumes', () => {
    const more = plan.map((line) => ({ ...line, mbf: line.mbf * 2 }));
    const result = decompose(plan, more);
    expect(result.planVolume).toBe(100);
    expect(result.actualVolume).toBe(200);
  });

  it('refuses a variance with no plan or no actual', () => {
    expect(() => decompose([], plan)).toThrow(VarianceError);
    expect(() => decompose(plan, [])).toThrow(VarianceError);
  });

  it('handles a grade that only the actual has', () => {
    const extra = [...plan, { grade: '2AC', mbf: 10, perMbf: 400 }];
    const result = decompose(plan, extra);
    expect(result.unexplained).toBeCloseTo(0, 1);
  });
});

describe('biggestMovers and shares', () => {
  const messy = [
    { grade: 'FAS', mbf: 20, perMbf: 1500 },
    { grade: '1C', mbf: 90, perMbf: 780 },
  ];
  const result = decompose(plan, messy);

  it('puts the biggest move first, by size not by sign', () => {
    const movers = biggestMovers(result);
    expect(Math.abs(movers[0].amount)).toBeGreaterThanOrEqual(Math.abs(movers.at(-1).amount));
  });

  it('shares against the absolute moves, so two that cancel still show', () => {
    const rows = shares(result);
    const total = rows.reduce((sum, row) => sum + row.share, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it('reports a zero share on a month that matched the plan', () => {
    for (const row of shares(decompose(plan, plan))) {
      expect(row.share).toBe(0);
    }
  });
});

describe('summarise', () => {
  it('says the month was on plan when it was', () => {
    expect(summarise(decompose(plan, plan))).toBe('the month came in on plan');
  });

  it('names the direction and the biggest mover', () => {
    const more = plan.map((line) => ({ ...line, mbf: line.mbf * 1.5 }));
    const line = summarise(decompose(plan, more));
    expect(line).toContain('over plan');
    expect(line).toContain('volume');
    expect(line).toContain('the woods');
  });

  it('says under plan when it came in under', () => {
    const less = plan.map((line) => ({ ...line, mbf: line.mbf * 0.5 }));
    expect(summarise(decompose(plan, less))).toContain('under plan');
  });
});
