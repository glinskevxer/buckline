import { describe, expect, it } from 'vitest';
import {
  column,
  decimalC,
  gross,
  largestDiameterIn,
  roundsTo,
  scale,
  smallestDiameterIn,
  tableDiameters,
  tableEntry,
} from '../../../src/scale/rules/scribner.js';

describe('the table', () => {
  it('covers every whole inch from six to forty', () => {
    expect(tableDiameters()).toEqual(
      Array.from({ length: largestDiameterIn - smallestDiameterIn + 1 }, (_, i) => i + 6)
    );
  });

  it('never goes down as the log gets bigger', () => {
    const diameters = tableDiameters();
    for (let i = 1; i < diameters.length; i += 1) {
      expect(tableEntry(diameters[i])).toBeGreaterThan(tableEntry(diameters[i - 1]));
    }
  });

  it('holds every entry in whole tens', () => {
    for (const d of tableDiameters()) {
      expect(tableEntry(d) % 10).toBe(0);
    }
  });

  it('carries the wide pair of steps at nineteen and twenty inches', () => {
    const step = (d) => tableEntry(d) - tableEntry(d - 1);
    expect(step(19)).toBe(40);
    expect(step(20)).toBe(40);
    expect(step(18)).toBeLessThan(step(19));
    expect(step(21)).toBeLessThan(step(20));
  });

  it('reads a fractional diameter as its whole inch class', () => {
    expect(tableEntry(16.9)).toBe(tableEntry(16));
  });

  it('returns null off the ends of the table', () => {
    expect(tableEntry(5)).toBeNull();
    expect(tableEntry(41)).toBeNull();
  });
});

describe('scale', () => {
  it('returns the table entry itself on a sixteen foot log', () => {
    for (const d of tableDiameters()) {
      expect(scale(d, 16)).toBe(tableEntry(d));
    }
  });

  it('halves on an eight foot log', () => {
    expect(scale(16, 8)).toBe(80);
  });

  it('prorates an odd length off the sixteen foot column', () => {
    expect(gross(16, 12)).toBeCloseTo(120, 9);
    expect(scale(16, 12)).toBe(120);
  });

  it('rounds to the nearest ten', () => {
    for (let d = 6; d <= 40; d += 1) {
      expect(scale(d, 11) % roundsTo).toBe(0);
    }
  });

  it('finds nothing under the smallest class', () => {
    expect(scale(5, 16)).toBe(0);
    expect(gross(0, 16)).toBe(0);
  });

  it('holds a monster log at the top of the table', () => {
    expect(scale(48, 16)).toBe(scale(40, 16));
  });
});

describe('decimalC', () => {
  it('drops the last digit', () => {
    expect(decimalC(16, 16)).toBe(16);
    expect(decimalC(24, 16)).toBe(40);
  });

  it('always comes out a whole number', () => {
    for (let d = 6; d <= 40; d += 1) {
      for (const length of [8, 10, 12, 14, 16]) {
        expect(Number.isInteger(decimalC(d, length))).toBe(true);
      }
    }
  });
});

describe('column', () => {
  it('carries both the board feet and the decimal form', () => {
    const values = column(16, { from: 12, to: 14 });
    expect(values).toEqual([
      { diameterIn: 12, boardFeet: 80, decimalC: 8 },
      { diameterIn: 13, boardFeet: 100, decimalC: 10 },
      { diameterIn: 14, boardFeet: 110, decimalC: 11 },
    ]);
  });
});

describe('guards', () => {
  it('rejects nonsense arguments', () => {
    expect(() => gross('16', 16)).toThrow(TypeError);
    expect(() => gross(16, -8)).toThrow(RangeError);
    expect(() => tableEntry(NaN)).toThrow(TypeError);
  });
});
