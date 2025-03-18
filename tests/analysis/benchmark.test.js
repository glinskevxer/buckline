import { describe, expect, it } from 'vitest';
import {
  BenchmarkError,
  MEASURES,
  against,
  comparable,
  median,
  movement,
  rank,
} from '../../src/analysis/benchmark.js';

const readings = [
  { mill: 'ours', value: 6.4, basis: 'cubic' },
  { mill: 'a', value: 6.9, basis: 'cubic' },
  { mill: 'b', value: 5.8, basis: 'cubic' },
];

describe('comparable', () => {
  it('accepts readings on the same basis', () => {
    expect(comparable(readings, 'lrf').comparable).toBe(true);
  });

  it('refuses readings on different bases', () => {
    const mixed = [
      { mill: 'a', value: 0.3, basis: 'doyle' },
      { mill: 'b', value: 0.05, basis: 'international' },
    ];
    const result = comparable(mixed, 'overrunShare');
    expect(result.comparable).toBe(false);
    expect(result.reasons.join(' ')).toContain('not the same rule');
  });

  it('refuses a reading that does not say what it is measured on', () => {
    expect(comparable([{ mill: 'a', value: 0.3 }], 'overrunShare').comparable).toBe(false);
  });

  it('accepts a measure that has no basis at all', () => {
    expect(comparable([{ mill: 'a', value: 0.02 }], 'degradeShare').comparable).toBe(true);
  });

  it('refuses a measure nobody benchmarks on', () => {
    expect(() => comparable(readings, 'happiness')).toThrow(BenchmarkError);
  });
});

describe('rank', () => {
  const ranked = rank(readings, 'lrf');

  it('puts the best first on a measure where high is better', () => {
    expect(ranked[0].mill).toBe('a');
    expect(ranked[0].place).toBe(1);
  });

  it('puts the best first on a measure where low is better', () => {
    const degrade = [
      { mill: 'a', value: 0.08 },
      { mill: 'b', value: 0.02 },
    ];
    expect(rank(degrade, 'degradeShare')[0].mill).toBe('b');
  });

  it('reports the gap as well as the place', () => {
    const ours = ranked.find((row) => row.mill === 'ours');
    expect(ours.place).toBe(2);
    expect(ours.gapToBest).toBeCloseTo(0.5, 4);
    expect(ours.gapShare).toBeGreaterThan(0);
  });

  it('gives the leader a gap of nothing', () => {
    expect(ranked[0].gapToBest).toBe(0);
  });

  it('refuses a ranking of one', () => {
    expect(() => rank([readings[0]], 'lrf')).toThrow(BenchmarkError);
  });

  it('refuses readings that are not comparable', () => {
    const mixed = [
      { mill: 'a', value: 0.3, basis: 'doyle' },
      { mill: 'b', value: 0.05, basis: 'international' },
    ];
    expect(() => rank(mixed, 'overrunShare')).toThrow(BenchmarkError);
  });
});

describe('median', () => {
  it('takes the middle of an odd set', () => {
    expect(median(readings)).toBe(6.4);
  });

  it('averages the middle two of an even set', () => {
    expect(median([{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }])).toBe(2.5);
  });

  it('refuses an empty set', () => {
    expect(() => median([])).toThrow(BenchmarkError);
  });
});

describe('against', () => {
  const mill = {
    name: 'ours',
    lrf: 6.4,
    degradeShare: 0.03,
    overrunShare: 0.28,
    basis: { lrf: 'cubic', overrunShare: 'doyle' },
  };
  const peers = [
    {
      name: 'a',
      lrf: 6.9,
      degradeShare: 0.05,
      overrunShare: 0.3,
      basis: { lrf: 'cubic', overrunShare: 'doyle' },
    },
    {
      name: 'b',
      lrf: 5.8,
      degradeShare: 0.02,
      overrunShare: 0.04,
      basis: { lrf: 'cubic', overrunShare: 'international' },
    },
  ];

  it('ranks every comparable measure', () => {
    const result = against(mill, peers);
    expect(result.rows.map((row) => row.measure).sort()).toEqual(['degradeShare', 'lrf']);
  });

  it('names the measure it had to skip and why', () => {
    const result = against(mill, peers);
    expect(result.skipped.map((row) => row.measure)).toContain('overrunShare');
    expect(result.skipped[0].reasons.join(' ')).toContain('not the same rule');
  });

  it('says whether the mill is above the middle', () => {
    const result = against(mill, peers);
    expect(result.rows.find((row) => row.measure === 'lrf').aboveMedian).toBe(false);
  });

  it('counts firsts and lasts', () => {
    const result = against(mill, peers);
    expect(result.firsts + result.lasts).toBeLessThanOrEqual(result.rows.length);
  });

  it('skips a measure no peer reported', () => {
    const lonely = against({ ...mill, targetOversize: 0.1 }, peers);
    expect(lonely.skipped.map((row) => row.measure)).toContain('targetOversize');
  });

  it('can be asked for one measure only', () => {
    expect(against(mill, peers, { measures: ['lrf'] }).rows).toHaveLength(1);
  });
});

describe('movement', () => {
  const before = { lrf: 6.1, degradeShare: 0.06 };
  const after = { lrf: 6.4, degradeShare: 0.03 };

  it('calls a rise an improvement where high is better', () => {
    const rows = movement(before, after);
    expect(rows.find((row) => row.measure === 'lrf').improved).toBe(true);
  });

  it('calls a fall an improvement where low is better', () => {
    const rows = movement(before, after);
    expect(rows.find((row) => row.measure === 'degradeShare').improved).toBe(true);
  });

  it('leaves out a measure only one period has', () => {
    expect(movement({ lrf: 6 }, after)).toHaveLength(1);
  });

  it('reports the change as a share of where it started', () => {
    expect(movement(before, after)[0].share).toBeCloseTo(0.3 / 6.1, 2);
  });

  it('knows every measure it benchmarks on', () => {
    expect(Object.keys(MEASURES)).toContain('targetOversize');
  });
});
