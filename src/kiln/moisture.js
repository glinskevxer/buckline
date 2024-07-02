/**
 * Moisture and shrinkage.
 *
 * Wood does not move at all until it drops below fibre saturation, around
 * thirty percent, because until then the water leaving is sitting in the cell
 * cavities and taking none of the cell wall with it. Below that point every
 * further percent of moisture takes a proportional share of the total possible
 * shrinkage.
 *
 * This matters to grading and not just to the kiln. A board is measured across
 * the width, and a green board that measures seven inches will measure a shade
 * under six and three quarters at eight percent. Surface measure is width by
 * length rounded, so a board can move a whole unit of surface measure as it
 * dries, and the cutting allowance is looked up from surface measure. A green
 * grade is therefore provisional: not because the grader was unsure, but
 * because the board it graded is no longer the board in the shed.
 */

import { lookupSpecies } from '../model/species.js';
import { surfaceMeasure } from '../model/board.js';
import { round1, round3 } from '../num.js';
import { KilnError } from './schedule.js';

/** Below this moisture content the wood starts to move. */
export const FIBRE_SATURATION_PCT = 30;

/** What the shed holds a board at once it has settled. */
export const SHED_EMC_PCT = 8;

/**
 * The fraction of the total green to oven dry shrinkage that has happened by
 * a given moisture content. Nothing above fibre saturation, all of it at zero.
 */
export function shrinkageProgress(moisturePct) {
  if (moisturePct < 0) {
    throw new KilnError('moisture content must not be negative', { path: 'moisturePct' });
  }
  if (moisturePct >= FIBRE_SATURATION_PCT) return 0;
  return (FIBRE_SATURATION_PCT - moisturePct) / FIBRE_SATURATION_PCT;
}

/**
 * Width after drying from one moisture content to another. Width moves on the
 * tangential figure, because a flatsawn board's width runs tangentially to the
 * rings and that is where nearly all the movement is.
 */
export function widthAt(species, greenWidthIn, fromMoisturePct, toMoisturePct) {
  const entry = lookupSpecies(species);
  const from = shrinkageProgress(fromMoisturePct);
  const to = shrinkageProgress(toMoisturePct);
  const movement = (to - from) * (entry.shrinkTangentialPct / 100);
  return round3(greenWidthIn * (1 - movement));
}

/** Thickness after drying. Quartersawn stock moves radially in thickness. */
export function thicknessAt(
  species,
  greenThicknessIn,
  fromMoisturePct,
  toMoisturePct,
  options = {}
) {
  const { quartersawn = false } = options;
  const entry = lookupSpecies(species);
  const pct = quartersawn ? entry.shrinkTangentialPct : entry.shrinkRadialPct;
  const movement =
    (shrinkageProgress(toMoisturePct) - shrinkageProgress(fromMoisturePct)) * (pct / 100);
  return round3(greenThicknessIn * (1 - movement));
}

/**
 * What a green board will measure once it is dry, and whether its surface
 * measure moves with it. A board whose surface measure drops is a board whose
 * cutting allowance may drop, so the grade has to be read again.
 */
export function dryDimensions(board, options = {}) {
  const { toMoisturePct = SHED_EMC_PCT, quartersawn = false } = options;
  const green = board.moisturePct ?? 60;
  const widthIn = widthAt(board.species, board.widthIn, green, toMoisturePct);
  const thicknessIn = thicknessAt(board.species, board.thicknessIn, green, toMoisturePct, {
    quartersawn,
  });
  const dryMeasure = surfaceMeasure(widthIn, board.lengthFt);

  return {
    fromMoisturePct: green,
    toMoisturePct,
    widthIn,
    thicknessIn,
    widthLostIn: round3(board.widthIn - widthIn),
    surfaceMeasure: dryMeasure,
    surfaceMeasureMoved: dryMeasure !== board.surfaceMeasure,
    surfaceMeasureFrom: board.surfaceMeasure,
  };
}

/**
 * A grade read on green stock is provisional whenever drying will move the
 * surface measure, because the allowance the grade was read under comes out of
 * the surface measure.
 */
export function gradeIsProvisional(board, options = {}) {
  const green = board.moisturePct ?? 60;
  if (green <= (options.toMoisturePct ?? SHED_EMC_PCT) + 1e-9) {
    return { provisional: false, reason: 'the board is already at its selling moisture' };
  }
  const dry = dryDimensions(board, options);
  if (!dry.surfaceMeasureMoved) {
    return { provisional: false, reason: 'surface measure does not move on drying' };
  }
  return {
    provisional: true,
    reason: `surface measure moves from ${dry.surfaceMeasureFrom} to ${dry.surfaceMeasure} on drying`,
    from: dry.surfaceMeasureFrom,
    to: dry.surfaceMeasure,
  };
}

/**
 * Moisture content from an oven dry test. This is the only measurement that
 * settles an argument, because a pin meter reads the wettest path between the
 * pins and a shell dry board reads far drier than it is.
 */
export function ovenDryMoisture(wetWeightG, dryWeightG) {
  if (dryWeightG <= 0) {
    throw new KilnError('oven dry weight must be positive', { path: 'dryWeightG' });
  }
  if (wetWeightG < dryWeightG) {
    throw new KilnError('the wet sample cannot weigh less than the dry one', {
      path: 'wetWeightG',
    });
  }
  return round1(((wetWeightG - dryWeightG) / dryWeightG) * 100);
}

/** The spread across a charge's sample boards, which is what a kiln operator watches. */
export function chargeSpread(readings) {
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new KilnError('a charge needs at least one sample board', { path: 'readings' });
  }
  const sorted = [...readings].sort((a, b) => a - b);
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  return {
    samples: sorted.length,
    wettest: sorted.at(-1),
    driest: sorted[0],
    mean: round1(mean),
    spread: round1(sorted.at(-1) - sorted[0]),
    even: sorted.at(-1) - sorted[0] <= 4,
  };
}
