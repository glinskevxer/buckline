import { describe, expect, it } from 'vitest';
import { makeBoard } from '../../src/model/board.js';
import { KilnError } from '../../src/kiln/schedule.js';
import {
  FIBRE_SATURATION_PCT,
  chargeSpread,
  dryDimensions,
  gradeIsProvisional,
  ovenDryMoisture,
  shrinkageProgress,
  thicknessAt,
  widthAt,
} from '../../src/kiln/moisture.js';

describe('shrinkageProgress', () => {
  it('is nothing above fibre saturation', () => {
    expect(shrinkageProgress(60)).toBe(0);
    expect(shrinkageProgress(FIBRE_SATURATION_PCT)).toBe(0);
  });

  it('is half way at fifteen percent', () => {
    expect(shrinkageProgress(15)).toBeCloseTo(0.5, 6);
  });

  it('is complete at oven dry', () => {
    expect(shrinkageProgress(0)).toBe(1);
  });

  it('refuses a negative moisture content', () => {
    expect(() => shrinkageProgress(-1)).toThrow(KilnError);
  });
});

describe('widthAt', () => {
  it('does not move a board that stays above fibre saturation', () => {
    expect(widthAt('red oak', 7, 80, 40)).toBe(7);
  });

  it('shrinks a board dried to the shed', () => {
    expect(widthAt('red oak', 7, 60, 8)).toBeLessThan(7);
    expect(widthAt('red oak', 7, 60, 8)).toBeGreaterThan(6.5);
  });

  it('moves a heavy shrinking species further than a light one', () => {
    const beech = 7 - widthAt('beech', 7, 60, 8);
    const cherry = 7 - widthAt('black cherry', 7, 60, 8);
    expect(beech).toBeGreaterThan(cherry);
  });

  it('grows a board back when it takes water up again', () => {
    expect(widthAt('red oak', 7, 8, 20)).toBeGreaterThan(7);
  });
});

describe('thicknessAt', () => {
  it('moves less than the width, because thickness runs radially', () => {
    const widthLoss = 7 - widthAt('red oak', 7, 60, 8);
    const thicknessLoss = 7 - thicknessAt('red oak', 7, 60, 8);
    expect(thicknessLoss).toBeLessThan(widthLoss);
  });

  it('moves the tangential figure on quartersawn stock', () => {
    const flat = thicknessAt('red oak', 2, 60, 8);
    const quarter = thicknessAt('red oak', 2, 60, 8, { quartersawn: true });
    expect(quarter).toBeLessThan(flat);
  });
});

describe('dryDimensions', () => {
  const board = (widthIn, lengthFt, species = 'red oak') =>
    makeBoard({ id: 'B', species, thicknessIn: 1, widthIn, lengthFt, moisturePct: 60 });

  it('reports how much width is lost', () => {
    const dry = dryDimensions(board(7, 12));
    expect(dry.widthLostIn).toBeGreaterThan(0.3);
    expect(dry.widthLostIn).toBeLessThan(0.6);
  });

  it('takes a green board that was not measured as sixty percent', () => {
    const noReading = makeBoard({
      id: 'B',
      species: 'red oak',
      thicknessIn: 1,
      widthIn: 7,
      lengthFt: 12,
    });
    expect(dryDimensions(noReading).fromMoisturePct).toBe(60);
  });

  it('says when surface measure holds', () => {
    const dry = dryDimensions(board(7, 12));
    expect(dry.surfaceMeasure).toBe(dry.surfaceMeasureFrom);
    expect(dry.surfaceMeasureMoved).toBe(false);
  });

  it('says when surface measure moves', () => {
    const dry = dryDimensions(board(8, 12));
    expect(dry.surfaceMeasureMoved).toBe(true);
    expect(dry.surfaceMeasure).toBe(7);
    expect(dry.surfaceMeasureFrom).toBe(8);
  });

  it('moves a whole unit off less than half an inch of shrinkage', () => {
    expect(dryDimensions(board(8, 12)).widthLostIn).toBeLessThan(0.6);
  });

  it('can be asked for a different target moisture', () => {
    const shed = dryDimensions(board(7, 12));
    const kiln = dryDimensions(board(7, 12), { toMoisturePct: 6 });
    expect(kiln.widthIn).toBeLessThan(shed.widthIn);
  });
});

describe('gradeIsProvisional', () => {
  const board = (widthIn, lengthFt, moisturePct = 60) =>
    makeBoard({ id: 'B', species: 'red oak', thicknessIn: 1, widthIn, lengthFt, moisturePct });

  it('holds a green grade provisional when surface measure will move', () => {
    const result = gradeIsProvisional(board(8, 12));
    expect(result.provisional).toBe(true);
    expect(result.from).toBe(8);
    expect(result.to).toBe(7);
  });

  it('lets a green grade stand when surface measure will not move', () => {
    expect(gradeIsProvisional(board(7, 12)).provisional).toBe(false);
  });

  it('lets a dry board grade stand outright', () => {
    const result = gradeIsProvisional(board(7, 12, 8));
    expect(result.provisional).toBe(false);
    expect(result.reason).toContain('selling moisture');
  });

  it('names why the grade has to be read again', () => {
    expect(gradeIsProvisional(board(8, 12)).reason).toContain('surface measure moves');
  });
});

describe('ovenDryMoisture', () => {
  it('reads moisture as a percentage of the dry weight', () => {
    expect(ovenDryMoisture(160, 100)).toBe(60);
    expect(ovenDryMoisture(108, 100)).toBe(8);
  });

  it('reads a dry sample as nothing', () => {
    expect(ovenDryMoisture(100, 100)).toBe(0);
  });

  it('refuses an impossible pair of weights', () => {
    expect(() => ovenDryMoisture(90, 100)).toThrow(KilnError);
    expect(() => ovenDryMoisture(100, 0)).toThrow(KilnError);
  });
});

describe('chargeSpread', () => {
  it('reports the wettest and driest sample', () => {
    const result = chargeSpread([12, 8, 10, 9]);
    expect(result.wettest).toBe(12);
    expect(result.driest).toBe(8);
    expect(result.mean).toBe(9.8);
  });

  it('calls a tight charge even', () => {
    expect(chargeSpread([8, 9, 10]).even).toBe(true);
  });

  it('calls a wide charge uneven', () => {
    expect(chargeSpread([6, 14]).even).toBe(false);
  });

  it('handles a single sample', () => {
    expect(chargeSpread([9]).spread).toBe(0);
  });

  it('refuses a charge with no samples', () => {
    expect(() => chargeSpread([])).toThrow(KilnError);
  });
});
