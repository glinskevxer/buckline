/**
 * Gross scale.
 *
 * Gross is the volume of the log before anything is deducted for defect. It
 * sounds like it should be a single number and it is not, because a segment
 * rule needs a taper and a whole log rule does not. If the scaler measured the
 * large end, the segment rule uses the log's own taper. If nobody measured it,
 * the rule falls back to the taper it assumes, and the two answers differ on
 * any log that is not shaped the way the rule expects.
 *
 * That is worth stating plainly: under International, whether the scaler put a
 * tape on the butt changes the gross volume. Under Doyle and Scribner it
 * changes nothing at all.
 */

import { round3, round4 } from '../num.js';

import { ScaleError } from '../errors.js';
import { getRule, rulePolicy } from './rules/index.js';
import { ASSUMED_TAPER_PER_FOOT, segmentDiameters } from '../measure/taper.js';

/**
 * Gross board feet for one log record under one rule, with the working shown.
 */
export function grossScale(log, ruleId, options = {}) {
  const { useMeasuredTaper = true } = options;
  const rule = getRule(ruleId);
  const policy = rulePolicy(ruleId);

  if (!log.merchantable || log.nominalLengthFt <= 0) {
    return emptyResult(policy, 'log is under the shortest length class');
  }
  if (log.scalingDiameterIn < policy.smallestDiameterIn) {
    return emptyResult(
      policy,
      `log is under the ${policy.smallestDiameterIn} inch floor for ${policy.id}`
    );
  }

  if (policy.segmentFt === null) {
    const boardFeet = rule.scale(log.scalingDiameterIn, log.nominalLengthFt);
    return {
      rule: policy.id,
      boardFeet,
      unrounded: round3(rule.gross(log.scalingDiameterIn, log.nominalLengthFt)),
      segments: null,
      taperUsed: null,
      taperSource: 'not used',
      reason: null,
    };
  }

  const measured = useMeasuredTaper ? log.taperPerFoot : null;
  const taper = measured ?? ASSUMED_TAPER_PER_FOOT;
  const taperSource = measured === null || measured === undefined ? 'assumed' : 'measured';

  const segments = segmentDiameters(
    log.scalingDiameterIn,
    taper,
    log.nominalLengthFt,
    policy.segmentFt
  ).map((segment) => ({
    ...segment,
    boardFeet: round3(rule.gross(Math.floor(segment.smallEndIn), segment.lengthFt)),
  }));

  const unrounded = segments.reduce((sum, segment) => sum + segment.boardFeet, 0);
  return {
    rule: policy.id,
    boardFeet: Math.round(unrounded / policy.roundsTo) * policy.roundsTo,
    unrounded: round3(unrounded),
    segments,
    taperUsed: round4(taper),
    taperSource,
    reason: null,
  };
}

/** Gross for a whole list of logs, plus the total. */
export function grossScaleAll(logs, ruleId, options = {}) {
  if (!Array.isArray(logs)) {
    throw new ScaleError('grossScaleAll wants a list of logs', { path: 'logs' });
  }
  const entries = logs.map((log) => ({ logId: log.id, ...grossScale(log, ruleId, options) }));
  return {
    rule: ruleId,
    entries,
    totalBoardFeet: entries.reduce((sum, entry) => sum + entry.boardFeet, 0),
    scaledCount: entries.filter((entry) => entry.boardFeet > 0).length,
    rejectedCount: entries.filter((entry) => entry.boardFeet === 0).length,
  };
}

function emptyResult(policy, reason) {
  return {
    rule: policy.id,
    boardFeet: 0,
    unrounded: 0,
    segments: null,
    taperUsed: null,
    taperSource: 'not used',
    reason,
  };
}
