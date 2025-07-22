/**
 * A truckload.
 *
 * The load is the unit everything downstream counts in. It ties the logs to a
 * tract, so the contract is known, and to a truck and a date, so the haul can
 * be paid. A load whose logs come off two tracts cannot be settled, because
 * the two tracts may be on different contracts, so that is refused outright
 * rather than split silently.
 */

import { ContractError } from '../errors.js';
import { makeLog } from './log.js';
import { number, string, validate } from '../valid/check.js';
import { checkLoad } from '../limits.js';

const loadSchema = {
  id: string(),
  tractId: string(),
  truck: string({ optional: true }),
  driver: string({ optional: true }),
  haulZone: string({ optional: true }),
  arrivedAt: string({ optional: true }),
  scaledBy: string({ optional: true }),
  grossWeightLb: number({ min: 0, optional: true }),
  tareWeightLb: number({ min: 0, optional: true }),
};

/**
 * Reads a load and every log on it, using the measurement conventions the
 * tract's contract sets.
 */
export function makeLoad(raw, measurement = {}) {
  checkLoad(raw);
  const checked = validate(raw, loadSchema, { label: 'load' });
  const rawLogs = Array.isArray(raw.logs) ? raw.logs : [];
  if (rawLogs.length === 0) {
    throw new ContractError('a load needs at least one log', { path: 'load.logs' });
  }

  const logs = rawLogs.map((entry, index) => {
    const record = makeLog({ ...entry, loadId: checked.id, tractId: raw.tractId }, measurement);
    if (entry.tractId && entry.tractId !== raw.tractId) {
      throw new ContractError(
        `log ${record.id} is from tract ${entry.tractId}, the load is from ${raw.tractId}`,
        { path: `load.logs[${index}].tractId` }
      );
    }
    return record;
  });

  const ids = logs.map((log) => log.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) {
    throw new ContractError(`log ${duplicate} appears twice on load ${checked.id}`, {
      path: 'load.logs',
    });
  }

  return { ...checked, logs };
}

/** Net weight of the wood, once the truck is taken off. */
export function netWeightLb(load) {
  if (load.grossWeightLb === undefined || load.tareWeightLb === undefined) return null;
  return Math.max(0, load.grossWeightLb - load.tareWeightLb);
}

/**
 * Pounds per board foot, which is the cheapest check there is on a scale. A
 * green hardwood load runs between eight and twelve; well outside that and
 * either the scale or the scale ticket weight is wrong.
 */
export function weightPerBoardFoot(load, netBoardFeet) {
  const weight = netWeightLb(load);
  if (weight === null || netBoardFeet <= 0) return null;
  return Math.round((weight / netBoardFeet) * 100) / 100;
}

/** Flags a load whose weight and scale disagree. */
export function weightCheck(load, netBoardFeet, options = {}) {
  const { low = 8, high = 12 } = options;
  const ratio = weightPerBoardFoot(load, netBoardFeet);
  if (ratio === null) return { checked: false, ratio: null, verdict: 'no weights recorded' };
  if (ratio < low) return { checked: true, ratio, verdict: 'light for the scale' };
  if (ratio > high) return { checked: true, ratio, verdict: 'heavy for the scale' };
  return { checked: true, ratio, verdict: 'in line' };
}
