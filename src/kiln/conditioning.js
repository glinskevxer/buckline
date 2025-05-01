/**
 * Equalising and conditioning.
 *
 * A charge that has reached its target moisture is not finished. Two things
 * are still wrong with it and they are different problems with different
 * fixes, which is why they are two steps and not one.
 *
 * Equalising fixes the spread. The driest boards in a charge are drier than
 * the target and the wettest are wetter, and a customer machining a package
 * where one board is at four percent and its neighbour at ten will have
 * trouble with both. Equalising holds the kiln at the equilibrium moisture of
 * the driest acceptable board until the wettest catches up.
 *
 * Conditioning fixes the stress. Wood that dried shell first is in tension
 * inside and compression outside, and a board like that closes on the saw or
 * springs off it. Conditioning puts steam back in to swell the shell, and it
 * is checked with a prong test rather than with a meter, because a meter
 * cannot see stress at all.
 */

import { round1, round2 } from '../num.js';
import { KilnError, equilibriumMc } from './schedule.js';
import { chargeSpread } from './moisture.js';

/** How far off target a charge may be before equalising is needed. */
export const EQUALISE_SPREAD_PCT = 2;

/**
 * The equalising step for a charge at a target moisture. The kiln is held at
 * the equilibrium moisture of one percent under the driest board that would be
 * acceptable, so the dry boards stop moving and the wet ones keep going.
 */
export function equaliseStep(targetPct, options = {}) {
  const { dryBulbF = 160 } = options;
  if (!(targetPct > 0)) {
    throw new KilnError('equalising needs a target moisture', { path: 'targetPct' });
  }
  const holdEmc = round1(Math.max(1.5, targetPct - 1));

  // Work back from the equilibrium moisture we want to the depression that
  // produces it, which is what the operator can actually set on the kiln.
  let depressionF = 0;
  while (depressionF < 120 && equilibriumMc(dryBulbF, depressionF) > holdEmc) {
    depressionF += 1;
  }

  return {
    targetPct,
    holdEmc,
    dryBulbF,
    depressionF,
    reachedEmc: equilibriumMc(dryBulbF, depressionF),
  };
}

/** Whether the charge is even enough to stop equalising. */
export function equalised(readings, targetPct, options = {}) {
  const { spreadPct = EQUALISE_SPREAD_PCT } = options;
  const spread = chargeSpread(readings);
  const reasons = [];
  if (spread.spread > spreadPct) {
    reasons.push(`the charge still runs ${spread.spread} points from driest to wettest`);
  }
  if (spread.wettest > targetPct + spreadPct) {
    reasons.push(`the wettest board is still at ${spread.wettest}`);
  }
  return { done: reasons.length === 0, spread, reasons };
}

/**
 * The conditioning step. The kiln is taken to an equilibrium moisture several
 * points above the target so the shell takes water back up and swells, which
 * relieves the tension in the core.
 */
export function conditionStep(targetPct, options = {}) {
  const { dryBulbF = 160, overshootPct = 4, thicknessIn = 1 } = options;
  const wantEmc = round1(targetPct + overshootPct);

  let depressionF = 30;
  while (depressionF > 0 && equilibriumMc(dryBulbF, depressionF) < wantEmc) {
    depressionF -= 1;
  }

  // Thick stock has further for the water to travel back in, and the time goes
  // up faster than the thickness because it is a diffusion problem.
  const hours = round1(4 * thicknessIn ** 1.5);

  return {
    targetPct,
    wantEmc,
    dryBulbF,
    depressionF,
    reachedEmc: equilibriumMc(dryBulbF, depressionF),
    hours,
  };
}

/**
 * Reads a prong test. Two prongs are cut from a section, and what they do says
 * what the stress is: they close on tension in the core, splay on compression,
 * and stay straight when the board is free of stress.
 */
export function readProngs(gapIn, options = {}) {
  const { toleranceIn = 0.03 } = options;
  if (typeof gapIn !== 'number' || !Number.isFinite(gapIn)) {
    throw new KilnError('a prong test needs a measured gap', { path: 'gapIn' });
  }
  if (Math.abs(gapIn) <= toleranceIn) {
    return { state: 'free', gapIn, says: 'the board carries no stress worth relieving' };
  }
  if (gapIn < 0) {
    return {
      state: 'casehardened',
      gapIn,
      says: 'the prongs closed, so the core is in tension and needs more conditioning',
    };
  }
  return {
    state: 'reverse',
    gapIn,
    says: 'the prongs splayed, so the conditioning was carried too far',
  };
}

/**
 * The whole finish for a charge: whether it needs equalising, whether it needs
 * conditioning, and what to set. A charge that needs neither is done, and
 * conditioning one that does not need it is not harmless.
 */
export function finishPlan(charge, readings, prongGapIn, options = {}) {
  const { targetPct = 7, thicknessIn = 1 } = options;
  const even = equalised(readings, targetPct, options);
  const prongs = readProngs(prongGapIn, options);

  const steps = [];
  if (!even.done) {
    steps.push({
      step: 'equalise',
      ...equaliseStep(targetPct, options),
      why: even.reasons.join('; '),
    });
  }
  if (prongs.state === 'casehardened') {
    steps.push({
      step: 'condition',
      ...conditionStep(targetPct, { ...options, thicknessIn }),
      why: prongs.says,
    });
  }

  return {
    schedule: charge.schedule,
    boardFeet: charge.boardFeet,
    steps,
    done: steps.length === 0,
    prongs,
    spread: even.spread,
    extraHours: round2(steps.reduce((total, step) => total + (step.hours ?? 8), 0)),
  };
}
