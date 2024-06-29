/**
 * Recovery and overrun.
 *
 * Overrun is the difference between what the mill sawed and what the logs
 * scaled, and it is the most misread number in the trade. A mill running
 * thirty percent overrun is not sawing well. It is buying on Doyle. The same
 * logs sawn the same way on the same day run close to nothing over
 * International, because International was built to predict what a log saws
 * and Doyle was not.
 *
 * So overrun is a property of the contract, not of the mill, and comparing two
 * mills on overrun compares their purchase agreements. What compares mills is
 * lumber recovery factor, which is board feet out per cubic foot of log in and
 * has no rule in it anywhere.
 */

import { cylinderCubicFeet } from '../units.js';
import { round2, round4, sum } from '../num.js';
import { grossScale } from '../scale/gross.js';
import { ruleIds } from '../scale/rules/index.js';
import { MillError } from './pattern.js';

/**
 * Lumber recovery factor: board feet sawn per cubic foot of log. This is the
 * only recovery figure that means the same thing under every contract.
 */
export function lumberRecoveryFactor(logs, boardFeetSawn) {
  if (!Array.isArray(logs) || logs.length === 0) {
    throw new MillError('recovery needs at least one log', { path: 'logs' });
  }
  const cubic = sum(
    logs.map((log) => cylinderCubicFeet(log.scalingDiameterIn, log.nominalLengthFt)),
    4
  );
  if (cubic <= 0) {
    throw new MillError('the logs measure no volume at all', { path: 'logs' });
  }
  return {
    cubicFeet: round2(cubic),
    boardFeetSawn: round2(boardFeetSawn),
    lrf: round2(boardFeetSawn / cubic),
  };
}

/**
 * Overrun against one rule. Positive means the mill sawed more than the logs
 * scaled, which is what a Doyle contract is supposed to produce.
 */
export function overrun(logs, boardFeetSawn, ruleId, options = {}) {
  const scaled = sum(
    logs.map((log) => grossScale(log, ruleId, options).boardFeet),
    1
  );
  if (scaled <= 0) {
    throw new MillError(`the logs scale nothing under ${ruleId}`, { path: 'rule' });
  }
  return {
    rule: ruleId,
    scaledBoardFeet: scaled,
    sawnBoardFeet: round2(boardFeetSawn),
    overrunBoardFeet: round2(boardFeetSawn - scaled),
    overrunShare: round4((boardFeetSawn - scaled) / scaled),
    direction: boardFeetSawn >= scaled ? 'over' : 'under',
  };
}

/**
 * The same run against every rule. This is the report to put in front of
 * anybody who thinks overrun measures the mill.
 */
export function overrunUnderEveryRule(logs, boardFeetSawn, options = {}) {
  const rows = ruleIds()
    .map((ruleId) => {
      try {
        return overrun(logs, boardFeetSawn, ruleId, options);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const shares = rows.map((row) => row.overrunShare);
  return {
    rows: rows.sort((a, b) => b.overrunShare - a.overrunShare),
    spread: shares.length > 0 ? round4(Math.max(...shares) - Math.min(...shares)) : 0,
    sawnBoardFeet: round2(boardFeetSawn),
  };
}

/**
 * Overrun broken out by log size, which is where the rule shows itself. Under
 * Doyle the small logs run enormous overrun and the big ones run under, and a
 * mill that only sees the average never finds out.
 */
export function overrunByDiameter(entries, ruleId, options = {}) {
  const buckets = new Map();
  for (const entry of entries) {
    const key = entry.log.scalingDiameterIn;
    const bucket = buckets.get(key) ?? { diameterIn: key, logs: [], sawn: 0 };
    bucket.logs.push(entry.log);
    bucket.sawn += entry.boardFeetSawn;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => {
      const result = overrun(bucket.logs, bucket.sawn, ruleId, options);
      return {
        diameterIn: bucket.diameterIn,
        logCount: bucket.logs.length,
        ...result,
      };
    })
    .sort((a, b) => a.diameterIn - b.diameterIn);
}

/**
 * Where the volume went. Everything that was in the log and is not in the
 * lumber is slab, sawdust, edgings or trim, and a mill that cannot name the
 * split cannot fix any of it.
 */
export function volumeBalance(logs, sawResult, options = {}) {
  const { sawdustShare = 0.12, trimShare = 0.03 } = options;
  const cubic = sum(
    logs.map((log) => cylinderCubicFeet(log.scalingDiameterIn, log.nominalLengthFt)),
    4
  );
  const logBoardFeet = round2(cubic * 12);
  const lumber = round2(sawResult.boardFeet);
  const sawdust = round2(logBoardFeet * sawdustShare);
  const trim = round2(lumber * trimShare);
  const residue = round2(Math.max(0, logBoardFeet - lumber - sawdust - trim));

  return {
    logBoardFeetEquivalent: logBoardFeet,
    lumberBoardFeet: lumber,
    sawdustBoardFeet: sawdust,
    trimBoardFeet: trim,
    slabAndEdgingBoardFeet: residue,
    lumberShare: logBoardFeet > 0 ? round4(lumber / logBoardFeet) : 0,
  };
}
