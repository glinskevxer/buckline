/**
 * Sample scaling.
 *
 * Scaling every stick on a hundred loads a week costs more than it saves, so
 * some of it is sampled: a share of the logs is scaled properly and the rest
 * is expanded from the sample. The expansion is the easy part. Knowing whether
 * the sample was good enough to expand from is the whole job, and it depends
 * on how much the logs vary rather than on how many were scaled.
 *
 * A deck of one size class expands honestly off a small sample. A deck with
 * eight inch tops and thirty inch butts on the same truck does not expand off
 * any sample at all, and the right answer there is to scale the load.
 */

import { round1, round2, round4 } from '../num.js';
import { ScaleError } from '../errors.js';

/** The confidence bound the yard works to, as a multiple of the standard error. */
export const CONFIDENCE_MULTIPLE = 1.96;

/** The widest sampling error a settlement will accept. */
export const MAX_SAMPLING_ERROR = 0.05;

/** Mean, deviation and standard error of a set of scaled logs. */
export function sampleStatistics(netBoardFeet) {
  if (!Array.isArray(netBoardFeet) || netBoardFeet.length < 2) {
    throw new ScaleError('a sample needs at least two logs', { path: 'sample' });
  }
  const n = netBoardFeet.length;
  const mean = netBoardFeet.reduce((total, value) => total + value, 0) / n;
  const variance = netBoardFeet.reduce((total, value) => total + (value - mean) ** 2, 0) / (n - 1);
  const deviation = Math.sqrt(variance);
  return {
    count: n,
    mean: round2(mean),
    deviation: round2(deviation),
    coefficientOfVariation: mean > 0 ? round4(deviation / mean) : null,
    standardError: round4(deviation / Math.sqrt(n)),
  };
}

/**
 * Expands a sample over a whole deck by piece count. The finite population
 * correction matters here: sampling forty of fifty logs is far tighter than
 * sampling forty of four thousand, and leaving it out overstates the error on
 * exactly the loads a yard samples most.
 */
export function expandByPieces(sample, totalLogs, options = {}) {
  const { multiple = CONFIDENCE_MULTIPLE, maxError = MAX_SAMPLING_ERROR } = options;
  const stats = sampleStatistics(sample);
  if (!(totalLogs >= stats.count)) {
    throw new ScaleError('a deck cannot hold fewer logs than were sampled', { path: 'totalLogs' });
  }

  const correction = Math.sqrt(Math.max(0, (totalLogs - stats.count) / (totalLogs - 1 || 1)));
  const standardError = stats.standardError * correction;
  const total = stats.mean * totalLogs;
  const bound = multiple * standardError * totalLogs;

  return {
    ...stats,
    totalLogs,
    samplingShare: round4(stats.count / totalLogs),
    expandedBoardFeet: round1(total),
    boundBoardFeet: round1(bound),
    relativeError: total > 0 ? round4(bound / total) : null,
    correction: round4(correction),
    acceptable: total > 0 && bound / total <= maxError,
  };
}

/**
 * How many logs would have to be scaled to bring the error inside the limit,
 * given what the sample already says about the spread. Returns the whole deck
 * when no sample will do it, which is the honest answer on a mixed load.
 */
export function requiredSampleSize(sample, totalLogs, options = {}) {
  const { multiple = CONFIDENCE_MULTIPLE, maxError = MAX_SAMPLING_ERROR } = options;
  const stats = sampleStatistics(sample);
  if (!stats.coefficientOfVariation) return totalLogs;

  const cv = stats.coefficientOfVariation;
  const raw = ((multiple * cv) / maxError) ** 2;
  const corrected = raw / (1 + (raw - 1) / totalLogs);
  const needed = Math.ceil(corrected);
  return Math.min(totalLogs, Math.max(2, needed));
}

/**
 * The verdict on a sampled load: expand it, scale more of it, or scale the
 * lot. The third answer is the one that gets argued with and it is the one
 * that saves money, because expanding a mixed load is how a yard buys wood it
 * did not get.
 *
 * Note what settles the third answer. It is not that no sample would work,
 * because the finite population correction means the required size is always
 * a little under the whole deck. It is that once four logs in five have to be
 * scaled anyway, sampling has stopped saving anything and the paperwork of
 * expanding is pure cost.
 */
export function sampleVerdict(sample, totalLogs, options = {}) {
  const expansion = expandByPieces(sample, totalLogs, options);
  if (expansion.acceptable) {
    return {
      verdict: 'expand',
      expansion,
      needed: expansion.count,
      reason: 'the sample is tight enough',
    };
  }
  const { pointlessShare = 0.8 } = options;
  const needed = requiredSampleSize(sample, totalLogs, options);
  if (needed >= totalLogs * pointlessShare) {
    return {
      verdict: 'scale the load',
      expansion,
      needed: totalLogs,
      reason: 'the logs vary too much for a sample to save anything',
    };
  }
  return {
    verdict: 'scale more',
    expansion,
    needed,
    reason: `scale ${needed - expansion.count} more logs`,
  };
}
