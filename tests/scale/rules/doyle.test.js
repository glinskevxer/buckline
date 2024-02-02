import { describe, expect, it } from 'vitest';
import {
  column,
  deductionMethod,
  gross,
  id,
  scale,
  slabShare,
  smallestDiameterIn,
} from '../../../src/scale/rules/doyle.js';

describe('doyle gross', () => {
  it('matches the published stick on a sixteen inch by sixteen foot log', () => {
    expect(scale(16, 16)).toBe(144);
  });

  it('matches the published stick on a twelve inch by twelve foot log', () => {
    expect(scale(12, 12)).toBe(48);
  });

  it('matches the published stick on a twenty four inch by twelve foot log', () => {
    expect(scale(24, 12)).toBe(300);
  });

  it('finds nothing in a log at the slab allowance', () => {
    expect(gross(4, 16)).toBe(0);
    expect(gross(3, 16)).toBe(0);
  });

  it('gives an eight inch log a quarter of what a twelve inch log gives', () => {
    expect(gross(8, 12)).toBeCloseTo(gross(12, 12) / 4, 9);
  });

  it('scales linearly in length', () => {
    expect(gross(16, 16)).toBeCloseTo(gross(16, 8) * 2, 9);
  });
});

describe('doyle penalty', () => {
  it('throws away more than half the cross section of a twelve inch log', () => {
    expect(slabShare(12)).toBeGreaterThan(0.55);
  });

  it('throws away under a third of a thirty inch log', () => {
    expect(slabShare(30)).toBeLessThan(0.32);
  });

  it('falls monotonically as the log gets bigger', () => {
    let previous = 1;
    for (let d = 6; d <= 40; d += 1) {
      const share = slabShare(d);
      expect(share).toBeLessThan(previous);
      previous = share;
    }
  });

  it('throws everything away at or below the allowance', () => {
    expect(slabShare(4)).toBe(1);
    expect(slabShare(0)).toBe(1);
  });
});

describe('doyle metadata', () => {
  it('names itself and its deduction style', () => {
    expect(id).toBe('doyle');
    expect(deductionMethod).toBe('squared');
  });

  it('does not scale in segments', () => {
    expect(smallestDiameterIn).toBe(6);
  });
});

describe('column', () => {
  it('runs from the smallest diameter the rule bothers with', () => {
    const values = column(16);
    expect(values[0].diameterIn).toBe(6);
    expect(values.at(-1).diameterIn).toBe(40);
  });

  it('increases with diameter all the way up', () => {
    const values = column(12);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i].boardFeet).toBeGreaterThan(values[i - 1].boardFeet);
    }
  });

  it('honours an explicit range', () => {
    const values = column(10, { from: 10, to: 12 });
    expect(values.map((v) => v.diameterIn)).toEqual([10, 11, 12]);
  });
});

describe('guards', () => {
  it('rejects nonsense arguments', () => {
    expect(() => gross('16', 16)).toThrow(TypeError);
    expect(() => gross(16, -1)).toThrow(RangeError);
    expect(() => gross(NaN, 16)).toThrow(TypeError);
  });
});
