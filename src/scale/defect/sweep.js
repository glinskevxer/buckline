/**
 * Sweep and crook.
 *
 * Sweep is a gentle bend along the whole stick. Crook is an abrupt one in a
 * short piece of it. They are measured the same way, with a straightedge
 * against the concave side and a rule at the point of greatest departure, and
 * they are deducted completely differently.
 *
 * A swept log still saws boards. It saws shorter boards, and the loss is a
 * share of the whole log rather than a piece of it, so sweep is a percentage
 * deduction. A crooked log is straight on both sides of the crook, so the
 * crook itself is cut out and the rest is scaled at full length.
 *
 * How much sweep is free before anything comes off is a contract term, not a
 * fact about wood. Two conventions are in use and they disagree by a lot on a
 * small log.
 */

import {
  requireNonNegative as checkNonNegative,
  requirePositive as checkPositive,
  round4,
} from '../../num.js';

import { ScaleError } from '../../errors.js';

/**
 * The allowance conventions.
 *
 * `quarter` forgives departure up to a quarter of the scaling diameter, so a
 * big log is allowed more absolute bend than a small one. `flat` forgives a
 * fixed thirty percent of the departure to diameter ratio regardless of size,
 * which is easier to work in the woods and harder on large logs.
 */
const wrap = (message, path) => new ScaleError(message, { path });

const requireNonNegative = (name, value) => checkNonNegative(name, value, { wrap });
const requirePositive = (name, value) => checkPositive(name, value, { wrap });

export const SWEEP_ALLOWANCES = {
  quarter: {
    id: 'quarter',
    label: 'quarter diameter free',
    freeDepartureIn: (diameterIn) => diameterIn / 4,
    freeRatio: null,
  },
  flat: {
    id: 'flat',
    label: 'thirty percent free',
    freeDepartureIn: null,
    freeRatio: 0.3,
  },
  none: {
    id: 'none',
    label: 'no allowance',
    freeDepartureIn: () => 0,
    freeRatio: null,
  },
};

/**
 * The share of the gross that sweep takes off. `departureIn` is the greatest
 * distance between the straightedge and the log, `sweptLengthFt` is how much
 * of the log the bend runs through.
 */
export function sweepShare(diameterIn, lengthFt, departureIn, options = {}) {
  const { allowance = 'quarter' } = options;
  const rule = SWEEP_ALLOWANCES[allowance];
  if (!rule) {
    throw new ScaleError(`unknown sweep allowance ${allowance}`, { path: 'allowance' });
  }
  requirePositive('diameterIn', diameterIn);
  requirePositive('lengthFt', lengthFt);
  requireNonNegative('departureIn', departureIn);

  const sweptLengthFt = options.sweptLengthFt ?? lengthFt;
  requireNonNegative('sweptLengthFt', sweptLengthFt);
  if (sweptLengthFt > lengthFt + 1e-9) {
    throw new ScaleError(
      `swept length ${sweptLengthFt} runs past a ${lengthFt} foot log`,
      { path: 'sweptLengthFt' }
    );
  }

  const ratio = departureIn / diameterIn;
  const chargeableRatio =
    rule.freeRatio === null
      ? Math.max(0, (departureIn - rule.freeDepartureIn(diameterIn)) / diameterIn)
      : Math.max(0, ratio - rule.freeRatio);

  const share = chargeableRatio * (sweptLengthFt / lengthFt);
  return {
    allowance: rule.id,
    departureIn,
    departureRatio: round4(ratio),
    chargeableRatio: round4(chargeableRatio),
    sweptFraction: round4(sweptLengthFt / lengthFt),
    share: round4(Math.min(1, share)),
  };
}

/** True when the bend is gentle enough that nothing comes off. */
export function sweepIsFree(diameterIn, lengthFt, departureIn, options = {}) {
  return sweepShare(diameterIn, lengthFt, departureIn, options).share === 0;
}

/**
 * How much length a crook costs. A crook is cut out along with the wood either
 * side of it that cannot make a straight board, which is taken as the offset
 * itself expressed in feet of run at the log's taper. Below a half inch the
 * mill does not notice, so nothing comes off.
 */
export function crookLengthFt(departureIn, options = {}) {
  const { minimumIn = 0.5, runPerInchFt = 1 } = options;
  requireNonNegative('departureIn', departureIn);
  if (departureIn < minimumIn) return 0;
  return Math.ceil(departureIn * runPerInchFt);
}

/**
 * Sweep and crook are not additive. A log that has both is deducted on
 * whichever costs more, because the same wood is being taken twice otherwise.
 * The caller passes both already converted to board feet.
 */
export function worseOf(sweepBoardFeet, crookBoardFeet) {
  requireNonNegative('sweepBoardFeet', sweepBoardFeet);
  requireNonNegative('crookBoardFeet', crookBoardFeet);
  return sweepBoardFeet >= crookBoardFeet
    ? { taken: 'sweep', boardFeet: sweepBoardFeet }
    : { taken: 'crook', boardFeet: crookBoardFeet };
}
