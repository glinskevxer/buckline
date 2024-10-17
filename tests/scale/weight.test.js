import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../src/errors.js';
import {
  MINIMUM_PAIRS,
  POUNDS_PER_TON,
  estimatedFactor,
  factorDrift,
  factorIsCurrent,
  measureFactor,
  nominalFactor,
  weightToBoardFeet,
} from '../../src/scale/weight.js';

function pairs(count, poundsPerMbf, wobble = 0) {
  return Array.from({ length: count }, (_, i) => {
    const boardFeet = 4000 + i * 100;
    const per = poundsPerMbf + (i % 2 === 0 ? wobble : -wobble);
    return { netBoardFeet: boardFeet, netWeightLb: (boardFeet / 1000) * per };
  });
}

describe('nominalFactor', () => {
  it('is heavier for a denser species', () => {
    expect(nominalFactor('hickory')).toBeGreaterThan(nominalFactor('basswood'));
  });

  it('is heavier in spring than in summer', () => {
    expect(nominalFactor('red oak', { season: 'spring' })).toBeGreaterThan(
      nominalFactor('red oak', { season: 'summer' })
    );
  });

  it('lands in a plausible range for a hardwood', () => {
    expect(nominalFactor('red oak')).toBeGreaterThan(6000);
    expect(nominalFactor('red oak')).toBeLessThan(12000);
  });
});

describe('measureFactor', () => {
  it('averages the paired loads', () => {
    const factor = measureFactor(pairs(10, 8200), { species: 'red oak', measuredOn: '2024-10-01' });
    expect(factor.poundsPerMbf).toBeCloseTo(8200, 0);
    expect(factor.pairs).toBe(10);
  });

  it('reports the spread rather than hiding it', () => {
    const factor = measureFactor(pairs(10, 8200, 300), { species: 'red oak' });
    expect(factor.spreadLb).toBeCloseTo(600, 0);
    expect(factor.deviationLb).toBeGreaterThan(0);
  });

  it('will not call a factor usable off too few loads', () => {
    expect(measureFactor(pairs(4, 8200), { species: 'red oak' }).usable).toBe(false);
    expect(measureFactor(pairs(MINIMUM_PAIRS, 8200), { species: 'red oak' }).usable).toBe(true);
  });

  it('will not call a wide factor usable however many loads there are', () => {
    expect(measureFactor(pairs(40, 8200, 1200), { species: 'red oak' }).usable).toBe(false);
  });

  it('refuses a pair missing one of its two measurements', () => {
    expect(() => measureFactor([{ netWeightLb: 40000 }], { species: 'red oak' })).toThrow(
      ScaleError
    );
    expect(() => measureFactor([], { species: 'red oak' })).toThrow(ScaleError);
  });
});

describe('estimatedFactor', () => {
  it('is never usable for a settlement', () => {
    expect(estimatedFactor('red oak').usable).toBe(false);
    expect(estimatedFactor('red oak').estimate).toBe(true);
  });

  it('carries the nominal figure', () => {
    expect(estimatedFactor('red oak').poundsPerMbf).toBe(nominalFactor('red oak'));
  });
});

describe('factorIsCurrent', () => {
  const factor = measureFactor(pairs(10, 8200), {
    species: 'red oak',
    measuredOn: '2024-10-01',
  });

  it('is current inside the window', () => {
    expect(factorIsCurrent(factor, '2024-11-01')).toBe(true);
  });

  it('is stale past it', () => {
    expect(factorIsCurrent(factor, '2025-02-01')).toBe(false);
  });

  it('is not current before it was measured', () => {
    expect(factorIsCurrent(factor, '2024-09-01')).toBe(false);
  });

  it('is not current when it has no date on it', () => {
    expect(factorIsCurrent(measureFactor(pairs(10, 8200), {}), '2024-11-01')).toBe(false);
  });

  it('takes a different window', () => {
    expect(factorIsCurrent(factor, '2024-12-01', { days: 120 })).toBe(true);
  });
});

describe('weightToBoardFeet', () => {
  const factor = measureFactor(pairs(10, 8200), {
    species: 'red oak',
    measuredOn: '2024-10-01',
  });

  it('converts a weight to a scale', () => {
    const result = weightToBoardFeet(41000, factor, '2024-10-15');
    expect(result.netBoardFeet).toBeCloseTo(5000, 0);
    expect(result.tons).toBeCloseTo(41000 / POUNDS_PER_TON, 2);
  });

  it('refuses an estimate', () => {
    expect(() => weightToBoardFeet(41000, estimatedFactor('red oak'), '2024-10-15')).toThrow(
      /estimate/
    );
  });

  it('refuses a factor built from too few loads', () => {
    const thin = measureFactor(pairs(3, 8200), { species: 'red oak', measuredOn: '2024-10-01' });
    expect(() => weightToBoardFeet(41000, thin, '2024-10-15')).toThrow(ScaleError);
  });

  it('refuses a stale factor', () => {
    expect(() => weightToBoardFeet(41000, factor, '2025-06-01')).toThrow(/out of date/);
  });

  it('converts without a date when none is given', () => {
    expect(weightToBoardFeet(41000, factor).netBoardFeet).toBeGreaterThan(0);
  });

  it('refuses a load with no weight', () => {
    expect(() => weightToBoardFeet(undefined, factor)).toThrow(ScaleError);
  });
});

describe('factorDrift', () => {
  const factor = measureFactor(pairs(10, 8200), {
    species: 'red oak',
    measuredOn: '2024-10-01',
  });

  it('says the factor is holding when the loads agree with it', () => {
    const drift = factorDrift(pairs(5, 8200), factor);
    expect(drift.direction).toBe('holding');
    expect(drift.redo).toBe(false);
  });

  it('says the wood is heavier when it is', () => {
    expect(factorDrift(pairs(5, 9000), factor).direction).toBe('heavier than the factor');
  });

  it('says the wood is lighter when it is', () => {
    expect(factorDrift(pairs(5, 7400), factor).direction).toBe('lighter than the factor');
  });

  it('calls for a redo once the drift is over five percent', () => {
    expect(factorDrift(pairs(5, 9000), factor).redo).toBe(true);
    expect(factorDrift(pairs(5, 8300), factor).redo).toBe(false);
  });

  it('reports a row per load', () => {
    expect(factorDrift(pairs(5, 8200), factor).rows).toHaveLength(5);
  });
});
