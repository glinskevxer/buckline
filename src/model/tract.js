/**
 * A tract and the contract that governs it.
 *
 * The contract is where the scaling arguments are settled before anybody
 * measures anything. It names the rule, the sweep allowance, any deduction
 * methods the parties agreed to pin, and the cull line. Everything the scale
 * code takes as an option comes from here, which is the point: a scale is
 * reproducible only if the terms it was computed under are recorded with it
 * rather than defaulted at the time.
 */

import { ContractError } from '../errors.js';
import { getRule } from '../scale/rules/index.js';
import { isMeasurable } from '../scale/defect/policy.js';
import { defectType } from '../scale/defect/types.js';
import { SWEEP_ALLOWANCES } from '../scale/defect/sweep.js';
import { boolean, list, number, object, string, validate } from '../valid/check.js';

const contractSchema = {
  rule: string(),
  sweepAllowance: string({ oneOf: Object.keys(SWEEP_ALLOWANCES), default: 'quarter' }),
  cullShare: number({ min: 0, max: 1, default: 0.5 }),
  minimumNetBoardFeet: number({ min: 0, default: 10 }),
  trimPolicy: string({ oneOf: ['hardwood', 'softwood', 'tight'], default: 'hardwood' }),
  convention: string({ oneOf: ['single', 'average', 'extremes', 'shortest'], default: 'average' }),
  rounding: string({ oneOf: ['down', 'nearest', 'up', 'half'], default: 'down' }),
  overrides: list(object({ defect: string(), method: string() }), { default: () => [] }),
};

const tractSchema = {
  id: string(),
  name: string(),
  owner: string(),
  county: string({ optional: true }),
  acres: number({ min: 0, optional: true }),
  openedOn: string({ optional: true }),
  closedOn: string({ optional: true }),
  clearcut: boolean({ default: false }),
  contract: object(contractSchema),
};

/** Reads a tract record and checks the contract makes sense as a whole. */
export function makeTract(raw) {
  const checked = validate(raw, tractSchema, { label: 'tract' });
  const contract = checked.contract;

  getRule(contract.rule);

  const overrides = {};
  for (const entry of contract.overrides) {
    const defect = defectType(entry.defect);
    if (!defect) {
      throw new ContractError(`contract pins a method for unknown defect ${entry.defect}`, {
        path: 'tract.contract.overrides',
      });
    }
    if (!isMeasurable(entry.method, defect.extent)) {
      throw new ContractError(
        `contract pins ${entry.method} for ${defect.id}, which is ${defect.extent}`,
        { path: 'tract.contract.overrides' }
      );
    }
    overrides[defect.id] = entry.method;
  }

  if (checked.closedOn && checked.openedOn && checked.closedOn < checked.openedOn) {
    throw new ContractError('tract closed before it opened', { path: 'tract.closedOn' });
  }

  return {
    ...checked,
    contract: { ...contract, overrides },
  };
}

/**
 * The option bag the scale code wants, built from the contract. Nothing else
 * in the program is allowed to assemble this, so there is exactly one place
 * where a contract term becomes a scaling argument.
 */
export function scalingOptions(tract) {
  const contract = tract.contract;
  return {
    overrides: contract.overrides,
    sweepAllowance: contract.sweepAllowance,
    cullShare: contract.cullShare,
    minimumNetBoardFeet: contract.minimumNetBoardFeet,
  };
}

/** The option bag the log record wants, also built from the contract. */
export function measurementOptions(tract) {
  const contract = tract.contract;
  return {
    convention: contract.convention,
    rounding: contract.rounding,
    trimPolicy: contract.trimPolicy,
  };
}

/** True on a date inside the harvest window. Open ended at either end. */
export function tractOpenOn(tract, isoDate) {
  if (tract.openedOn && isoDate < tract.openedOn) return false;
  if (tract.closedOn && isoDate > tract.closedOn) return false;
  return true;
}
