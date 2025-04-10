import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { makePriceList } from '../../src/price/list.js';
import { PATTERNS, saw } from '../../src/mill/pattern.js';
import { targetThickness, totalVariationIn } from '../../src/mill/target-size.js';
import { residueBalance } from '../../src/mill/residue.js';
import { bestEdging } from '../../src/mill/edger.js';
import { cutCandidates, makeStem } from '../../src/buck/stem.js';
import { withLengthClasses } from '../../src/buck/candidates.js';
import { buckStem } from '../../src/buck/optimize.js';
import { forEachSample, numberBetween, oneOf, rng, someLog } from './generators.js';

const prices = makePriceList({
  id: 'PL-1',
  effectiveFrom: '2024-01-01',
  base: {
    'red oak': 1400,
    'white oak': 1500,
    'hard maple': 1600,
    'soft maple': 900,
    'yellow poplar': 700,
    'black cherry': 2000,
    ash: 900,
    hickory: 700,
    beech: 600,
    basswood: 700,
  },
});

describe('sawing patterns', () => {
  it('never make a board wider than the log', () => {
    forEachSample(20250405, 120, someLog, (raw) => {
      const log = makeLog(raw);
      if (!log.merchantable) return;
      for (const pattern of PATTERNS) {
        for (const board of saw(log, pattern).boards) {
          expect(board.widthIn).toBeLessThanOrEqual(log.scalingDiameterIn + 1e-6);
        }
      }
    });
  });

  it('never make a board longer than the log', () => {
    forEachSample(20250406, 120, someLog, (raw) => {
      const log = makeLog(raw);
      if (!log.merchantable) return;
      for (const pattern of PATTERNS) {
        for (const board of saw(log, pattern).boards) {
          expect(board.lengthFt).toBe(log.nominalLengthFt);
        }
      }
    });
  });

  it('never saw more board feet than the log holds as solid wood', () => {
    forEachSample(20250407, 120, someLog, (raw) => {
      const log = makeLog(raw);
      if (!log.merchantable) return;
      const solid = (Math.PI / 4) * log.scalingDiameterIn ** 2 * log.nominalLengthFt * (1 / 12);
      for (const pattern of PATTERNS) {
        expect(saw(log, pattern).boardFeet).toBeLessThanOrEqual(solid + 1e-6);
      }
    });
  });

  it('always lose volume to a wider kerf', () => {
    forEachSample(20250408, 80, someLog, (raw) => {
      const log = makeLog(raw);
      if (!log.merchantable || log.scalingDiameterIn < 10) return;
      const thin = saw(log, 'live', { kerfIn: 0.09 }).boardFeet;
      const wide = saw(log, 'live', { kerfIn: 0.3 }).boardFeet;
      expect(wide).toBeLessThanOrEqual(thin);
    });
  });
});

describe('target sizing', () => {
  it('never targets under the finished thickness', () => {
    const next = rng(101);
    for (let i = 0; i < 300; i += 1) {
      const request = {
        species: oneOf(next, ['red oak', 'hickory', 'basswood']),
        finishedThicknessIn: numberBetween(next, 0.5, 3, 2),
        machine: oneOf(next, ['thin kerf band', 'wide band', 'circular', 'scragg']),
        surfacing: oneOf(next, ['rough', 's1s', 's2s']),
        toMoisturePct: numberBetween(next, 4, 40, 0),
      };
      const result = targetThickness(request);
      expect(result.targetThicknessIn).toBeGreaterThanOrEqual(request.finishedThicknessIn);
      expect(result.oversizeIn).toBeGreaterThanOrEqual(0);
    }
  });

  it('never adds the two saw variations straight', () => {
    for (const machine of ['thin kerf band', 'wide band', 'circular', 'scragg']) {
      const total = totalVariationIn(machine);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThan(0.1);
    }
  });
});

describe('residue', () => {
  it('never reports a negative stream', () => {
    forEachSample(20250409, 100, someLog, (raw) => {
      const log = makeLog(raw);
      if (!log.merchantable) return;
      const balance = residueBalance(log, saw(log, 'live'));
      for (const value of Object.values(balance.streams)) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('always accounts for the whole log', () => {
    forEachSample(20250410, 100, someLog, (raw) => {
      const log = makeLog(raw);
      if (!log.merchantable) return;
      const balance = residueBalance(log, saw(log, 'live'));
      const inside =
        balance.lumberCubicFeet +
        balance.streams.trim +
        balance.streams.sawdust +
        balance.streams.chips;
      expect(inside).toBeCloseTo(balance.logCubicFeet, 1);
    });
  });
});

describe('the edger', () => {
  it('never picks a width wider than the flitch', () => {
    const next = rng(103);
    for (let i = 0; i < 200; i += 1) {
      const wide = numberBetween(next, 5, 18, 1);
      const flitch = {
        thicknessIn: 1,
        wideWidthIn: wide,
        narrowWidthIn: numberBetween(next, 3, wide, 1),
        lengthFt: numberBetween(next, 6, 16, 0),
      };
      const result = bestEdging(flitch, {
        FAS: 1450,
        SEL: 1130,
        '1C': 800,
        '2AC': 460,
        '3AC': 260,
      });
      if (result.best) {
        expect(result.best.widthIn).toBeLessThanOrEqual(flitch.wideWidthIn);
      }
    }
  });
});

describe('bucking', () => {
  // Built by shrinking rather than by picking four numbers, because a profile
  // that gets fatter going up is not a stem and the generator kept making one.
  function someStem(next, index) {
    const butt = numberBetween(next, 16, 34, 0);
    const atEight = butt - numberBetween(next, 1, 4, 0);
    const atThirtyTwo = Math.max(8, Math.round(atEight * numberBetween(next, 0.5, 0.8, 2)));
    const atFortyEight = Math.max(4, Math.round(atThirtyTwo * numberBetween(next, 0.4, 0.7, 2)));
    return makeStem({
      id: `S-${index}`,
      species: oneOf(next, ['red oak', 'white oak', 'yellow poplar']),
      profile: [
        { atFt: 0, diameterIn: butt },
        { atFt: 8, diameterIn: atEight },
        { atFt: 32, diameterIn: atThirtyTwo },
        { atFt: 48, diameterIn: atFortyEight },
      ],
      defects: [{ type: 'catface', atFt: numberBetween(next, 5, 30, 0), lengthFt: 2 }],
    });
  }

  it('never overlaps two logs and never runs past the merchantable top', () => {
    forEachSample(20250411, 25, someStem, (stem) => {
      const rough = cutCandidates(stem, { topDiameterIn: 12 });
      const positions = withLengthClasses(stem, rough, { topFt: rough.at(-1) });
      const result = buckStem(stem, positions, 'doyle', prices, { maxLogs: 4 });
      for (let i = 1; i < result.logs.length; i += 1) {
        expect(result.logs[i].fromFt).toBeGreaterThanOrEqual(result.logs[i - 1].toFt);
      }
      if (result.logs.length > 0) {
        expect(result.logs.at(-1).toFt).toBeLessThanOrEqual(rough.at(-1) + 1e-9);
      }
    });
  });

  it('never finds less value when it is allowed more logs', () => {
    forEachSample(20250412, 20, someStem, (stem) => {
      const rough = cutCandidates(stem, { topDiameterIn: 12 });
      const positions = withLengthClasses(stem, rough, { topFt: rough.at(-1) });
      const two = buckStem(stem, positions, 'doyle', prices, { maxLogs: 2 }).value;
      const four = buckStem(stem, positions, 'doyle', prices, { maxLogs: 4 }).value;
      expect(four).toBeGreaterThanOrEqual(two - 1e-6);
    });
  });

  it('always accounts for the whole merchantable length', () => {
    forEachSample(20250413, 20, someStem, (stem) => {
      const rough = cutCandidates(stem, { topDiameterIn: 12 });
      const positions = withLengthClasses(stem, rough, { topFt: rough.at(-1) });
      const result = buckStem(stem, positions, 'doyle', prices, { maxLogs: 4 });
      expect(result.usedLengthFt + result.wasteLengthFt).toBeCloseTo(
        rough.at(-1) - stem.stumpHeightFt,
        1
      );
    });
  });
});
