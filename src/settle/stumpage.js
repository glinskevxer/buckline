/**
 * Stumpage.
 *
 * What the landowner is paid for the standing timber. It is quoted per
 * thousand board feet against a species and a grade, and on any sale worth
 * writing a contract for it is not a flat number.
 *
 * Three clauses turn up again and again and they interact:
 *
 *   a sliding scale ties the rate to a published market index, but only above
 *   a trigger, so a falling market costs the landowner nothing and a rising
 *   one is shared
 *
 *   a minimum volume clause says the sale pays for a stated volume whether it
 *   is cut or not, which is what stops a buyer taking the two best acres and
 *   walking away
 *
 *   an advance is money paid up front and recouped out of each settlement, at
 *   a stated share, and it can never pull a settlement below zero
 *
 * The order matters. The sliding scale moves the rate, the rate produces the
 * gross, the minimum volume applies to the sale as a whole rather than to a
 * load, and the advance comes off last. Applying the advance before the
 * minimum, which is the obvious way round, produces a settlement that
 * disagrees with the contract on any sale that ends short.
 */

import { BucklineError } from '../errors.js';
import { round2, round4 } from '../num.js';
import { normalizeSpecies } from '../model/species.js';

export class SettleError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'SETTLE', ...options });
    this.name = 'SettleError';
  }
}

/** Builds a stumpage agreement and checks its clauses do not contradict. */
export function makeAgreement(spec) {
  const {
    id,
    tractId,
    landowner,
    rates = [],
    slidingScale = null,
    minimumVolumeMbf = 0,
    advance = 0,
    advanceRecoveryShare = 0.25,
  } = spec;

  if (!id || !tractId) {
    throw new SettleError('an agreement needs an identifier and a tract', { path: 'id' });
  }
  if (rates.length === 0) {
    throw new SettleError('an agreement needs at least one rate', { path: 'rates' });
  }
  if (advance < 0) {
    throw new SettleError('an advance cannot be negative', { path: 'advance' });
  }
  if (advanceRecoveryShare < 0 || advanceRecoveryShare > 1) {
    throw new SettleError('advance recovery must be a share between nothing and everything', {
      path: 'advanceRecoveryShare',
    });
  }
  if (advance > 0 && advanceRecoveryShare === 0) {
    throw new SettleError('an advance that is never recovered is not an advance', {
      path: 'advanceRecoveryShare',
    });
  }
  if (slidingScale) {
    if (!(slidingScale.baseIndex > 0)) {
      throw new SettleError('a sliding scale needs a base index', { path: 'slidingScale' });
    }
    if (slidingScale.share < 0 || slidingScale.share > 1) {
      throw new SettleError('a sliding scale share must be between nothing and everything', {
        path: 'slidingScale.share',
      });
    }
  }

  const table = new Map();
  for (const rate of rates) {
    if (!(rate.perMbf > 0)) {
      throw new SettleError(`rate for ${rate.species} ${rate.grade} is not a rate`, {
        path: 'rates',
      });
    }
    table.set(`${normalizeSpecies(rate.species)}|${rate.grade ?? 'any'}`, rate.perMbf);
  }

  return {
    id,
    tractId,
    landowner,
    table,
    slidingScale,
    minimumVolumeMbf,
    advance,
    advanceRecoveryShare,
  };
}

/**
 * The rate for a species and grade, before any sliding scale. Falls back to a
 * species rate quoted for any grade, and never across species.
 */
export function baseRate(agreement, species, grade) {
  const key = normalizeSpecies(species);
  const exact = agreement.table.get(`${key}|${grade}`);
  if (exact !== undefined) return { perMbf: exact, route: 'quoted for this grade' };
  const anyGrade = agreement.table.get(`${key}|any`);
  if (anyGrade !== undefined) return { perMbf: anyGrade, route: 'quoted for any grade' };
  throw new SettleError(`no stumpage rate for ${key} at ${grade}`, { path: 'rate' });
}

/**
 * The sliding scale adjustment. A market index above the trigger lifts the
 * rate by the agreed share of the rise. Below the trigger nothing moves, which
 * is not the same as moving by zero: a falling index must never cut the rate.
 */
export function slideRate(agreement, perMbf, marketIndex) {
  const scale = agreement.slidingScale;
  if (!scale) return { perMbf, adjustment: 0, applied: false, reason: 'no sliding scale' };
  if (marketIndex === undefined || marketIndex === null) {
    throw new SettleError('a sliding scale needs a market index to read', { path: 'marketIndex' });
  }
  const trigger = scale.triggerIndex ?? scale.baseIndex;
  if (marketIndex <= trigger) {
    return {
      perMbf,
      adjustment: 0,
      applied: false,
      reason: `index ${marketIndex} is at or under the trigger of ${trigger}`,
    };
  }
  const rise = (marketIndex - scale.baseIndex) / scale.baseIndex;
  const adjustment = round2(perMbf * rise * scale.share);
  return {
    perMbf: round2(perMbf + adjustment),
    adjustment,
    applied: true,
    reason: `index ${marketIndex} is over the trigger of ${trigger}`,
  };
}

/** The rate actually charged for one line of a settlement. */
export function rateFor(agreement, species, grade, marketIndex) {
  const base = baseRate(agreement, species, grade);
  const slid = slideRate(agreement, base.perMbf, marketIndex);
  return {
    species: normalizeSpecies(species),
    grade,
    basePerMbf: base.perMbf,
    perMbf: slid.perMbf,
    adjustment: slid.adjustment,
    slidingApplied: slid.applied,
    route: base.route,
    reason: slid.reason,
  };
}

/** What the minimum volume clause adds, if anything. */
export function minimumVolumeShortfall(agreement, cutMbf) {
  const short = agreement.minimumVolumeMbf - cutMbf;
  if (short <= 0) {
    return { shortfallMbf: 0, applies: false };
  }
  return { shortfallMbf: round4(short), applies: true };
}

/**
 * How much of an advance comes off a settlement. Never more than is
 * outstanding and never more than the settlement itself.
 */
export function advanceRecovery(agreement, grossValue, outstanding) {
  if (outstanding <= 0) return { recovered: 0, remaining: 0 };
  const wanted = grossValue * agreement.advanceRecoveryShare;
  const recovered = round2(Math.min(wanted, outstanding, grossValue));
  return { recovered, remaining: round2(outstanding - recovered) };
}
