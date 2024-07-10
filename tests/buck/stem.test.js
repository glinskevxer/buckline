import { describe, expect, it } from 'vitest';
import {
  BuckError,
  CROSSCUT_KERF_FT,
  cutCandidates,
  defectsBetween,
  diameterAtHeight,
  makeStem,
  merchantableHeightFt,
  taperOver,
} from '../../src/buck/stem.js';

const spec = {
  id: 'S-1',
  species: 'red oak',
  profile: [
    { atFt: 0, diameterIn: 26 },
    { atFt: 4, diameterIn: 22 },
    { atFt: 20, diameterIn: 18 },
    { atFt: 40, diameterIn: 12 },
    { atFt: 52, diameterIn: 6 },
  ],
  defects: [
    { type: 'catface', atFt: 8, lengthFt: 3 },
    { type: 'crook', atFt: 30, lengthFt: 2 },
  ],
};

const stem = makeStem(spec);

describe('makeStem', () => {
  it('measures the stem end to end', () => {
    expect(stem.totalLengthFt).toBe(52);
    expect(stem.buttDiameterIn).toBe(26);
    expect(stem.tipDiameterIn).toBe(6);
  });

  it('refuses a profile that does not climb', () => {
    const bad = {
      ...spec,
      profile: [
        { atFt: 4, diameterIn: 20 },
        { atFt: 4, diameterIn: 18 },
      ],
    };
    expect(() => makeStem(bad)).toThrow(BuckError);
  });

  it('refuses a stem that gets fatter going up', () => {
    const bad = {
      ...spec,
      profile: [
        { atFt: 0, diameterIn: 12 },
        { atFt: 10, diameterIn: 14 },
      ],
    };
    expect(() => makeStem(bad)).toThrow(BuckError);
  });

  it('refuses a profile with one point or none', () => {
    expect(() => makeStem({ ...spec, profile: [{ atFt: 0, diameterIn: 20 }] })).toThrow(BuckError);
  });

  it('refuses a stem with no identity', () => {
    expect(() => makeStem({ ...spec, id: '' })).toThrow(BuckError);
  });

  it('copies the profile and defects so callers cannot edit them', () => {
    const input = { ...spec, profile: spec.profile.map((p) => ({ ...p })) };
    const built = makeStem(input);
    input.profile[0].diameterIn = 99;
    expect(built.buttDiameterIn).toBe(26);
  });
});

describe('diameterAtHeight', () => {
  it('reads the breakpoints exactly', () => {
    expect(diameterAtHeight(stem, 0)).toBe(26);
    expect(diameterAtHeight(stem, 20)).toBe(18);
    expect(diameterAtHeight(stem, 52)).toBe(6);
  });

  it('runs straight between breakpoints', () => {
    expect(diameterAtHeight(stem, 30)).toBe(15);
    expect(diameterAtHeight(stem, 12)).toBe(20);
  });

  it('falls faster through the butt flare than up the merch length', () => {
    const flare = (26 - 22) / 4;
    const merch = (22 - 18) / 16;
    expect(flare).toBeGreaterThan(merch);
  });

  it('refuses a height off the stem', () => {
    expect(() => diameterAtHeight(stem, 60)).toThrow(BuckError);
    expect(() => diameterAtHeight(stem, -1)).toThrow(BuckError);
  });
});

describe('merchantableHeightFt', () => {
  it('finds where the stem falls to an eight inch top', () => {
    expect(merchantableHeightFt(stem, 8)).toBeCloseTo(48, 1);
  });

  it('goes higher for a smaller top', () => {
    expect(merchantableHeightFt(stem, 6)).toBeGreaterThan(merchantableHeightFt(stem, 8));
  });

  it('stops lower for a big top', () => {
    expect(merchantableHeightFt(stem, 18)).toBeCloseTo(20, 1);
  });

  it('finds nothing merchantable when the butt is already too small', () => {
    expect(merchantableHeightFt(stem, 30)).toBe(0);
  });

  it('runs to the tip when the top is smaller than the tip', () => {
    expect(merchantableHeightFt(stem, 4)).toBe(52);
  });
});

describe('taperOver', () => {
  it('measures the butt flare as steeper than the merch length', () => {
    expect(taperOver(stem, 0, 4)).toBeGreaterThan(taperOver(stem, 4, 20));
  });

  it('measures the top as steepest of all', () => {
    expect(taperOver(stem, 40, 52)).toBeGreaterThan(taperOver(stem, 20, 40));
  });

  it('refuses a stretch with no length', () => {
    expect(() => taperOver(stem, 10, 10)).toThrow(BuckError);
  });
});

describe('defectsBetween', () => {
  it('finds a defect inside the stretch', () => {
    expect(defectsBetween(stem, 4, 20)).toHaveLength(1);
  });

  it('finds nothing in a clear stretch', () => {
    expect(defectsBetween(stem, 12, 28)).toEqual([]);
  });

  it('reports the defect position relative to the log, not the stem', () => {
    expect(defectsBetween(stem, 4, 20)[0].startFt).toBe(4);
  });

  it('takes a defect that overlaps the end of the stretch', () => {
    expect(defectsBetween(stem, 0, 10)).toHaveLength(1);
  });

  it('leaves out one that only touches the boundary', () => {
    expect(defectsBetween(stem, 11, 20)).toEqual([]);
  });
});

describe('cutCandidates', () => {
  it('offers the stump, the defect edges and the merchantable top', () => {
    const points = cutCandidates(stem);
    expect(points[0]).toBe(0.5);
    expect(points).toContain(8);
    expect(points).toContain(11);
    expect(points).toContain(30);
    expect(points).toContain(32);
  });

  it('stops at the merchantable top', () => {
    const points = cutCandidates(stem, { topDiameterIn: 12 });
    expect(points.at(-1)).toBe(40);
    expect(points).not.toContain(48);
  });

  it('offers nothing above the top even where a defect sits', () => {
    const high = makeStem({ ...spec, defects: [{ type: 'crook', atFt: 45, lengthFt: 2 }] });
    expect(cutCandidates(high, { topDiameterIn: 12 })).toEqual([0.5, 40]);
  });

  it('offers the two ends on a clean stem', () => {
    const clean = makeStem({ ...spec, defects: [] });
    expect(cutCandidates(clean, { topDiameterIn: 12 })).toEqual([0.5, 40]);
  });

  it('comes back in order', () => {
    const points = cutCandidates(stem);
    expect(points).toEqual([...points].sort((a, b) => a - b));
  });

  it('loses a little length at every crosscut', () => {
    expect(CROSSCUT_KERF_FT).toBeGreaterThan(0);
  });
});
