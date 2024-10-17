/**
 * Weight scaling.
 *
 * A truck crosses a scale twice and the difference is the wood. That is the
 * cheapest and most repeatable measurement in the whole trade, and it is
 * useless on its own, because the contract is written in board feet and green
 * weight per thousand board feet is not a constant. It moves with species,
 * with log size, with the season, and with how long the wood has been on the
 * landing.
 *
 * So a weight scale contract carries a conversion factor, and the factor is
 * not looked up from a table. It is measured, from loads that were both
 * weighed and stick scaled, and it goes stale. A factor derived in April from
 * eleven loads of red oak says nothing about August, and using it anyway is
 * the single commonest way a weight scale contract goes wrong.
 */

import { round1, round2, round4 } from '../num.js';
import { lookupSpecies } from '../model/species.js';
import { ScaleError } from '../errors.js';

/** Pounds in a ton, on the scale that matters here. */
export const POUNDS_PER_TON = 2000;

/** How long a measured factor is good for before it has to be redone. */
export const DEFAULT_FACTOR_DAYS = 60;

/** The fewest paired loads a factor can honestly be built from. */
export const MINIMUM_PAIRS = 8;

/** Cubic feet of solid lumber in a thousand board feet. */
const CUBIC_FEET_PER_MBF = 1000 / 12;

/** Green wood weighs about half again what the oven dry figure says. */
const GREEN_FACTOR = 1.55;

/**
 * A thousand board feet of scale is more than a thousand board feet of solid
 * wood, because the rule threw away slab, kerf and edging that the truck still
 * carried. Forty percent is the working allowance.
 */
const SCALE_TO_LOG = 1.4;

/**
 * A starting factor from the species alone, in pounds per thousand board feet
 * green. This is a place to begin, not a number to settle on, and anything
 * built from it is marked as an estimate all the way through.
 */
export function nominalFactor(species, options = {}) {
  const { season = 'summer' } = options;
  const entry = lookupSpecies(species);
  const seasonal = season === 'spring' ? 1.08 : season === 'winter' ? 1.03 : 1;
  const green = entry.densityLbPerFt3 * GREEN_FACTOR;
  return round1(green * CUBIC_FEET_PER_MBF * SCALE_TO_LOG * seasonal);
}

/**
 * Builds a factor from paired loads. Each pair is a weight and a stick scale
 * of the same load. The spread across the pairs is what says whether the
 * factor can be trusted, and it is reported rather than hidden in an average.
 */
export function measureFactor(pairs, options = {}) {
  const { species, measuredOn, minimumPairs = MINIMUM_PAIRS } = options;
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new ScaleError('a factor needs paired loads', { path: 'pairs' });
  }
  for (const [index, pair] of pairs.entries()) {
    if (!(pair.netWeightLb > 0) || !(pair.netBoardFeet > 0)) {
      throw new ScaleError(`pair ${index} needs both a weight and a scale`, { path: 'pairs' });
    }
  }

  const perMbf = pairs.map((pair) => pair.netWeightLb / (pair.netBoardFeet / 1000));
  const mean = perMbf.reduce((total, value) => total + value, 0) / perMbf.length;
  const spread = Math.max(...perMbf) - Math.min(...perMbf);
  const variance = perMbf.reduce((total, value) => total + (value - mean) ** 2, 0) / perMbf.length;

  return {
    species,
    measuredOn,
    pairs: pairs.length,
    poundsPerMbf: round1(mean),
    spreadLb: round1(spread),
    deviationLb: round1(Math.sqrt(variance)),
    relativeSpread: round4(spread / mean),
    usable: pairs.length >= minimumPairs && spread / mean <= 0.2,
    estimate: false,
  };
}

/** A factor from the species alone, marked as the estimate it is. */
export function estimatedFactor(species, options = {}) {
  return {
    species,
    measuredOn: options.measuredOn ?? null,
    pairs: 0,
    poundsPerMbf: nominalFactor(species, options),
    spreadLb: null,
    deviationLb: null,
    relativeSpread: null,
    usable: false,
    estimate: true,
  };
}

/** Whether a factor is still inside its validity window. */
export function factorIsCurrent(factor, onDate, options = {}) {
  const { days = DEFAULT_FACTOR_DAYS } = options;
  if (!factor.measuredOn) return false;
  const age = (Date.parse(onDate) - Date.parse(factor.measuredOn)) / 86400000;
  if (Number.isNaN(age)) return false;
  return age >= 0 && age <= days;
}

/**
 * Converts a weight to board feet. A factor that is stale or unusable is
 * refused rather than applied with a warning: a settlement built on it would
 * be paid before anybody read the warning.
 */
export function weightToBoardFeet(netWeightLb, factor, onDate, options = {}) {
  if (!(netWeightLb >= 0)) {
    throw new ScaleError('a weight scale needs a weight', { path: 'netWeightLb' });
  }
  if (!factor.usable) {
    throw new ScaleError(
      factor.estimate
        ? 'this factor is an estimate from the species and cannot settle a load'
        : `this factor was built from ${factor.pairs} loads and is not usable`,
      { path: 'factor' }
    );
  }
  if (onDate && !factorIsCurrent(factor, onDate, options)) {
    throw new ScaleError(`the factor measured on ${factor.measuredOn} is out of date`, {
      path: 'factor',
    });
  }
  return {
    netWeightLb: round1(netWeightLb),
    tons: round2(netWeightLb / POUNDS_PER_TON),
    poundsPerMbf: factor.poundsPerMbf,
    netBoardFeet: round1((netWeightLb / factor.poundsPerMbf) * 1000),
  };
}

/**
 * How far a weight scale and a stick scale disagree on one load. Watching this
 * is how a mill finds out its factor has drifted before the quarter ends.
 */
export function factorDrift(pairs, factor) {
  const rows = pairs.map((pair) => {
    const implied = pair.netWeightLb / (pair.netBoardFeet / 1000);
    return {
      implied: round1(implied),
      differenceLb: round1(implied - factor.poundsPerMbf),
      share: round4((implied - factor.poundsPerMbf) / factor.poundsPerMbf),
    };
  });
  const mean = rows.reduce((total, row) => total + row.share, 0) / rows.length;
  return {
    rows,
    meanShare: round4(mean),
    direction:
      Math.abs(mean) < 0.005
        ? 'holding'
        : mean > 0
          ? 'heavier than the factor'
          : 'lighter than the factor',
    redo: Math.abs(mean) > 0.05,
  };
}
