import { describe, expect, it } from 'vitest';
import {
  ASSUMED_TAPER_PER_FOOT,
  TYPICAL_TAPER,
  diameterAt,
  distanceToDiameter,
  segmentDiameters,
  taperRate,
  trimButtSwell,
} from '../../src/measure/taper.js';

describe('taperRate', () => {
  it('finds an inch in eight feet on a well formed butt log', () => {
    expect(taperRate(16, 18, 16)).toBeCloseTo(0.125, 9);
  });

  it('reports zero on a cylinder', () => {
    expect(taperRate(14, 14, 12)).toBe(0);
  });

  it('refuses a log measured smaller at the butt', () => {
    expect(() => taperRate(18, 16, 12)).toThrow(RangeError);
  });

  it('is close to the butt figure the table carries', () => {
    expect(taperRate(16, 18, 16)).toBeCloseTo(TYPICAL_TAPER.butt, 3);
  });
});

describe('diameterAt', () => {
  it('returns the small end at zero distance', () => {
    expect(diameterAt(14, 0.125, 0)).toBe(14);
  });

  it('opens out toward the butt', () => {
    expect(diameterAt(14, 0.125, 16)).toBeCloseTo(16, 9);
  });

  it('refuses to walk off the end of the log', () => {
    expect(() => diameterAt(14, 0.125, 20, { lengthFt: 16 })).toThrow(RangeError);
  });

  it('allows the exact far end', () => {
    expect(diameterAt(14, 0.125, 16, { lengthFt: 16 })).toBeCloseTo(16, 9);
  });

  it('refuses a negative distance or a negative taper', () => {
    expect(() => diameterAt(14, 0.125, -1)).toThrow(RangeError);
    expect(() => diameterAt(14, -0.1, 4)).toThrow(RangeError);
  });
});

describe('segmentDiameters', () => {
  it('splits a sixteen foot log into four four foot segments', () => {
    const segments = segmentDiameters(12, ASSUMED_TAPER_PER_FOOT, 16, 4);
    expect(segments).toHaveLength(4);
    expect(segments.map((s) => s.smallEndIn)).toEqual([12, 12.5, 13, 13.5]);
  });

  it('gives every segment its own length', () => {
    const segments = segmentDiameters(12, 0.125, 16, 4);
    expect(segments.every((s) => s.lengthFt === 4)).toBe(true);
  });

  it('leaves a short last segment when the log does not divide evenly', () => {
    const segments = segmentDiameters(12, 0.125, 14, 4);
    expect(segments).toHaveLength(4);
    expect(segments[3].lengthFt).toBe(2);
  });

  it('returns one segment when the log is shorter than a segment', () => {
    const segments = segmentDiameters(12, 0.125, 3, 4);
    expect(segments).toHaveLength(1);
    expect(segments[0].lengthFt).toBe(3);
  });

  it('numbers the segments from the small end', () => {
    const segments = segmentDiameters(12, 0.125, 16, 8);
    expect(segments.map((s) => s.index)).toEqual([0, 1]);
    expect(segments[0].startFt).toBe(0);
    expect(segments[1].startFt).toBe(8);
  });
});

describe('distanceToDiameter', () => {
  it('finds where a stem reaches a ten inch top', () => {
    expect(distanceToDiameter(8, 0.125, 10)).toBeCloseTo(16, 9);
  });

  it('returns zero when the small end is already past the target', () => {
    expect(distanceToDiameter(12, 0.125, 10)).toBe(0);
  });

  it('returns null on a cylinder that never gets there', () => {
    expect(distanceToDiameter(8, 0, 10)).toBeNull();
  });
});

describe('trimButtSwell', () => {
  it('cuts a flared butt back to what the taper predicts', () => {
    expect(trimButtSwell(16, 26, 12)).toBeCloseTo(17.5, 9);
  });

  it('leaves a large end that is already inside the prediction alone', () => {
    expect(trimButtSwell(16, 17, 12)).toBe(17);
  });

  it('does not touch a log shorter than the swell', () => {
    expect(trimButtSwell(16, 26, 2)).toBe(26);
  });
});
