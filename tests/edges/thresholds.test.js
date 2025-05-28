/**
 * The exact points where an answer changes.
 *
 * Every threshold in this program is a place where two people can read the
 * same rule and land either side of it, and a test that checks a value well
 * inside a band proves nothing about the band's edge. These check the value
 * at the edge and the value one step either side of it.
 */

import { describe, expect, it } from 'vitest';
import { scalingLength } from '../../src/measure/length.js';
import { scalingDiameter } from '../../src/measure/diameter.js';
import { makeLog } from '../../src/model/log.js';
import { netScale, DEFAULT_CULL_SHARE } from '../../src/scale/net.js';
import { getRule } from '../../src/scale/rules/index.js';
import { sweepShare } from '../../src/scale/defect/sweep.js';
import { surfaceMeasure } from '../../src/model/board.js';
import { allowancesFor, cuttingCounts } from '../../src/grade/lumber/spec.js';
import { requirementsFor } from '../../src/grade/log/usfs.js';
import { stepAt } from '../../src/kiln/schedule.js';
import { shrinkageProgress, FIBRE_SATURATION_PCT } from '../../src/kiln/moisture.js';

function log(axis, lengthFt, defects = []) {
  return makeLog({
    id: 'L-1',
    species: 'red oak',
    position: 'butt',
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
    defects,
  });
}

describe('the trim allowance', () => {
  const inch = 1 / 12;

  it('takes a stick exactly on nominal', () => {
    expect(scalingLength(12).nominalFt).toBe(12);
  });

  it('drops a stick one inch short to the class below', () => {
    expect(scalingLength(12 - inch).nominalFt).toBe(11);
  });

  it('charges nothing at exactly the allowance', () => {
    expect(scalingLength(12 + 4 * inch).overlengthIn).toBe(0);
  });

  it('charges from one inch past it', () => {
    expect(scalingLength(12 + 5 * inch).overlengthIn).toBeCloseTo(1, 6);
  });
});

describe('the diameter rounding', () => {
  it('keeps a diameter exactly on the inch', () => {
    expect(
      scalingDiameter([16], { convention: 'single', alreadyInsideBark: true }).scalingDiameter
    ).toBe(16);
  });

  it('drops anything under it', () => {
    expect(
      scalingDiameter([15.999], { convention: 'single', alreadyInsideBark: true }).scalingDiameter
    ).toBe(15);
  });

  it('refuses a stick that rounds to nothing and takes one that rounds to one', () => {
    expect(() =>
      scalingDiameter([0.999], { convention: 'single', alreadyInsideBark: true })
    ).toThrow();
    expect(
      scalingDiameter([1], { convention: 'single', alreadyInsideBark: true }).scalingDiameter
    ).toBe(1);
  });
});

describe('the rule floors', () => {
  it('scribner finds nothing at five inches and something at six', () => {
    expect(getRule('scribner').scale(5, 16)).toBe(0);
    expect(getRule('scribner').scale(6, 16)).toBeGreaterThan(0);
  });

  it('doyle finds nothing at four inches and something at five', () => {
    expect(getRule('doyle').gross(4, 16)).toBe(0);
    expect(getRule('doyle').gross(5, 16)).toBeGreaterThan(0);
  });

  it('scribner holds a monster log at the top of the table', () => {
    expect(getRule('scribner').scale(40, 16)).toBe(getRule('scribner').scale(41, 16));
  });
});

describe('the sweep allowance', () => {
  it('charges nothing at exactly a quarter of the diameter', () => {
    expect(sweepShare(16, 16, 4).share).toBe(0);
  });

  it('charges from a hair past it', () => {
    expect(sweepShare(16, 16, 4.01).share).toBeGreaterThan(0);
  });

  it('charges the whole log and no more at the far end', () => {
    expect(sweepShare(16, 16, 400).share).toBe(1);
  });
});

describe('the cull line', () => {
  it('keeps a log exactly on the cull share', () => {
    const clean = log(21.8, 16);
    const gross = netScale(clean, 'doyle').grossBoardFeet;
    const half = gross * DEFAULT_CULL_SHARE;
    expect(netScale(clean, 'doyle', { cullShare: half / gross }).cull).toBe(false);
  });

  it('culls a log a hair under it', () => {
    const clean = log(21.8, 16);
    expect(netScale(clean, 'doyle', { cullShare: 1.0001 }).cull).toBe(true);
  });

  it('culls on the board foot floor at exactly one under', () => {
    const small = log(7.4, 8);
    const gross = netScale(small, 'doyle').grossBoardFeet;
    expect(netScale(small, 'doyle', { minimumNetBoardFeet: gross }).cull).toBe(false);
    expect(netScale(small, 'doyle', { minimumNetBoardFeet: gross + 1 }).cull).toBe(true);
  });
});

describe('surface measure rounding', () => {
  it('rounds exactly a half up', () => {
    expect(surfaceMeasure(6, 9)).toBe(5);
  });

  it('drops a hair under a half', () => {
    expect(surfaceMeasure(5.99, 9)).toBe(4);
  });
});

describe('the grade table bands', () => {
  it('changes the cutting allowance at the band edge', () => {
    expect(allowancesFor('FAS', 9)[0].maxCuttings).toBe(1);
    expect(allowancesFor('FAS', 10)[0].maxCuttings).toBe(2);
  });

  it('has nothing below the smallest surface measure it takes', () => {
    expect(allowancesFor('FAS', 3)).toEqual([]);
    expect(allowancesFor('FAS', 4)).not.toEqual([]);
  });

  it('counts a cutting exactly at a minimum size and not a hair under', () => {
    expect(cuttingCounts('FAS', 4, 5)).toBe(true);
    expect(cuttingCounts('FAS', 3.99, 5)).toBe(false);
    expect(cuttingCounts('FAS', 4, 4.99)).toBe(false);
  });

  it('changes the grade one cutting standard at the diameter band edge', () => {
    expect(requirementsFor(log(16.4, 12), 'F1').minCuttingFt).toBe(7);
    expect(requirementsFor(log(17.4, 12), 'F1').minCuttingFt).toBe(5);
  });
});

describe('the kiln step edges', () => {
  it('puts a reading exactly on a boundary on the step above it', () => {
    expect(stepAt('T4-C2', 50).index).toBe(0);
    expect(stepAt('T4-C2', 49.99).index).toBe(1);
  });

  it('runs out at the bottom of the last step', () => {
    expect(stepAt('T4-C2', 7)).not.toBeNull();
    expect(stepAt('T4-C2', 6.99)).toBeNull();
  });
});

describe('fibre saturation', () => {
  it('moves nothing at exactly the saturation point', () => {
    expect(shrinkageProgress(FIBRE_SATURATION_PCT)).toBe(0);
  });

  it('starts moving a hair below it', () => {
    expect(shrinkageProgress(FIBRE_SATURATION_PCT - 0.01)).toBeGreaterThan(0);
  });
});
