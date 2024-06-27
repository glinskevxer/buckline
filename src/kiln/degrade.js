/**
 * Drying degrade.
 *
 * Everything that goes wrong in a kiln goes wrong for one of two reasons. The
 * shell dried faster than the core and pulled itself apart, or the board was
 * not held flat while it moved. The first gives checks, honeycomb and
 * collapse; the second gives bow, crook, cup and twist. They need different
 * fixes and a mill that treats them as one problem chases the wrong one.
 *
 * Risk is not a number the wood carries. It comes out of the schedule the
 * charge is on, the species, the thickness and how the pile was stacked, and
 * the same board is at high risk on one schedule and low on another.
 */

import { lookupSpecies } from '../model/species.js';
import { round2, round3 } from '../num.js';
import { KilnError, gradient, schedule } from './schedule.js';

/** The two families and what sits in each. */
export const DEGRADE_KINDS = {
  stress: ['surface check', 'end check', 'honeycomb', 'collapse'],
  shape: ['bow', 'crook', 'cup', 'twist'],
};

/** Sticker spacing beyond which a board is not held flat any more. */
export const MAX_STICKER_SPACING_IN = 24;

/**
 * Stress risk. Driven by the gradient the schedule imposes while the wood is
 * still above fibre saturation, scaled by how far the water has to travel and
 * how hard the species is to dry.
 */
export function stressRisk(charge) {
  const { species, thicknessIn, scheduleId, moisturePct = 60 } = charge;
  const entry = lookupSpecies(species);
  const reading = gradient(scheduleId, moisturePct);
  if (!reading) {
    return { risk: 0, band: 'none', because: 'the charge is off the schedule' };
  }

  const severity = schedule(scheduleId).severity;
  const severityFactor = 1 + (severity - 1) * 0.25;
  const thicknessFactor = thicknessIn;
  const densityFactor = entry.densityLbPerFt3 / 40;
  const raw = reading.gradient * severityFactor * thicknessFactor * densityFactor;
  const risk = round3(raw / 8);

  return {
    risk,
    band: band(risk),
    gradient: reading.gradient,
    because: `gradient ${reading.gradient} on a severity ${severity} schedule in ${thicknessIn} inch ${entry.key}`,
  };
}

/**
 * Shape risk. Nothing to do with the schedule at all. A board goes out of
 * shape because the pile let it, so this reads the stacking.
 */
export function shapeRisk(pile) {
  const {
    stickerSpacingIn = 24,
    stickerThicknessIn = 0.75,
    weightedTop = false,
    boardThicknessIn = 1,
  } = pile;

  if (stickerSpacingIn <= 0) {
    throw new KilnError('sticker spacing must be positive', { path: 'stickerSpacingIn' });
  }

  let risk = stickerSpacingIn / MAX_STICKER_SPACING_IN;
  const notes = [];
  if (stickerSpacingIn > MAX_STICKER_SPACING_IN) {
    notes.push(`stickers ${stickerSpacingIn} inches apart, over the ${MAX_STICKER_SPACING_IN} inch limit`);
  }
  if (stickerThicknessIn < 0.5) {
    risk *= 1.3;
    notes.push('stickers too thin to let air through');
  }
  if (!weightedTop) {
    risk *= 1.4;
    notes.push('no weight on the top of the pile');
  }
  if (boardThicknessIn < 1) {
    risk *= 1.5;
    notes.push('thin stock moves more than thick');
  }

  const scaled = round3(risk / 2);
  return { risk: scaled, band: band(scaled), notes };
}

/**
 * The whole picture for a charge. The two risks are reported separately
 * because the fix for one does nothing for the other, and the worse of the two
 * is what decides whether the charge is worth running as loaded.
 */
export function chargeRisk(charge, pile) {
  const stress = stressRisk(charge);
  const shape = shapeRisk({ ...pile, boardThicknessIn: charge.thicknessIn });
  const worst = stress.risk >= shape.risk ? 'stress' : 'shape';
  return {
    stress,
    shape,
    worst,
    band: band(Math.max(stress.risk, shape.risk)),
    remedies: remediesFor(stress, shape),
  };
}

function remediesFor(stress, shape) {
  const out = [];
  if (stress.band === 'high') {
    out.push('drop to a milder schedule or hold the current step longer');
  } else if (stress.band === 'medium') {
    out.push('watch the shell for checks before advancing the step');
  }
  for (const note of shape.notes) {
    out.push(`restack: ${note}`);
  }
  return out;
}

function band(risk) {
  if (risk >= 1) return 'high';
  if (risk >= 0.6) return 'medium';
  if (risk > 0) return 'low';
  return 'none';
}

/**
 * What a degrade costs. A stress defect takes the board down a grade or out
 * altogether; a shape defect is often recoverable by ripping or resawing, so
 * it costs footage rather than grade.
 */
export function degradeCost(kind, boardFeet) {
  if (DEGRADE_KINDS.stress.includes(kind)) {
    const share = kind === 'honeycomb' || kind === 'collapse' ? 1 : 0.4;
    return { kind, family: 'stress', lostBoardFeet: round2(boardFeet * share), recoverable: share < 1 };
  }
  if (DEGRADE_KINDS.shape.includes(kind)) {
    const share = kind === 'twist' ? 0.5 : 0.25;
    return { kind, family: 'shape', lostBoardFeet: round2(boardFeet * share), recoverable: true };
  }
  throw new KilnError(`nothing called ${kind} is a drying degrade`, { path: 'kind' });
}
