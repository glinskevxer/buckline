import { describe, expect, it } from 'vitest';
import {
  MEASUREMENT_CONVENTIONS,
  ROUNDING_RULES,
  barkFraction,
  insideBark,
  scalingDiameter,
} from '../../src/measure/diameter.js';

describe('barkFraction', () => {
  it('knows the thick barked oaks carry more than the thin barked beech', () => {
    expect(barkFraction('white oak')).toBeGreaterThan(barkFraction('beech'));
  });

  it('falls back to a default for a species it has never seen', () => {
    expect(barkFraction('osage orange')).toBe(barkFraction(undefined));
  });

  it('does not care about case or stray whitespace', () => {
    expect(barkFraction('  Red Oak ')).toBe(barkFraction('red oak'));
  });

  it('does not pick up an inherited property name', () => {
    expect(barkFraction('constructor')).toBe(barkFraction(undefined));
    expect(barkFraction('toString')).toBe(barkFraction(undefined));
  });
});

describe('insideBark', () => {
  it('takes off both sides of the bark at once', () => {
    expect(insideBark(20, 'red oak')).toBeCloseTo(18.4, 6);
  });

  it('takes off less on a thin barked species', () => {
    expect(insideBark(20, 'beech')).toBeGreaterThan(insideBark(20, 'white oak'));
  });
});

describe('scalingDiameter', () => {
  it('averages two axes and drops the fraction by default', () => {
    const result = scalingDiameter([16, 18], { species: 'hard maple' });
    expect(result.combinedOutsideBark).toBe(17);
    expect(result.insideBark).toBeCloseTo(16.15, 6);
    expect(result.scalingDiameter).toBe(16);
  });

  it('reports every intermediate so the scale can be audited', () => {
    const result = scalingDiameter([16, 18], { species: 'hard maple' });
    expect(result).toMatchObject({
      convention: 'average',
      rounding: 'down',
      axes: [16, 18],
    });
  });

  it('gives the buyer a smaller log when the shortest axis convention is used', () => {
    const average = scalingDiameter([14, 20], { convention: 'average' });
    const shortest = scalingDiameter([14, 20], { convention: 'shortest' });
    expect(shortest.scalingDiameter).toBeLessThan(average.scalingDiameter);
  });

  it('treats extremes and average the same on exactly two measurements', () => {
    const a = scalingDiameter([14, 20], { convention: 'extremes' });
    const b = scalingDiameter([14, 20], { convention: 'average' });
    expect(a.scalingDiameter).toBe(b.scalingDiameter);
  });

  it('separates extremes from average once there are more than two', () => {
    const a = scalingDiameter([14, 20, 15], { convention: 'extremes' });
    expect(a.combinedOutsideBark).toBe(17);
  });

  it('accepts a single measurement for the single axis convention', () => {
    expect(scalingDiameter(17, { convention: 'single' }).combinedOutsideBark).toBe(17);
  });

  it('refuses a two axis convention given one measurement', () => {
    expect(() => scalingDiameter([17], { convention: 'average' })).toThrow(RangeError);
  });

  it('can skip the bark deduction when the caller already measured inside', () => {
    const result = scalingDiameter([16.9], {
      convention: 'single',
      alreadyInsideBark: true,
    });
    expect(result.scalingDiameter).toBe(16);
  });

  it('moves the class up when the contract says nearest inch', () => {
    const down = scalingDiameter([18], { convention: 'single', rounding: 'down' });
    const nearest = scalingDiameter([18], { convention: 'single', rounding: 'nearest' });
    expect(down.scalingDiameter).toBe(16);
    expect(nearest.scalingDiameter).toBe(17);
  });

  it('supports half inch classes', () => {
    const result = scalingDiameter([18], {
      convention: 'single',
      rounding: 'half',
      alreadyInsideBark: true,
    });
    expect(result.scalingDiameter).toBe(18);
  });

  it('rejects an unknown convention or rounding rule by name', () => {
    expect(() => scalingDiameter([16, 18], { convention: 'eyeball' })).toThrow(RangeError);
    expect(() => scalingDiameter([16, 18], { rounding: 'whatever' })).toThrow(RangeError);
  });

  it('rejects a measurement that is not a positive number', () => {
    expect(() => scalingDiameter([0, 18])).toThrow(RangeError);
    expect(() => scalingDiameter(['16', 18])).toThrow(TypeError);
  });

  it('refuses a stick that rounds away to nothing', () => {
    expect(() => scalingDiameter([0.5], { convention: 'single' })).toThrow(RangeError);
  });
});

describe('registries', () => {
  it('keeps each entry keyed by its own id', () => {
    for (const [key, value] of Object.entries(MEASUREMENT_CONVENTIONS)) {
      expect(value.id).toBe(key);
    }
    for (const [key, value] of Object.entries(ROUNDING_RULES)) {
      expect(value.id).toBe(key);
    }
  });
});

describe('the rounding rules nobody uses often', () => {
  it('raises to the next inch when the contract says up', () => {
    const result = scalingDiameter([16.1], {
      convention: 'single',
      rounding: 'up',
      alreadyInsideBark: true,
    });
    expect(result.scalingDiameter).toBe(17);
  });

  it('leaves a whole inch alone when rounding up', () => {
    const result = scalingDiameter([16], {
      convention: 'single',
      rounding: 'up',
      alreadyInsideBark: true,
    });
    expect(result.scalingDiameter).toBe(16);
  });

  it('gives the seller the most of the four rules', () => {
    const axes = [16.4];
    const options = { convention: 'single', alreadyInsideBark: true };
    const down = scalingDiameter(axes, { ...options, rounding: 'down' }).scalingDiameter;
    const nearest = scalingDiameter(axes, { ...options, rounding: 'nearest' }).scalingDiameter;
    const half = scalingDiameter(axes, { ...options, rounding: 'half' }).scalingDiameter;
    const up = scalingDiameter(axes, { ...options, rounding: 'up' }).scalingDiameter;
    expect(up).toBeGreaterThanOrEqual(half);
    expect(half).toBeGreaterThanOrEqual(nearest);
    expect(nearest).toBeGreaterThanOrEqual(down);
  });
});
