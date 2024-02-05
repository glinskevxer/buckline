import { describe, expect, it } from 'vitest';
import {
  column,
  gross,
  id,
  roundsTo,
  scale,
  sectionVolume,
  sections,
  segmentFt,
} from '../../../src/scale/rules/international.js';

describe('published table values', () => {
  const published = [
    [12, 12, 70],
    [16, 16, 180],
    [20, 16, 290],
    [10, 8, 30],
    [14, 12, 100],
    [18, 14, 200],
    [24, 16, 425],
  ];

  for (const [diameter, length, expected] of published) {
    it(`scales a ${diameter} inch by ${length} foot log at ${expected}`, () => {
      expect(scale(diameter, length)).toBe(expected);
    });
  }
});

describe('sectionVolume', () => {
  it('follows the quarter inch coefficients', () => {
    expect(sectionVolume(16)).toBeCloseTo(0.199 * 256 - 0.642 * 16, 9);
  });

  it('never returns a negative volume on a tiny stick', () => {
    expect(sectionVolume(1)).toBe(0);
    expect(sectionVolume(0)).toBe(0);
  });
});

describe('sections', () => {
  it('splits a sixteen foot log into four sections', () => {
    expect(sections(16, 16)).toHaveLength(4);
  });

  it('adds half an inch of taper per section', () => {
    expect(sections(16, 16).map((s) => s.smallEndIn)).toEqual([16, 16.5, 17, 17.5]);
  });

  it('grows the section volume as the log opens out', () => {
    const volumes = sections(16, 16).map((s) => s.boardFeet);
    for (let i = 1; i < volumes.length; i += 1) {
      expect(volumes[i]).toBeGreaterThan(volumes[i - 1]);
    }
  });

  it('prorates a last section shorter than four feet', () => {
    const list = sections(16, 14);
    expect(list).toHaveLength(4);
    expect(list[3].lengthFt).toBe(2);
    expect(list[3].boardFeet).toBeCloseTo(sectionVolume(17.5) / 2, 3);
  });

  it('sums to the unrounded gross', () => {
    const total = sections(18, 14).reduce((sum, s) => sum + s.boardFeet, 0);
    expect(total).toBeCloseTo(gross(18, 14), 2);
  });
});

describe('taper accounting', () => {
  it('finds more in one long log than in two short ones of the same small end', () => {
    expect(gross(16, 16)).toBeGreaterThan(gross(16, 8) * 2);
  });

  it('is not linear in length, unlike a formula rule', () => {
    expect(gross(16, 16)).not.toBeCloseTo(gross(16, 8) * 2, 3);
  });
});

describe('rounding', () => {
  it('rounds to the nearest five board feet', () => {
    for (let d = 6; d <= 30; d += 1) {
      expect(scale(d, 12) % roundsTo).toBe(0);
    }
  });

  it('returns zero for a zero length log', () => {
    expect(gross(16, 0)).toBe(0);
  });
});

describe('metadata', () => {
  it('declares four foot segments and a length deduction style', () => {
    expect(id).toBe('international');
    expect(segmentFt).toBe(4);
  });
});

describe('column', () => {
  it('rises with diameter', () => {
    const values = column(16, { from: 8, to: 30 });
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i].boardFeet).toBeGreaterThan(values[i - 1].boardFeet);
    }
  });
});

describe('guards', () => {
  it('rejects nonsense arguments', () => {
    expect(() => gross('16', 16)).toThrow(TypeError);
    expect(() => gross(16, -4)).toThrow(RangeError);
  });
});
