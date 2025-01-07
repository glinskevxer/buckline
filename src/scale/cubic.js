/**
 * Cubic scaling.
 *
 * Every log rule in this program answers "how much lumber will this saw",
 * which is a manufacturing question dressed up as a measurement. Cubic scaling
 * answers "how much wood is there", which is the measurement, and the two are
 * not the same thing at all. A cubic scale does not change when the mill
 * changes its saw kerf and a board foot rule does.
 *
 * Cubic is not in the rule register, and that is deliberate. Every rule there
 * takes a small end diameter and a length; a cubic scale needs both ends,
 * because the whole point of it is that it does not assume a taper. Putting it
 * behind the same interface would mean assuming one, which is the thing it
 * exists not to do.
 *
 * Two formulas are in use and they disagree. Smalian averages the two end
 * areas and overstates a tapered log, because the average of two areas is
 * bigger than the area at the average diameter. Huber measures the middle and
 * is closer but needs a tape halfway along a log lying in a pile, which is why
 * it is rarer.
 */

import { round2, round4 } from '../num.js';
import { CUBIC_INCHES_PER_BOARD_FOOT } from '../units.js';
import { ScaleError } from '../errors.js';

/** Cross sectional area in square feet from a diameter in inches. */
export function areaSqFt(diameterIn) {
  requirePositive('diameterIn', diameterIn);
  const radiusFt = diameterIn / 24;
  return Math.PI * radiusFt * radiusFt;
}

/** Smalian: the average of the two end areas times the length. */
export function smalian(smallEndIn, largeEndIn, lengthFt) {
  requirePositive('lengthFt', lengthFt);
  if (largeEndIn + 1e-9 < smallEndIn) {
    throw new ScaleError('the large end cannot be smaller than the small end', {
      path: 'largeEndIn',
    });
  }
  return round4(((areaSqFt(smallEndIn) + areaSqFt(largeEndIn)) / 2) * lengthFt);
}

/** Huber: the area at the middle times the length. */
export function huber(midDiameterIn, lengthFt) {
  requirePositive('lengthFt', lengthFt);
  return round4(areaSqFt(midDiameterIn) * lengthFt);
}

/**
 * How much Smalian overstates a log against Huber. It is zero on a cylinder
 * and grows with the square of the taper, which is why it matters on short
 * butt logs and hardly at all on long straight ones.
 */
export function smalianBias(smallEndIn, largeEndIn, lengthFt) {
  const mid = (smallEndIn + largeEndIn) / 2;
  const bySmalian = smalian(smallEndIn, largeEndIn, lengthFt);
  const byHuber = huber(mid, lengthFt);
  return {
    smalian: bySmalian,
    huber: byHuber,
    overstatement: round4(bySmalian - byHuber),
    share: byHuber > 0 ? round4((bySmalian - byHuber) / byHuber) : 0,
  };
}

/**
 * The theoretical maximum board feet in a cubic foot: twelve, and no mill has
 * ever got it. It is here as the reference the conversion is quoted against.
 */
export const BOARD_FEET_PER_CUBIC_FOOT = 12;

/**
 * Converts a cubic scale to board feet at a stated recovery. The recovery is
 * the mill's own measured figure and there is no default, because a default
 * here would be a manufacturing assumption smuggled into a measurement.
 */
export function cubicToBoardFeet(cubicFeet, boardFeetPerCubicFoot) {
  if (!(boardFeetPerCubicFoot > 0)) {
    throw new ScaleError('a cubic conversion needs a measured recovery', {
      path: 'boardFeetPerCubicFoot',
    });
  }
  if (boardFeetPerCubicFoot > BOARD_FEET_PER_CUBIC_FOOT) {
    throw new ScaleError(
      `no mill gets more than ${BOARD_FEET_PER_CUBIC_FOOT} board feet out of a cubic foot`,
      { path: 'boardFeetPerCubicFoot' }
    );
  }
  return round2(cubicFeet * boardFeetPerCubicFoot);
}

/**
 * The recovery a mill actually got, from a cubic scale and a tally. This is
 * the honest version of overrun: it has no rule in it, so it cannot be moved
 * by rewriting the contract.
 */
export function measuredRecovery(cubicFeet, boardFeetSawn) {
  if (!(cubicFeet > 0)) {
    throw new ScaleError('recovery needs a cubic scale to divide by', { path: 'cubicFeet' });
  }
  const perCubicFoot = boardFeetSawn / cubicFeet;
  return {
    cubicFeet: round2(cubicFeet),
    boardFeetSawn: round2(boardFeetSawn),
    boardFeetPerCubicFoot: round2(perCubicFoot),
    shareOfTheoretical: round4(perCubicFoot / BOARD_FEET_PER_CUBIC_FOOT),
  };
}

/** Cubic scale for a log record, using its measured taper where it has one. */
export function cubicScale(log, options = {}) {
  const { assumedTaperPerFoot = 0.125 } = options;
  if (!log.merchantable || log.nominalLengthFt <= 0) {
    return { cubicFeet: 0, method: null, reason: 'the stick is under the shortest length class' };
  }
  const smallEnd = log.insideBarkIn;
  const largeEnd = log.largeEndIn ?? round4(smallEnd + assumedTaperPerFoot * log.nominalLengthFt);

  return {
    cubicFeet: smalian(smallEnd, largeEnd, log.nominalLengthFt),
    method: 'smalian',
    smallEndIn: round2(smallEnd),
    largeEndIn: round2(largeEnd),
    taperSource: log.largeEndIn === null || log.largeEndIn === undefined ? 'assumed' : 'measured',
    boardFootEquivalent: null,
    reason: null,
  };
}

function requirePositive(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ScaleError(`${name} must be a positive number`, { path: name });
  }
}

/** Kept so the units module stays the one definition of a board foot. */
export const CUBIC_INCHES_PER_BF = CUBIC_INCHES_PER_BOARD_FOOT;
