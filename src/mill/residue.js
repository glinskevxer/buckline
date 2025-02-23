/**
 * Residue.
 *
 * Half the log leaves the mill as something other than lumber, and on a bad
 * week the residue is what pays the electricity bill. Four streams come off a
 * headrig and they are worth wildly different money:
 *
 *   bark      comes off before anything else and is worth the least, and how
 *             much there is depends on the species rather than on the sawing
 *   sawdust   is the kerf, so it is decided by the saw and the number of cuts
 *             and by nothing else
 *   chips     are slabs and edgings run through a chipper, and they are the
 *             valuable stream because a pulp mill will take them
 *   trim      is short ends, and it is worth less than chips because it has to
 *             be chipped again by somebody
 *
 * The stream nobody accounts for properly is chips, because they are the one
 * that competes with lumber: an edging that could have been a narrow board is
 * worth about eight times more as a board than as chips, and a mill chipping
 * marginal edgings is losing money it cannot see.
 */

import { round2, round4 } from '../num.js';
import { cylinderCubicFeet } from '../units.js';
import { barkFraction } from '../measure/diameter.js';
import { MillError } from './pattern.js';

/** A green ton of residue, by stream, in cubic feet. */
export const CUBIC_FEET_PER_GREEN_TON = {
  bark: 55,
  sawdust: 60,
  chips: 50,
  trim: 50,
};

/** The streams, most valuable first. */
export const STREAMS = ['chips', 'trim', 'sawdust', 'bark'];

/** Bark volume on a log, from the species and the diameter. */
export function barkVolume(log) {
  const outside = log.scalingDiameterIn / (1 - barkFraction(log.species));
  const whole = cylinderCubicFeet(outside, log.nominalLengthFt);
  const wood = cylinderCubicFeet(log.scalingDiameterIn, log.nominalLengthFt);
  return round2(whole - wood);
}

/**
 * Sawdust from a sawing pattern. It is the kerf times the area of every cut,
 * and the area of a cut is the face it passes through, so a wide log makes
 * more sawdust per cut than a narrow one.
 */
export function sawdustVolume(sawResult, options = {}) {
  const { kerfIn = 0.125 } = options;
  if (!Array.isArray(sawResult.boards)) {
    throw new MillError('sawdust needs a sawing result with boards on it', { path: 'sawResult' });
  }
  const cubicInches = sawResult.boards.reduce(
    (total, board) => total + kerfIn * board.widthIn * board.lengthFt * 12,
    0
  );
  return round2(cubicInches / 1728);
}

/**
 * The whole balance for one log. Everything that is not lumber, sawdust or
 * bark is slab and edging, and how much of that becomes chips rather than
 * narrow boards is a decision the edger already made.
 */
export function residueBalance(log, sawResult, options = {}) {
  const { kerfIn = 0.125, trimShare = 0.03 } = options;
  const logVolume = cylinderCubicFeet(log.scalingDiameterIn, log.nominalLengthFt);
  const lumberVolume = round2(sawResult.boardFeet / 12);
  const sawdust = sawdustVolume(sawResult, { kerfIn });
  const bark = barkVolume(log);
  // Trim comes out of the lumber and not out of the log, so it must not be
  // taken off the log volume again when the chips are worked out. Doing that
  // lost a cubic foot a log and the balance did not add back.
  const trim = round2(lumberVolume * trimShare);
  const chips = round2(Math.max(0, logVolume - lumberVolume - sawdust));

  return {
    logId: log.id,
    logCubicFeet: round2(logVolume),
    lumberCubicFeet: round2(lumberVolume - trim),
    streams: { chips, trim, sawdust, bark },
    lumberShare: logVolume > 0 ? round4((lumberVolume - trim) / logVolume) : 0,
  };
}

/** Green tons of each stream. */
export function greenTons(streams) {
  const out = {};
  for (const [name, cubic] of Object.entries(streams)) {
    const perTon = CUBIC_FEET_PER_GREEN_TON[name];
    if (perTon === undefined) {
      throw new MillError(`nobody weighs a stream called ${name}`, { path: 'streams' });
    }
    out[name] = round2(cubic / perTon);
  }
  return out;
}

/** What the residue is worth at a set of prices per green ton. */
export function residueValue(streams, pricePerTon) {
  const tons = greenTons(streams);
  const lines = STREAMS.filter((name) => tons[name] !== undefined).map((name) => ({
    stream: name,
    tons: tons[name],
    perTon: pricePerTon[name] ?? 0,
    value: round2(tons[name] * (pricePerTon[name] ?? 0)),
  }));
  return {
    lines,
    total: round2(lines.reduce((sum, line) => sum + line.value, 0)),
    unpriced: STREAMS.filter((name) => tons[name] !== undefined && pricePerTon[name] === undefined),
  };
}

/**
 * What an edging is worth as a narrow board against what it is worth as chips.
 * This is the number that decides whether the edger should have taken it, and
 * it is nearly always lopsided.
 */
export function chipOrBoard(edging, prices, options = {}) {
  const { thicknessIn = 1 } = options;
  const boardFeet = (thicknessIn * edging.widthIn * edging.lengthFt) / 12;
  const asBoard = round2((boardFeet / 1000) * (prices.lumberPerMbf ?? 0));
  const cubic = boardFeet / 12;
  const asChips = round2((cubic / CUBIC_FEET_PER_GREEN_TON.chips) * (prices.chipsPerTon ?? 0));
  return {
    boardFeet: round2(boardFeet),
    asBoard,
    asChips,
    ratio: asChips > 0 ? round2(asBoard / asChips) : null,
    takeAsBoard: asBoard > asChips,
  };
}
