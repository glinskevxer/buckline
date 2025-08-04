/**
 * What is left in a sale.
 *
 * A tract is cruised before it is bought and the cruise says how much is
 * standing. Loads come off it and at some point somebody asks how much is
 * left, and the honest answer needs both numbers: what the cruise said and
 * what has actually come out.
 *
 * The two disagree, always. A cruise is a sample and a scale is a census, and
 * the ratio between them is the cruise error, which is worth knowing on its
 * own because it says whether the next tract from the same cruiser can be
 * trusted.
 *
 * Nothing here extrapolates a trend. A sale that has been running three weeks
 * has three weeks of weather in it and a forecast off that is a forecast of
 * the weather. What it does is scale the remaining cruise volume by what the
 * sale has been running at, which is a ratio and not a trend.
 */

import { round1, round2, round4, sum } from '../num.js';
import { BucklineError } from '../errors.js';

export class ForecastError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'FORECAST', ...options });
    this.name = 'ForecastError';
  }
}

/** How far through the cruise volume the sale has cut. */
export function progress(cruiseMbf, cutMbf) {
  if (!(cruiseMbf > 0)) {
    throw new ForecastError('a forecast needs a cruise to measure against', { path: 'cruiseMbf' });
  }
  if (cutMbf < 0) {
    throw new ForecastError('a sale cannot have cut a negative volume', { path: 'cutMbf' });
  }
  return {
    cruiseMbf: round2(cruiseMbf),
    cutMbf: round2(cutMbf),
    share: round4(cutMbf / cruiseMbf),
    remainingMbf: round2(Math.max(0, cruiseMbf - cutMbf)),
    overcut: cutMbf > cruiseMbf,
  };
}

/**
 * The cruise error, from a part of the sale that is finished. It is only
 * meaningful on a block that has been completely cut, so the caller has to say
 * so rather than the program guessing from a share that looks close enough.
 */
export function cruiseError(cruisedMbf, scaledMbf, options = {}) {
  const { blockFinished = false } = options;
  if (!blockFinished) {
    return {
      known: false,
      reason: 'the cruise error can only be read off a block that is finished',
    };
  }
  if (!(cruisedMbf > 0)) {
    throw new ForecastError('a cruise error needs a cruise volume', { path: 'cruisedMbf' });
  }
  const ratio = scaledMbf / cruisedMbf;
  return {
    known: true,
    cruisedMbf: round2(cruisedMbf),
    scaledMbf: round2(scaledMbf),
    ratio: round4(ratio),
    direction: ratio > 1.02 ? 'cruise was light' : ratio < 0.98 ? 'cruise was heavy' : 'close',
    errorShare: round4(ratio - 1),
  };
}

/**
 * What is left, scaled by the cruise error where one is known. Without one the
 * remaining volume is the cruise remainder and the forecast says so rather
 * than quietly assuming the cruise was right.
 */
export function remaining(cruiseMbf, loads, options = {}) {
  const cut = sum(
    loads.map((load) => load.netMbf ?? 0),
    2
  );
  const state = progress(cruiseMbf, cut);
  const error = options.cruiseError ?? { known: false };

  const adjusted = error.known ? round2(state.remainingMbf * error.ratio) : state.remainingMbf;

  return {
    ...state,
    loads: loads.length,
    adjustedRemainingMbf: adjusted,
    adjustedBy: error.known ? error.ratio : null,
    basis: error.known ? 'cruise adjusted by a finished block' : 'cruise as written',
  };
}

/**
 * What the rest of the sale should pay, at the rate it has been paying. This
 * is a ratio applied to a volume, not a projection of a trend, and the field
 * that says so is on the result.
 */
export function valueRemaining(cruiseMbf, loads, options = {}) {
  const left = remaining(cruiseMbf, loads, options);
  const paid = sum(
    loads.map((load) => load.landownerNet ?? 0),
    2
  );
  if (left.cutMbf <= 0) {
    return { ...left, paidSoFar: 0, perMbf: null, expected: null, basis: 'nothing cut yet' };
  }
  const perMbf = paid / left.cutMbf;
  return {
    ...left,
    paidSoFar: round2(paid),
    perMbf: round2(perMbf),
    expected: round2(left.adjustedRemainingMbf * perMbf),
    basis: `${left.basis}, at the ${round2(perMbf)} a thousand this sale has paid`,
  };
}

/**
 * How many more loads there are, at the size this sale has been running. A
 * whole number, rounded up, because a part load still needs a truck.
 */
export function loadsRemaining(cruiseMbf, loads, options = {}) {
  const left = remaining(cruiseMbf, loads, options);
  if (loads.length === 0) {
    return { loadsLeft: null, averageLoadMbf: null, reason: 'no loads to average' };
  }
  const average = left.cutMbf / loads.length;
  if (average <= 0) {
    return { loadsLeft: null, averageLoadMbf: 0, reason: 'the loads so far carried nothing' };
  }
  return {
    loadsLeft: Math.ceil(left.adjustedRemainingMbf / average),
    averageLoadMbf: round1(average),
    reason: null,
  };
}
