/**
 * The four ways a deduction is taken.
 *
 * These are not four opinions about the same thing. They answer different
 * questions and they are not interchangeable.
 *
 *   length      the fault runs through everything for some distance, so that
 *               distance is cut out of the log and the rest is rescaled
 *   diameter    the fault is in the shell, so the log is rescaled as if it
 *               were the smaller sound log inside
 *   squared     the fault occupies a definite block of wood, so that block is
 *               squared out and converted straight to board feet
 *   percentage  the fault is spread through the log and nobody can point at
 *               where, so a share of the gross comes off
 *
 * Every one of them takes the rule as an argument, because a deduction is not
 * a volume until a rule has turned it into one. Cutting two feet off a log
 * costs a different number of board feet under Doyle than under International,
 * and the difference is not proportional.
 */

import { ScaleError } from '../../errors.js';
import { getRule } from '../rules/index.js';

/** The divisor in the squared defect formula, which already allows for slab. */
export const SQUARED_DIVISOR = 15;

/**
 * Length deduction. `affectedFt` is cut out of the scaling length and the log
 * is rescaled at the same diameter over what is left.
 */
export function lengthDeduction(ruleId, diameterIn, lengthFt, affectedFt) {
  const rule = getRule(ruleId);
  requireNonNegative('affectedFt', affectedFt);
  const whole = Math.ceil(affectedFt - 1e-9);
  const remaining = Math.max(0, lengthFt - whole);
  const before = rule.gross(diameterIn, lengthFt);
  const after = rule.gross(diameterIn, remaining);
  return {
    method: 'length',
    grossBoardFeet: round3(before),
    netBoardFeet: round3(after),
    deductionBoardFeet: round3(before - after),
    detail: { affectedFt: whole, remainingLengthFt: round3(remaining) },
  };
}

/**
 * Diameter deduction. `shellIn` is the depth of unsound shell on one side; it
 * comes off both sides of the diameter, because a log rotten on one side is
 * not sawn from the other.
 */
export function diameterDeduction(ruleId, diameterIn, lengthFt, shellIn) {
  const rule = getRule(ruleId);
  requireNonNegative('shellIn', shellIn);
  const soundDiameter = Math.max(0, Math.floor(diameterIn - 2 * shellIn));
  const before = rule.gross(diameterIn, lengthFt);
  const after = rule.gross(soundDiameter, lengthFt);
  return {
    method: 'diameter',
    grossBoardFeet: round3(before),
    netBoardFeet: round3(after),
    deductionBoardFeet: round3(before - after),
    detail: { shellIn, soundDiameterIn: soundDiameter },
  };
}

/**
 * Squared defect. The block of spoiled wood is measured across the log, into
 * the log and along the log, and converted to board feet directly. The result
 * never depends on the rule, which is exactly why a squared deduction under
 * Doyle can wipe out more of the scale than the same block under International.
 */
export function squaredDeduction(ruleId, diameterIn, lengthFt, defect) {
  const rule = getRule(ruleId);
  const widthIn = requireNonNegative('widthIn', defect.widthIn ?? 0);
  const depthIn = requireNonNegative('depthIn', defect.depthIn ?? 0);
  const runFt = requireNonNegative('lengthFt', defect.lengthFt ?? 0);
  const before = rule.gross(diameterIn, lengthFt);
  const raw = (widthIn * depthIn * runFt) / SQUARED_DIVISOR;
  const deduction = Math.min(raw, before);
  return {
    method: 'squared',
    grossBoardFeet: round3(before),
    netBoardFeet: round3(before - deduction),
    deductionBoardFeet: round3(deduction),
    detail: { widthIn, depthIn, runFt, uncapped: round3(raw), capped: raw > before },
  };
}

/** Percentage cull. `share` is a fraction between zero and one. */
export function percentageDeduction(ruleId, diameterIn, lengthFt, share) {
  const rule = getRule(ruleId);
  requireNonNegative('share', share);
  if (share > 1) {
    throw new ScaleError(`cull share must not exceed one, got ${share}`, { path: 'share' });
  }
  const before = rule.gross(diameterIn, lengthFt);
  const deduction = before * share;
  return {
    method: 'percentage',
    grossBoardFeet: round3(before),
    netBoardFeet: round3(before - deduction),
    deductionBoardFeet: round3(deduction),
    detail: { share },
  };
}

/** The four methods by name, for the policy layer to dispatch on. */
export const METHODS = {
  length: lengthDeduction,
  diameter: diameterDeduction,
  squared: squaredDeduction,
  percentage: percentageDeduction,
};

function requireNonNegative(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ScaleError(`${name} must be a finite number`, { path: name });
  }
  if (value < 0) {
    throw new ScaleError(`${name} must not be negative, got ${value}`, { path: name });
  }
  return value;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
