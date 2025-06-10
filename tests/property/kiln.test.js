import { describe, expect, it } from 'vitest';
import {
  equilibriumMc,
  gradient,
  schedule,
  scheduleFor,
  scheduleIds,
  stepAt,
} from '../../src/kiln/schedule.js';
import { dryDimensions, shrinkageProgress, thicknessAt, widthAt } from '../../src/kiln/moisture.js';
import { chargeRisk, degradeCost, DEGRADE_KINDS } from '../../src/kiln/degrade.js';
import { conditionStep, equaliseStep } from '../../src/kiln/conditioning.js';
import {
  degradeAfter,
  holdingCost,
  safeHoldingDays,
  STORAGE,
} from '../../src/inventory/degrade.js';
import { makeBoard } from '../../src/model/board.js';
import { speciesKeys } from '../../src/model/species.js';
import { numberBetween, oneOf, rng } from './generators.js';

const SEASONS = ['winter', 'spring', 'summer', 'autumn'];

describe('kiln schedules', () => {
  it('cover every moisture from green to dry without a gap', () => {
    for (const id of scheduleIds()) {
      const steps = schedule(id).steps;
      for (let mc = steps.at(-1).toMc; mc <= steps[0].fromMc; mc += 0.5) {
        expect(stepAt(id, mc)).not.toBeNull();
      }
    }
  });

  it('never hold the wood at a wetter equilibrium as the run goes on', () => {
    for (const id of scheduleIds()) {
      let previous = Infinity;
      for (const step of schedule(id).steps) {
        const emc = equilibriumMc(step.dryBulbF, step.depressionF);
        expect(emc).toBeLessThanOrEqual(previous);
        previous = emc;
      }
    }
  });

  it('pick a schedule for every species at every thickness the yard saws', () => {
    for (const species of speciesKeys()) {
      for (const thicknessIn of [0.75, 1, 1.25, 1.5, 2, 3, 4]) {
        expect(scheduleFor(species, thicknessIn).schedule.id).toBeTruthy();
      }
    }
  });

  it('never report a gradient of nothing while the wood is still wet', () => {
    for (const id of scheduleIds()) {
      expect(gradient(id, 50).gradient).toBeGreaterThan(1);
    }
  });
});

describe('shrinkage', () => {
  it('never moves wood above fibre saturation', () => {
    const next = rng(211);
    for (let i = 0; i < 200; i += 1) {
      const species = oneOf(next, speciesKeys());
      const from = numberBetween(next, 30, 120, 0);
      const to = numberBetween(next, 30, 120, 0);
      expect(widthAt(species, 8, from, to)).toBe(8);
    }
  });

  it('never grows wood on the way down', () => {
    const next = rng(223);
    for (let i = 0; i < 200; i += 1) {
      const species = oneOf(next, speciesKeys());
      const to = numberBetween(next, 4, 25, 0);
      expect(widthAt(species, 8, 60, to)).toBeLessThanOrEqual(8);
      expect(thicknessAt(species, 2, 60, to)).toBeLessThanOrEqual(2);
    }
  });

  it('never moves the width less than the thickness on flatsawn stock', () => {
    for (const species of speciesKeys()) {
      const widthLoss = 8 - widthAt(species, 8, 60, 8);
      const thicknessLoss = 8 - thicknessAt(species, 8, 60, 8);
      expect(widthLoss).toBeGreaterThan(thicknessLoss);
    }
  });

  it('never moves surface measure up on drying', () => {
    const next = rng(227);
    for (let i = 0; i < 200; i += 1) {
      const board = makeBoard({
        id: 'B',
        species: oneOf(next, speciesKeys()),
        thicknessIn: 1,
        widthIn: numberBetween(next, 3, 16, 0),
        lengthFt: numberBetween(next, 4, 16, 0),
        moisturePct: 60,
      });
      expect(dryDimensions(board).surfaceMeasure).toBeLessThanOrEqual(board.surfaceMeasure);
    }
  });

  it('is a share between nothing and everything at every moisture', () => {
    for (let mc = 0; mc <= 120; mc += 1) {
      const progress = shrinkageProgress(mc);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });
});

describe('kiln risk', () => {
  it('is never negative and never nothing while the wood is wet', () => {
    const next = rng(229);
    for (let i = 0; i < 200; i += 1) {
      const risk = chargeRisk(
        {
          species: oneOf(next, speciesKeys()),
          thicknessIn: numberBetween(next, 0.75, 3, 2),
          scheduleId: oneOf(next, scheduleIds()),
          moisturePct: numberBetween(next, 35, 90, 0),
        },
        { stickerSpacingIn: numberBetween(next, 12, 60, 0), weightedTop: next() > 0.5 }
      );
      expect(risk.stress.risk).toBeGreaterThan(0);
      expect(risk.shape.risk).toBeGreaterThan(0);
    }
  });

  it('costs something for every degrade and never more than the board', () => {
    for (const kind of [...DEGRADE_KINDS.stress, ...DEGRADE_KINDS.shape]) {
      const cost = degradeCost(kind, 100);
      expect(cost.lostBoardFeet).toBeGreaterThan(0);
      expect(cost.lostBoardFeet).toBeLessThanOrEqual(100);
    }
  });
});

describe('the finish steps', () => {
  it('always hold drier when equalising than when conditioning', () => {
    for (let target = 6; target <= 12; target += 1) {
      expect(equaliseStep(target).holdEmc).toBeLessThan(conditionStep(target).wantEmc);
    }
  });

  it('always take longer to condition thicker stock', () => {
    let previous = 0;
    for (const thicknessIn of [1, 1.5, 2, 3]) {
      const hours = conditionStep(7, { thicknessIn }).hours;
      expect(hours).toBeGreaterThan(previous);
      previous = hours;
    }
  });
});

describe('holding wood on the deck', () => {
  it('never costs less the longer it sits', () => {
    const next = rng(233);
    for (let i = 0; i < 120; i += 1) {
      const species = oneOf(next, speciesKeys());
      const storage = oneOf(next, STORAGE);
      const season = oneOf(next, SEASONS);
      const short = holdingCost(species, 15, 1000, 900, { storage, season }).lostValue;
      const long = holdingCost(species, 90, 1000, 900, { storage, season }).lostValue;
      expect(long).toBeGreaterThanOrEqual(short);
    }
  });

  it('never reports a share above everything', () => {
    for (const species of speciesKeys()) {
      const state = degradeAfter(species, 3000);
      for (const share of Object.values(state.shares)) {
        expect(share).toBeLessThanOrEqual(1);
      }
    }
  });

  it('always allows longer under a sprinkler than in the open', () => {
    for (const species of speciesKeys()) {
      expect(safeHoldingDays(species, 900, { storage: 'sprinkled' })).toBeGreaterThanOrEqual(
        safeHoldingDays(species, 900, { storage: 'open' })
      );
    }
  });
});
