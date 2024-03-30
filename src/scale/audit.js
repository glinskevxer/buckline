/**
 * Check scaling.
 *
 * Somebody rescales a sample of the load and the two scales are compared. What
 * is being tested is not whether the first scaler got the arithmetic right,
 * which a computer settled years ago, but whether they saw the same defects
 * and made the same judgement calls about them.
 *
 * The comparison is asymmetric on purpose. A check scale that finds more wood
 * than the original is a different problem from one that finds less: the first
 * costs the mill nothing and the seller everything, the second is the mill
 * paying for wood it did not get. Both are reported, and the tolerance is the
 * same, but the direction is always named.
 */

import { ScaleError } from '../errors.js';

/** Tolerances a check scale is judged against. */
export const DEFAULT_TOLERANCE = {
  perLogShare: 0.05,
  loadShare: 0.02,
  minimumSampleShare: 0.1,
  minimumSampleLogs: 5,
};

/**
 * Compares an original ticket against a check scale of some of its logs.
 * `check` is a list of net scale results keyed by the same log ids.
 */
export function checkScale(original, check, options = {}) {
  const tolerance = { ...DEFAULT_TOLERANCE, ...options.tolerance };
  if (!Array.isArray(check) || check.length === 0) {
    throw new ScaleError('a check scale needs at least one log', { path: 'check' });
  }

  const byId = new Map(original.lines.map((line) => [line.logId, line]));
  const comparisons = [];
  const missing = [];

  for (const line of check) {
    const first = byId.get(line.logId);
    if (!first) {
      missing.push(line.logId);
      continue;
    }
    const difference = line.netBoardFeet - first.netBoardFeet;
    const share = first.netBoardFeet === 0 ? (difference === 0 ? 0 : 1) : difference / first.netBoardFeet;
    comparisons.push({
      logId: line.logId,
      originalNet: first.netBoardFeet,
      checkNet: line.netBoardFeet,
      differenceBoardFeet: round1(difference),
      differenceShare: round4(share),
      direction: direction(difference),
      withinTolerance: Math.abs(share) <= tolerance.perLogShare + 1e-9,
    });
  }

  if (missing.length > 0) {
    throw new ScaleError(`check scale names logs not on the ticket: ${missing.join(', ')}`, {
      path: 'check',
      details: { missing },
    });
  }

  const originalTotal = sum(comparisons.map((c) => c.originalNet));
  const checkTotal = sum(comparisons.map((c) => c.checkNet));
  const loadDifference = checkTotal - originalTotal;
  const loadShare = originalTotal === 0 ? 0 : loadDifference / originalTotal;

  const sampleShare = comparisons.length / original.logCount;
  const sampleAdequate =
    comparisons.length >= tolerance.minimumSampleLogs &&
    sampleShare >= tolerance.minimumSampleShare - 1e-9;

  const outside = comparisons.filter((c) => !c.withinTolerance);

  return {
    ticketId: original.ticketId ?? null,
    rule: original.rule,
    sampleSize: comparisons.length,
    sampleShare: round4(sampleShare),
    sampleAdequate,
    comparisons,
    originalNetBoardFeet: originalTotal,
    checkNetBoardFeet: checkTotal,
    differenceBoardFeet: round1(loadDifference),
    differenceShare: round4(loadShare),
    direction: direction(loadDifference),
    loadWithinTolerance: Math.abs(loadShare) <= tolerance.loadShare + 1e-9,
    logsOutsideTolerance: outside.map((c) => c.logId),
    verdict: verdictFor(sampleAdequate, Math.abs(loadShare) <= tolerance.loadShare + 1e-9, outside),
  };
}

/**
 * A check scale that did not sample enough logs cannot fail a scaler however
 * bad it looks, so the verdict says so rather than reporting a pass.
 */
function verdictFor(sampleAdequate, loadWithin, outside) {
  if (!sampleAdequate) return 'inconclusive';
  if (!loadWithin) return 'fail';
  if (outside.length > 0) return 'review';
  return 'pass';
}

/** Drift across several check scales of one scaler, oldest first. */
export function scalerDrift(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new ScaleError('scalerDrift wants a list of check scales', { path: 'checks' });
  }
  const usable = checks.filter((c) => c.verdict !== 'inconclusive');
  if (usable.length === 0) {
    return { samples: 0, meanShare: 0, bias: 'unknown', consistent: false };
  }
  const shares = usable.map((c) => c.differenceShare);
  const mean = shares.reduce((total, share) => total + share, 0) / shares.length;
  const spread = Math.max(...shares) - Math.min(...shares);
  return {
    samples: usable.length,
    meanShare: round4(mean),
    bias: direction(mean),
    consistent: spread <= 0.04,
  };
}

function direction(value) {
  if (Math.abs(value) < 1e-9) return 'level';
  return value > 0 ? 'check found more' : 'check found less';
}

function sum(values) {
  return round1(values.reduce((total, value) => total + value, 0));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
