/**
 * Which deduction method applies.
 *
 * This is the join, and it is the part people get wrong. The defect does not
 * choose the method and neither does the rule. The defect says how it could be
 * measured, the rule says how it prefers to take deductions, and the answer is
 * whichever of the two survives the other.
 *
 * The order is fixed:
 *
 *   1. a defect the catalogue marks as costing nothing costs nothing, whatever
 *      the rule says
 *   2. a defect that spoils the whole log is a percentage, whatever the rule
 *      says, because there is no piece to point at
 *   3. otherwise the rule's preferred method applies, if the defect can
 *      actually be measured that way
 *   4. if it cannot, the defect's own preference applies
 *
 * Step three is where the same fault in the same log comes off differently on
 * two tickets. A catface under Scribner goes on the diameter because Scribner
 * takes deductions on the diameter. The same catface under Doyle is squared
 * out. Neither scaler is wrong and the numbers will not match.
 */

import { ScaleError } from '../../errors.js';
import { defectType } from './types.js';
import { rulePolicy } from '../rules/index.js';

/**
 * Whether a defect of a given extent can be measured by a given method at all.
 * A shell fault has no depth into the log worth squaring; an interior fault
 * has no diameter to take off without throwing away sound shell.
 */
const MEASURABLE = {
  length: { 'whole log': true, local: true, interior: true, shell: true },
  diameter: { 'whole log': true, local: false, interior: true, shell: true },
  squared: { 'whole log': false, local: true, interior: true, shell: false },
  percentage: { 'whole log': true, local: true, interior: true, shell: true },
};

/**
 * Picks the method for one defect under one rule.
 *
 * `overrides` lets a contract pin a method for a named defect. A pinned method
 * still has to be measurable, and asking for one that is not is a contract
 * error rather than a quiet fallback.
 */
export function methodFor(defectId, ruleId, options = {}) {
  const { overrides = {} } = options;
  const entry = defectType(defectId);
  if (!entry) {
    throw new ScaleError(`no catalogue entry for defect ${defectId}`, { path: 'defect.type' });
  }
  const policy = rulePolicy(ruleId);

  const pinned = Object.prototype.hasOwnProperty.call(overrides, entry.id)
    ? overrides[entry.id]
    : null;
  if (pinned) {
    if (!MEASURABLE[pinned]) {
      throw new ScaleError(`contract pins unknown method ${pinned} for ${entry.id}`, {
        path: 'overrides',
      });
    }
    if (!MEASURABLE[pinned][entry.extent]) {
      throw new ScaleError(
        `contract pins ${pinned} for ${entry.id}, which is ${entry.extent} and cannot be measured that way`,
        { path: 'overrides' }
      );
    }
    return { method: pinned, because: 'contract override', defect: entry.id, rule: policy.id };
  }

  if (entry.prefers === 'none') {
    return {
      method: 'none',
      because: 'catalogue says it costs nothing',
      defect: entry.id,
      rule: policy.id,
    };
  }

  if (entry.extent === 'whole log') {
    return {
      method: 'percentage',
      because: 'the fault spoils the whole log',
      defect: entry.id,
      rule: policy.id,
    };
  }

  if (MEASURABLE[policy.deductionMethod][entry.extent]) {
    return {
      method: policy.deductionMethod,
      because: `${policy.id} takes deductions on the ${policy.deductionMethod}`,
      defect: entry.id,
      rule: policy.id,
    };
  }

  return {
    method: entry.prefers,
    because: `${policy.id} cannot measure a ${entry.extent} fault on the ${policy.deductionMethod}`,
    defect: entry.id,
    rule: policy.id,
  };
}

/** The method for every defect on a log, in the order the scaler wrote them. */
export function methodsFor(defects, ruleId, options = {}) {
  if (!Array.isArray(defects)) {
    throw new ScaleError('methodsFor wants a list of defects', { path: 'defects' });
  }
  return defects.map((defect, index) => {
    try {
      return { index, ...methodFor(defect.type, ruleId, options) };
    } catch (error) {
      throw new ScaleError(error.message, { path: `defects[${index}]`, cause: error });
    }
  });
}

/** True when a defect of that extent could be measured that way at all. */
export function isMeasurable(method, extent) {
  const row = MEASURABLE[method];
  return row ? Boolean(row[extent]) : false;
}

/** Every method name the policy layer can return, apart from none. */
export function methodNames() {
  return Object.keys(MEASURABLE).sort();
}
