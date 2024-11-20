import { describe, expect, it } from 'vitest';
import {
  ControlError,
  capability,
  makeLimits,
  runRules,
  zScore,
} from '../../src/analysis/control.js';

const baseline = [1.05, 1.06, 1.04, 1.05, 1.07, 1.03, 1.05, 1.06, 1.04, 1.05, 1.06, 1.05];
const limits = makeLimits(baseline, { label: 'four quarter thickness' });

describe('makeLimits', () => {
  it('centres on the baseline mean', () => {
    expect(limits.mean).toBeCloseTo(1.050833, 5);
  });

  it('sets the limits three deviations out', () => {
    expect(limits.upper - limits.mean).toBeCloseTo(3 * limits.deviation, 5);
    expect(limits.mean - limits.lower).toBeCloseTo(3 * limits.deviation, 5);
  });

  it('takes a different sigma', () => {
    const tight = makeLimits(baseline, { sigma: 2 });
    expect(tight.upper).toBeLessThan(limits.upper);
  });

  it('refuses too short a baseline', () => {
    expect(() => makeLimits([1, 2, 3])).toThrow(ControlError);
  });

  it('refuses a baseline with no variation in it', () => {
    expect(() => makeLimits(new Array(12).fill(1))).toThrow(ControlError);
  });
});

describe('zScore', () => {
  it('is zero at the mean', () => {
    expect(zScore(limits, limits.mean)).toBe(0);
  });

  it('is three at the upper limit', () => {
    expect(zScore(limits, limits.upper)).toBeCloseTo(3, 3);
  });
});

describe('runRules', () => {
  it('finds nothing wrong with a steady run', () => {
    const result = runRules(limits, [1.05, 1.04, 1.06, 1.05, 1.06, 1.04, 1.05]);
    expect(result.inControl).toBe(true);
    expect(result.signals).toEqual([]);
  });

  it('catches a single point past the limit', () => {
    const result = runRules(limits, [1.05, 1.04, 1.3]);
    expect(result.signals.map((signal) => signal.rule)).toContain('outside');
  });

  it('catches nine in a row on one side', () => {
    const result = runRules(limits, new Array(9).fill(1.06));
    expect(result.signals.map((signal) => signal.rule)).toContain('shift');
  });

  it('does not call eight in a row a shift', () => {
    const result = runRules(limits, new Array(8).fill(1.06));
    expect(result.signals.map((signal) => signal.rule)).not.toContain('shift');
  });

  it('catches six climbing in a row', () => {
    const result = runRules(limits, [1.04, 1.045, 1.05, 1.055, 1.06, 1.065]);
    expect(result.signals.map((signal) => signal.rule)).toContain('trend');
  });

  it('reads a falling trend differently from a climbing one', () => {
    const climbing = runRules(limits, [1.04, 1.045, 1.05, 1.055, 1.06, 1.065]);
    const falling = runRules(limits, [1.065, 1.06, 1.055, 1.05, 1.045, 1.04]);
    const says = (result) => result.signals.find((signal) => signal.rule === 'trend').says;
    expect(says(climbing)).not.toBe(says(falling));
  });

  it('catches two of three out past two sigma', () => {
    const high = limits.mean + 2.5 * limits.deviation;
    const result = runRules(limits, [limits.mean, high, high]);
    expect(result.signals.map((signal) => signal.rule)).toContain('drift');
  });

  it('does not fire drift on one point out past two sigma', () => {
    const high = limits.mean + 2.5 * limits.deviation;
    const result = runRules(limits, [limits.mean, limits.mean, high]);
    expect(result.signals.map((signal) => signal.rule)).not.toContain('drift');
  });

  it('does not fire drift when the two are on opposite sides', () => {
    const high = limits.mean + 2.5 * limits.deviation;
    const low = limits.mean - 2.5 * limits.deviation;
    const result = runRules(limits, [limits.mean, high, low]);
    expect(result.signals.map((signal) => signal.rule)).not.toContain('drift');
  });

  it('reports the signals in the order they happened', () => {
    const result = runRules(limits, [1.04, 1.045, 1.05, 1.055, 1.06, 1.065, 1.4]);
    const at = result.signals.map((signal) => signal.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('says something different for each rule', () => {
    const result = runRules(limits, [1.04, 1.045, 1.05, 1.055, 1.06, 1.065, 1.4]);
    const says = new Set(result.signals.map((signal) => signal.says));
    expect(says.size).toBeGreaterThan(1);
  });

  it('refuses an empty series', () => {
    expect(() => runRules(limits, [])).toThrow(ControlError);
  });
});

describe('capability', () => {
  it('calls a tight saw capable against a wide specification', () => {
    const result = capability(limits, { lower: 1.0, upper: 1.1 });
    expect(result.capable).toBe(true);
    expect(result.says).toContain('holds');
  });

  it('calls the same saw incapable against a tight specification', () => {
    const result = capability(limits, { lower: 1.049, upper: 1.052 });
    expect(result.capable).toBe(false);
  });

  it('separates capability from centring', () => {
    const offCentre = capability(limits, { lower: 1.04, upper: 1.2 });
    expect(offCentre.cp).toBeGreaterThan(offCentre.cpk);
    expect(offCentre.centred).toBe(false);
  });

  it('calls a centred process centred', () => {
    const result = capability(limits, { lower: limits.mean - 0.05, upper: limits.mean + 0.05 });
    expect(result.centred).toBe(true);
  });

  it('refuses a specification with no width', () => {
    expect(() => capability(limits, { lower: 1.1, upper: 1.0 })).toThrow(ControlError);
  });
});
