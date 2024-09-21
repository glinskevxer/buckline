/**
 * Reconciling what came in against what came out.
 *
 * The log yard says a load scaled four thousand eight hundred board feet. The
 * green chain says the same wood tallied five thousand two hundred. Neither
 * number is wrong and neither is a measurement of the other: the first is a
 * rule applied to a cylinder and the second is a count of rectangles.
 *
 * What this report does is put the difference in one of four buckets, because
 * each one is somebody else's problem:
 *
 *   rule        the log rule was never going to predict the tally, and this
 *               part of the gap is arithmetic rather than performance
 *   scaling     the scaler measured differently from the check scale
 *   sawing      the mill got more or less out of the log than the geometry
 *               says it should have
 *   unaccounted what is left, which is the only number worth a meeting
 *
 * Splitting them apart needs the International scale as a reference, because
 * it is the only rule built to predict a tally. Without one the whole
 * difference lands in the last bucket and the report says so rather than
 * guessing.
 */

import { round2, round4, sum } from '../num.js';
import { grossScale } from '../scale/gross.js';
import { BucklineError } from '../errors.js';

export class ReconcileError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'RECONCILE', ...options });
    this.name = 'ReconcileError';
  }
}

/** The reference scale a tally should be compared against. */
export function referenceScale(logs, options = {}) {
  if (!Array.isArray(logs) || logs.length === 0) {
    throw new ReconcileError('reconciliation needs the logs', { path: 'logs' });
  }
  return sum(
    logs.map((log) => grossScale(log, 'international', options).boardFeet),
    1
  );
}

/**
 * Splits the gap between a contract scale and a mill tally.
 *
 * `contractNetBoardFeet` is what the load was bought on. `tallyBoardFeet` is
 * what the green chain counted. `checkNetBoardFeet` is an independent rescale
 * under the same contract rule, and it is what separates a scaling difference
 * from a sawing one. Without it the two are reported together and named.
 */
export function reconcile(input) {
  const {
    logs,
    contractRule,
    contractNetBoardFeet,
    tallyBoardFeet,
    checkNetBoardFeet = null,
    options = {},
  } = input;

  if (!(contractNetBoardFeet >= 0) || !(tallyBoardFeet >= 0)) {
    throw new ReconcileError('reconciliation needs a scale and a tally', { path: 'input' });
  }

  const reference = referenceScale(logs, options);
  const gap = round2(tallyBoardFeet - contractNetBoardFeet);

  const rulePart = round2(reference - contractNetBoardFeet);
  const scalingPart =
    checkNetBoardFeet === null ? 0 : round2(checkNetBoardFeet - contractNetBoardFeet);
  const sawingPart = round2(tallyBoardFeet - reference);
  const unaccounted = round2(gap - rulePart - scalingPart - sawingPart);

  return {
    contractRule,
    contractNetBoardFeet: round2(contractNetBoardFeet),
    referenceBoardFeet: reference,
    tallyBoardFeet: round2(tallyBoardFeet),
    checkNetBoardFeet,
    gapBoardFeet: gap,
    gapShare: contractNetBoardFeet > 0 ? round4(gap / contractNetBoardFeet) : 0,
    buckets: [
      { name: 'rule', boardFeet: rulePart, whose: 'the contract' },
      {
        name: 'scaling',
        boardFeet: scalingPart,
        whose: checkNetBoardFeet === null ? 'not separated, no check scale' : 'the scaler',
      },
      { name: 'sawing', boardFeet: sawingPart, whose: 'the mill' },
      { name: 'unaccounted', boardFeet: unaccounted, whose: 'nobody yet' },
    ],
    separated: checkNetBoardFeet !== null,
  };
}

/**
 * True when the gap is inside what a reasonable week looks like. Anything
 * outside gets a meeting; anything inside gets filed.
 */
export function withinNormal(result, options = {}) {
  const { share = 0.08 } = options;
  return Math.abs(result.gapShare) <= share;
}

/** Reconciles several loads and reports the running picture. */
export function reconcileSeries(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ReconcileError('a series needs at least one load', { path: 'entries' });
  }
  const results = entries.map((entry) => reconcile({ ...entry, options }));
  const shares = results.map((result) => result.gapShare);
  const mean = shares.reduce((total, value) => total + value, 0) / shares.length;

  return {
    loads: results.length,
    results,
    meanGapShare: round4(mean),
    worst: results.reduce((worst, result) =>
      Math.abs(result.gapShare) > Math.abs(worst.gapShare) ? result : worst
    ),
    consistent: Math.max(...shares) - Math.min(...shares) <= 0.06,
  };
}
