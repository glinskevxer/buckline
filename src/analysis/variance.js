/**
 * Why the month came in different from the plan.
 *
 * A mill plans to cut so many thousand at such a mix at such a price and comes
 * in somewhere else. The total difference is easy and useless. Four things
 * moved and they have four different owners:
 *
 *   volume   more or less wood than planned, at the planned mix and price
 *   mix      the same volume in a different set of grades
 *   price    the same volume and mix at a different price
 *   rate     what the wood cost to buy, which is the woods buyer's number
 *
 * They are worked out in that order and each one is measured with everything
 * after it held at plan. That order is a convention and it matters: a
 * different order gives different numbers for the same month, and two people
 * using different orders will disagree forever. Volume first, then mix, then
 * price is the one the trade uses.
 */

import { round2, round4, sum } from '../num.js';
import { BucklineError } from '../errors.js';

export class VarianceError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'VARIANCE', ...options });
    this.name = 'VarianceError';
  }
}

/** Total volume across a set of grade lines. */
function volumeOf(lines) {
  return sum(
    lines.map((line) => line.mbf),
    4
  );
}

/** The mix as a share per grade. */
export function mixOf(lines) {
  const total = volumeOf(lines);
  if (total === 0) return new Map();
  return new Map(lines.map((line) => [line.grade, line.mbf / total]));
}

/** Prices per thousand, by grade. */
function priceOf(lines) {
  return new Map(lines.map((line) => [line.grade, line.perMbf]));
}

/** Revenue from a volume, a mix and a set of prices. */
function revenue(volume, mix, prices) {
  let total = 0;
  for (const [grade, share] of mix.entries()) {
    total += volume * share * (prices.get(grade) ?? 0);
  }
  return total;
}

/**
 * Splits the difference between a plan and an actual into its four parts.
 *
 * Each line is `{ grade, mbf, perMbf }`, and the cost lines are optional: a
 * mill that does not know what its wood cost gets three parts and is told so
 * rather than being given a rate variance of zero.
 */
export function decompose(plan, actual, options = {}) {
  const { planCost = null, actualCost = null } = options;
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new VarianceError('a variance needs a plan', { path: 'plan' });
  }
  if (!Array.isArray(actual) || actual.length === 0) {
    throw new VarianceError('a variance needs an actual', { path: 'actual' });
  }

  const planVolume = volumeOf(plan);
  const actualVolume = volumeOf(actual);
  const planMix = mixOf(plan);
  const actualMix = mixOf(actual);
  const planPrice = priceOf(plan);
  const actualPrice = priceOf(actual);

  const atPlan = revenue(planVolume, planMix, planPrice);
  const afterVolume = revenue(actualVolume, planMix, planPrice);
  const afterMix = revenue(actualVolume, actualMix, planPrice);
  const afterPrice = revenue(actualVolume, actualMix, actualPrice);

  const parts = [
    { part: 'volume', amount: round2(afterVolume - atPlan), owner: 'the woods' },
    { part: 'mix', amount: round2(afterMix - afterVolume), owner: 'the log deck' },
    { part: 'price', amount: round2(afterPrice - afterMix), owner: 'the market' },
  ];

  let rate = null;
  if (planCost !== null && actualCost !== null) {
    rate = round2(-(actualCost - planCost));
    parts.push({ part: 'rate', amount: rate, owner: 'the woods buyer' });
  }

  return {
    planRevenue: round2(atPlan),
    actualRevenue: round2(afterPrice),
    difference: round2(afterPrice - atPlan),
    parts,
    rateKnown: rate !== null,
    unexplained: round2(
      afterPrice - atPlan - parts.filter((p) => p.part !== 'rate').reduce((t, p) => t + p.amount, 0)
    ),
    planVolume: round4(planVolume),
    actualVolume: round4(actualVolume),
  };
}

/** The parts ordered by how much they moved, biggest first. */
export function biggestMovers(result) {
  return [...result.parts].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/**
 * How much of the difference each part explains, as a share. Reported against
 * the sum of the absolute moves rather than the net, because two parts that
 * cancel each other out are both worth knowing about and a net of nothing
 * would say neither happened.
 */
export function shares(result) {
  const gross = result.parts.reduce((total, part) => total + Math.abs(part.amount), 0);
  return result.parts.map((part) => ({
    ...part,
    share: gross > 0 ? round4(Math.abs(part.amount) / gross) : 0,
  }));
}

/** A one line summary for a covering note. */
export function summarise(result) {
  const biggest = biggestMovers(result)[0];
  if (!biggest || biggest.amount === 0) {
    return 'the month came in on plan';
  }
  const direction = result.difference >= 0 ? 'over' : 'under';
  return `${direction} plan, mostly on ${biggest.part}, which is ${biggest.owner}`;
}
