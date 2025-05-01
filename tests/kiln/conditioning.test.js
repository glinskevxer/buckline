import { describe, expect, it } from 'vitest';
import { KilnError } from '../../src/kiln/schedule.js';
import {
  EQUALISE_SPREAD_PCT,
  conditionStep,
  equaliseStep,
  equalised,
  finishPlan,
  readProngs,
} from '../../src/kiln/conditioning.js';

const charge = { schedule: 'T4-C2', boardFeet: 30000 };

describe('equaliseStep', () => {
  it('holds a point under the target', () => {
    expect(equaliseStep(7).holdEmc).toBe(6);
  });

  it('finds a depression that reaches that equilibrium', () => {
    const step = equaliseStep(7);
    expect(step.reachedEmc).toBeLessThanOrEqual(step.holdEmc);
    expect(step.depressionF).toBeGreaterThan(0);
  });

  it('never holds below the floor', () => {
    expect(equaliseStep(1).holdEmc).toBe(1.5);
  });

  it('refuses a target of nothing', () => {
    expect(() => equaliseStep(0)).toThrow(KilnError);
  });
});

describe('equalised', () => {
  it('calls a tight charge done', () => {
    expect(equalised([6.5, 7, 7.5], 7).done).toBe(true);
  });

  it('calls a spread charge not done and says why', () => {
    const result = equalised([4, 7, 11], 7);
    expect(result.done).toBe(false);
    expect(result.reasons.join(' ')).toContain('driest to wettest');
  });

  it('calls a charge with a wet board not done even when it is even', () => {
    const result = equalised([11, 11.5, 12], 7);
    expect(result.done).toBe(false);
    expect(result.reasons.join(' ')).toContain('wettest board');
  });

  it('takes a tighter spread', () => {
    expect(equalised([6.5, 7, 7.5], 7, { spreadPct: 0.5 }).done).toBe(false);
  });

  it('works to two points by default', () => {
    expect(EQUALISE_SPREAD_PCT).toBe(2);
  });
});

describe('conditionStep', () => {
  it('aims above the target so the shell takes water back', () => {
    const step = conditionStep(7);
    expect(step.wantEmc).toBeGreaterThan(7);
    expect(step.reachedEmc).toBeGreaterThanOrEqual(step.wantEmc - 1);
  });

  it('uses a narrower depression than equalising', () => {
    expect(conditionStep(7).depressionF).toBeLessThan(equaliseStep(7).depressionF);
  });

  it('takes longer on thick stock, and more than in proportion', () => {
    const thin = conditionStep(7, { thicknessIn: 1 }).hours;
    const thick = conditionStep(7, { thicknessIn: 2 }).hours;
    expect(thick).toBeGreaterThan(thin * 2);
  });

  it('takes a different overshoot', () => {
    expect(conditionStep(7, { overshootPct: 8 }).wantEmc).toBe(15);
  });
});

describe('readProngs', () => {
  it('calls a straight prong free of stress', () => {
    expect(readProngs(0).state).toBe('free');
    expect(readProngs(0.02).state).toBe('free');
  });

  it('calls a closed prong casehardened', () => {
    const result = readProngs(-0.2);
    expect(result.state).toBe('casehardened');
    expect(result.says).toContain('more conditioning');
  });

  it('calls a splayed prong overconditioned', () => {
    expect(readProngs(0.2).state).toBe('reverse');
  });

  it('takes a tighter tolerance', () => {
    expect(readProngs(0.02, { toleranceIn: 0.005 }).state).toBe('reverse');
  });

  it('refuses a test with no measurement', () => {
    expect(() => readProngs('closed')).toThrow(KilnError);
  });
});

describe('finishPlan', () => {
  it('calls an even unstressed charge done', () => {
    const plan = finishPlan(charge, [6.5, 7, 7.5], 0);
    expect(plan.done).toBe(true);
    expect(plan.steps).toEqual([]);
  });

  it('equalises a spread charge', () => {
    const plan = finishPlan(charge, [4, 7, 11], 0);
    expect(plan.steps.map((step) => step.step)).toEqual(['equalise']);
  });

  it('conditions a casehardened charge', () => {
    const plan = finishPlan(charge, [6.5, 7, 7.5], -0.2);
    expect(plan.steps.map((step) => step.step)).toEqual(['condition']);
  });

  it('does both when both are wrong, equalising first', () => {
    const plan = finishPlan(charge, [4, 7, 11], -0.2);
    expect(plan.steps.map((step) => step.step)).toEqual(['equalise', 'condition']);
  });

  it('does not condition a charge that is already free of stress', () => {
    const plan = finishPlan(charge, [4, 7, 11], 0);
    expect(plan.steps.map((step) => step.step)).not.toContain('condition');
  });

  it('does not condition one that was already carried too far', () => {
    const plan = finishPlan(charge, [6.5, 7, 7.5], 0.3);
    expect(plan.done).toBe(true);
    expect(plan.prongs.state).toBe('reverse');
  });

  it('says how many more hours the kiln is tied up for', () => {
    expect(finishPlan(charge, [4, 7, 11], -0.2).extraHours).toBeGreaterThan(0);
  });

  it('carries the charge through', () => {
    expect(finishPlan(charge, [6.5, 7, 7.5], 0).boardFeet).toBe(30000);
  });
});
