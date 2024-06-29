import { describe, expect, it } from 'vitest';
import { MillError } from '../../src/mill/pattern.js';
import {
  MACHINE_VARIATION,
  PLANING_ALLOWANCE_IN,
  cleansUp,
  savingFromMachine,
  shrinkageAllowanceIn,
  targetThickness,
  totalVariationIn,
} from '../../src/mill/target-size.js';

const request = { species: 'red oak', finishedThicknessIn: 1 };

describe('totalVariationIn', () => {
  it('adds the two variations in quadrature, not straight', () => {
    const spec = MACHINE_VARIATION['wide band'];
    expect(totalVariationIn('wide band')).toBeCloseTo(
      Math.sqrt(spec.withinIn ** 2 + spec.betweenIn ** 2),
      4
    );
    expect(totalVariationIn('wide band')).toBeLessThan(spec.withinIn + spec.betweenIn);
  });

  it('rises through the machine list', () => {
    const machines = ['thin kerf band', 'wide band', 'circular', 'scragg'];
    for (let i = 1; i < machines.length; i += 1) {
      expect(totalVariationIn(machines[i])).toBeGreaterThan(totalVariationIn(machines[i - 1]));
    }
  });

  it('barely moves when only one of the two halves is fixed', () => {
    const spec = MACHINE_VARIATION.circular;
    const halved = Math.sqrt((spec.withinIn / 2) ** 2 + spec.betweenIn ** 2);
    expect(halved).toBeGreaterThan(totalVariationIn('circular') * 0.7);
  });

  it('refuses a machine nobody measured', () => {
    expect(() => totalVariationIn('chainsaw')).toThrow(MillError);
  });
});

describe('shrinkageAllowanceIn', () => {
  it('is nothing when the board stays green', () => {
    expect(shrinkageAllowanceIn('red oak', 1, 40)).toBe(0);
  });

  it('grows as the target moisture falls', () => {
    expect(shrinkageAllowanceIn('red oak', 1, 6)).toBeGreaterThan(
      shrinkageAllowanceIn('red oak', 1, 12)
    );
  });

  it('is bigger on a heavy shrinking species', () => {
    expect(shrinkageAllowanceIn('hickory', 1, 8)).toBeGreaterThan(
      shrinkageAllowanceIn('black cherry', 1, 8)
    );
  });

  it('is bigger on quartersawn stock, which moves tangentially in thickness', () => {
    expect(shrinkageAllowanceIn('red oak', 1, 8, { quartersawn: true })).toBeGreaterThan(
      shrinkageAllowanceIn('red oak', 1, 8)
    );
  });

  it('scales with the thickness', () => {
    expect(shrinkageAllowanceIn('red oak', 2, 8)).toBeCloseTo(
      shrinkageAllowanceIn('red oak', 1, 8) * 2,
      3
    );
  });
});

describe('targetThickness', () => {
  it('itemises every allowance', () => {
    const result = targetThickness(request);
    expect(Object.keys(result.allowances).sort()).toEqual([
      'planingIn',
      'sawingIn',
      'shrinkageIn',
    ]);
  });

  it('adds up to the target', () => {
    const result = targetThickness(request);
    const sum =
      result.finishedThicknessIn +
      result.allowances.planingIn +
      result.allowances.shrinkageIn +
      result.allowances.sawingIn;
    expect(result.targetThicknessIn).toBeCloseTo(sum, 3);
  });

  it('saws thicker on a worse machine', () => {
    expect(targetThickness({ ...request, machine: 'scragg' }).targetThicknessIn).toBeGreaterThan(
      targetThickness({ ...request, machine: 'thin kerf band' }).targetThicknessIn
    );
  });

  it('saws thinner for rough stock than for surfaced', () => {
    expect(targetThickness({ ...request, surfacing: 'rough' }).targetThicknessIn).toBeLessThan(
      targetThickness({ ...request, surfacing: 's2s' }).targetThicknessIn
    );
  });

  it('saws thicker when more of the thin tail is covered', () => {
    expect(targetThickness({ ...request, coverageSigma: 3 }).targetThicknessIn).toBeGreaterThan(
      targetThickness({ ...request, coverageSigma: 2 }).targetThicknessIn
    );
  });

  it('saws to the finished size when nothing is allowed for', () => {
    const result = targetThickness({
      ...request,
      surfacing: 'rough',
      toMoisturePct: 40,
      coverageSigma: 0,
    });
    expect(result.targetThicknessIn).toBe(1);
    expect(result.oversizeIn).toBe(0);
  });

  it('refuses a nonsense request', () => {
    expect(() => targetThickness({ species: 'red oak', finishedThicknessIn: 0 })).toThrow(MillError);
    expect(() => targetThickness({ ...request, surfacing: 'polished' })).toThrow(MillError);
    expect(() => targetThickness({ ...request, coverageSigma: -1 })).toThrow(MillError);
  });

  it('knows the three surfacing allowances', () => {
    expect(PLANING_ALLOWANCE_IN.s2s).toBe(PLANING_ALLOWANCE_IN.s1s * 2);
    expect(PLANING_ALLOWANCE_IN.rough).toBe(0);
  });
});

describe('savingFromMachine', () => {
  it('reports what a better saw is worth per thousand board feet', () => {
    const saving = savingFromMachine({ ...request, machine: 'circular' }, 'thin kerf band');
    expect(saving.savedIn).toBeGreaterThan(0);
    expect(saving.extraBoardFeetPerMbf).toBeGreaterThan(0);
    expect(saving.worthDoing).toBe(true);
  });

  it('reports nothing gained by going the wrong way', () => {
    const saving = savingFromMachine({ ...request, machine: 'thin kerf band' }, 'scragg');
    expect(saving.savedIn).toBeLessThan(0);
    expect(saving.worthDoing).toBe(false);
  });

  it('names both machines', () => {
    const saving = savingFromMachine({ ...request, machine: 'circular' }, 'wide band');
    expect(saving.from).toBe('circular');
    expect(saving.to).toBe('wide band');
  });
});

describe('cleansUp', () => {
  it('passes a board thick enough to plane', () => {
    expect(cleansUp(1.2, request).cleansUp).toBe(true);
  });

  it('fails a board that will not clean up', () => {
    expect(cleansUp(1.05, request).cleansUp).toBe(false);
  });

  it('reports how far off target the board came out', () => {
    const target = targetThickness(request).targetThicknessIn;
    expect(cleansUp(target, request).overTargetIn).toBe(0);
    expect(cleansUp(target + 0.05, request).overTargetIn).toBeCloseTo(0.05, 3);
  });

  it('needs less on rough stock', () => {
    expect(cleansUp(1.02, { ...request, surfacing: 'rough' }).cleansUp).toBe(true);
    expect(cleansUp(1.02, request).cleansUp).toBe(false);
  });
});
