/**
 * The log rule register.
 *
 * A rule is not just a volume function. It also carries the policy that the
 * rest of the scale hangs off: which deduction method a defect is worked out
 * under, whether the log is scaled whole or in segments, and what the ticket
 * rounds to. Those three are what make the same log come out at three
 * different net volumes under three different contracts, and they are the
 * reason the deduction code cannot be written without knowing the rule first.
 */

import { round4 } from '../../num.js';

import { ContractError } from '../../errors.js';
import * as doyle from './doyle.js';
import * as international from './international.js';
import * as scribner from './scribner.js';

const MODULES = [doyle, international, scribner];

const REGISTER = new Map(MODULES.map((module) => [module.id, module]));

/** Every rule id the yard can scale under, sorted. */
export function ruleIds() {
  return [...REGISTER.keys()].sort();
}

/** The rule module, or a contract error naming what is available. */
export function getRule(ruleId) {
  if (typeof ruleId !== 'string') {
    throw new ContractError(`rule must be named, got ${typeof ruleId}`, { path: 'rule' });
  }
  const key = ruleId.trim().toLowerCase();
  const rule = REGISTER.get(key);
  if (!rule) {
    throw new ContractError(`unknown log rule ${key}, we scale ${ruleIds().join(', ')}`, {
      path: 'rule',
      hint: `buckline rules --rule ${ruleIds()[0]}`,
    });
  }
  return rule;
}

/** The policy fields the deduction and segmentation code reads. */
export function rulePolicy(ruleId) {
  const rule = getRule(ruleId);
  return {
    id: rule.id,
    label: rule.label,
    deductionMethod: rule.deductionMethod,
    segmentFt: rule.segmentFt,
    roundsTo: rule.roundsTo,
    smallestDiameterIn: rule.smallestDiameterIn,
  };
}

/** Gross board feet under a named rule, rounded the way the rule rounds. */
export function scaleUnder(ruleId, diameterIn, lengthFt) {
  return getRule(ruleId).scale(diameterIn, lengthFt);
}

/** Gross board feet under a named rule, unrounded. */
export function grossUnder(ruleId, diameterIn, lengthFt) {
  return getRule(ruleId).gross(diameterIn, lengthFt);
}

/**
 * The same log under every rule, for the recovery study and for arguing with a
 * buyer. International is the reference because it is the only one derived
 * from the geometry, so the ratio against it says how hard a rule is on that
 * size of log.
 */
export function compareRules(diameterIn, lengthFt) {
  const reference = international.gross(diameterIn, lengthFt);
  return ruleIds().map((ruleId) => {
    const rule = getRule(ruleId);
    const boardFeet = rule.scale(diameterIn, lengthFt);
    return {
      rule: ruleId,
      boardFeet,
      ratioToInternational: reference > 0 ? round4(boardFeet / reference) : null,
    };
  });
}

/**
 * The diameter at which a rule stops shorting the seller against
 * International, searched over the whole diameters the yard handles. Doyle
 * crosses over somewhere in the high twenties, which is exactly why a buyer
 * writing a Doyle contract wants small logs.
 */
export function crossoverDiameter(ruleId, lengthFt, options = {}) {
  const { from = 6, to = 40 } = options;
  const rule = getRule(ruleId);
  for (let d = from; d <= to; d += 1) {
    const reference = international.gross(d, lengthFt);
    if (reference > 0 && rule.gross(d, lengthFt) >= reference) {
      return d;
    }
  }
  return null;
}
