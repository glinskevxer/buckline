import { describe, expect, it } from 'vitest';
import {
  BOARD_FEET_PER_MBF,
  CUBIC_INCHES_PER_BOARD_FOOT,
  boardFeet,
  cordsFromCubicFeet,
  cubicFeet,
  cylinderCubicFeet,
  formatQuarters,
  fromMbf,
  inchesFromQuarters,
  quarters,
  toMbf,
} from '../src/units.js';

describe('boardFeet', () => {
  it('measures a one inch by twelve inch by one foot piece as one board foot', () => {
    expect(boardFeet(1, 12, 1)).toBe(1);
  });

  it('measures an eight foot two by four as five and one third board feet', () => {
    expect(boardFeet(2, 4, 8)).toBeCloseTo(5.3333, 4);
  });

  it('scales linearly in every dimension', () => {
    const base = boardFeet(1, 6, 10);
    expect(boardFeet(2, 6, 10)).toBeCloseTo(base * 2, 9);
    expect(boardFeet(1, 12, 10)).toBeCloseTo(base * 2, 9);
    expect(boardFeet(1, 6, 20)).toBeCloseTo(base * 2, 9);
  });

  it('rejects a zero or negative dimension', () => {
    expect(() => boardFeet(0, 6, 10)).toThrow(RangeError);
    expect(() => boardFeet(1, -6, 10)).toThrow(RangeError);
    expect(() => boardFeet(1, 6, 0)).toThrow(RangeError);
  });

  it('rejects a non numeric dimension', () => {
    expect(() => boardFeet('1', 6, 10)).toThrow(TypeError);
    expect(() => boardFeet(1, null, 10)).toThrow(TypeError);
    expect(() => boardFeet(1, 6, NaN)).toThrow(TypeError);
  });
});

describe('cubicFeet', () => {
  it('agrees with the board foot definition', () => {
    expect(cubicFeet(1, 12, 1) * CUBIC_INCHES_PER_BOARD_FOOT).toBeCloseTo(
      boardFeet(1, 12, 1) * 12,
      9
    );
  });

  it('measures a twelve by twelve by one foot cube as one cubic foot', () => {
    expect(cubicFeet(12, 12, 1)).toBe(1);
  });
});

describe('cylinderCubicFeet', () => {
  it('measures a twelve inch by ten foot cylinder', () => {
    expect(cylinderCubicFeet(12, 10)).toBeCloseTo(7.854, 3);
  });

  it('quadruples when the diameter doubles', () => {
    expect(cylinderCubicFeet(20, 8)).toBeCloseTo(cylinderCubicFeet(10, 8) * 4, 9);
  });
});

describe('mbf conversions', () => {
  it('round trips', () => {
    expect(fromMbf(toMbf(2350))).toBeCloseTo(2350, 9);
  });

  it('uses a thousand board feet per mbf', () => {
    expect(toMbf(BOARD_FEET_PER_MBF)).toBe(1);
  });
});

describe('cordsFromCubicFeet', () => {
  it('treats a hundred and twenty eight cubic feet as one cord', () => {
    expect(cordsFromCubicFeet(128)).toBe(1);
  });
});

describe('quarters', () => {
  it('writes an inch as four quarters', () => {
    expect(quarters(1)).toBe(4);
    expect(quarters(1.25)).toBe(5);
    expect(quarters(2)).toBe(8);
  });

  it('refuses a thickness that is not a whole quarter', () => {
    expect(() => quarters(1.1)).toThrow(RangeError);
  });

  it('round trips through inches', () => {
    for (const q of [4, 5, 6, 8, 10, 12, 16]) {
      expect(quarters(inchesFromQuarters(q))).toBe(q);
    }
  });

  it('refuses a fractional quarter count', () => {
    expect(() => inchesFromQuarters(4.5)).toThrow(RangeError);
  });

  it('formats for a package tag', () => {
    expect(formatQuarters(quarters(1.5))).toBe('6/4');
  });
});
