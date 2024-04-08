/**
 * Scaling length.
 *
 * A log is bucked longer than it is sold. The extra is trim allowance, and it
 * exists because the ends split, the saw needs somewhere to start, and nobody
 * can hit a mark to the inch with a chainsaw in the woods. Trim is not paid
 * for. Anything beyond trim is usually not paid for either, because the scale
 * drops back to the last whole nominal length rather than crediting the woods
 * crew for a bad cut.
 */

import { round3 } from '../num.js';

/** Nominal lengths a hardwood mill will take, shortest first. */
export const HARDWOOD_NOMINAL_LENGTHS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

/** Softwood yards buy on even lengths only. */
export const SOFTWOOD_NOMINAL_LENGTHS = [8, 10, 12, 14, 16, 18, 20];

/**
 * Trim policies. The allowance is in inches and it is the amount a log may run
 * over nominal before the scaler moves it up a length class.
 */
export const TRIM_POLICIES = {
  /** Eastern hardwood: four inches on anything, six on a sixteen footer. */
  hardwood: {
    id: 'hardwood',
    label: 'hardwood four inch trim',
    lengths: HARDWOOD_NOMINAL_LENGTHS,
    allowanceIn: (nominal) => (nominal >= 16 ? 6 : 4),
  },
  /** Softwood: eight inches, and even lengths only. */
  softwood: {
    id: 'softwood',
    label: 'softwood eight inch trim',
    lengths: SOFTWOOD_NOMINAL_LENGTHS,
    allowanceIn: () => 8,
  },
  /** Export and tie contracts want the stick dead on with three inches of grace. */
  tight: {
    id: 'tight',
    label: 'three inch trim',
    lengths: HARDWOOD_NOMINAL_LENGTHS,
    allowanceIn: () => 3,
  },
};

const INCHES_PER_FOOT = 12;

/**
 * Turns a measured length into the nominal length that will be scaled.
 *
 * The measured length has to reach the nominal length plus nothing, and it may
 * run over by up to the trim allowance. A stick that is short of nominal drops
 * to the next shorter class even if it is short by an inch, which is why a
 * woods crew cuts long.
 */
export function scalingLength(measuredFt, options = {}) {
  const { policy = 'hardwood' } = options;
  const rule = TRIM_POLICIES[policy];
  if (!rule) {
    throw new RangeError(`unknown trim policy ${policy}`);
  }
  if (typeof measuredFt !== 'number' || !Number.isFinite(measuredFt)) {
    throw new TypeError('measuredFt must be a finite number');
  }
  if (measuredFt <= 0) {
    throw new RangeError(`measuredFt must be greater than zero, got ${measuredFt}`);
  }

  const measuredIn = measuredFt * INCHES_PER_FOOT;
  const shortest = rule.lengths[0];
  if (measuredIn + 1e-9 < shortest * INCHES_PER_FOOT) {
    return {
      nominalFt: 0,
      trimIn: 0,
      overlengthIn: 0,
      merchantable: false,
      policy: rule.id,
    };
  }

  let chosen = shortest;
  for (const nominal of rule.lengths) {
    if (measuredIn + 1e-9 >= nominal * INCHES_PER_FOOT) {
      chosen = nominal;
    }
  }

  const overIn = measuredIn - chosen * INCHES_PER_FOOT;
  const allowance = rule.allowanceIn(chosen);
  const trimIn = Math.min(overIn, allowance);
  const overlengthIn = Math.max(0, overIn - allowance);

  return {
    nominalFt: chosen,
    trimIn: round3(trimIn),
    overlengthIn: round3(overlengthIn),
    merchantable: true,
    policy: rule.id,
  };
}

/**
 * True when the log carries enough trim to be sawn at its nominal length. A
 * stick with no trim at all is a problem at the mill even though it scales.
 */
export function hasWorkableTrim(measuredFt, options = {}) {
  const result = scalingLength(measuredFt, options);
  if (!result.merchantable) return false;
  return result.trimIn >= 2;
}

/** Every nominal length a policy will pay for, shortest first. */
export function nominalLengths(policy = 'hardwood') {
  const rule = TRIM_POLICIES[policy];
  if (!rule) {
    throw new RangeError(`unknown trim policy ${policy}`);
  }
  return rule.lengths.slice();
}
