/**
 * Net scale.
 *
 * Gross comes off the rule, deductions come off the defects, and the order
 * they are taken in matters because they are not independent. Two faults in
 * the same wood must not both be charged, sweep and crook are alternatives
 * rather than a sum, and a length deduction changes the log that every later
 * deduction is measured against.
 *
 * What follows is the order the yard works in:
 *
 *   1. sweep and crook first, taking whichever costs more
 *   2. length deductions, which shorten the log for everything after
 *   3. diameter deductions, which shrink it for everything after
 *   4. squared deductions, straight board feet off what is left
 *   5. percentage deductions other than sweep, on the running net
 *
 * Then the cull test. A log whose net has fallen under the cull share is not a
 * saw log at all and its whole scale goes to zero, which is why a rule that
 * takes deductions harshly does not merely reduce a load, it removes sticks
 * from it.
 */

import { ScaleError } from '../errors.js';
import { getRule, rulePolicy } from './rules/index.js';
import { grossScale } from './gross.js';
import { methodFor } from './defect/policy.js';
import { defectType } from './defect/types.js';
import { crookLengthFt, sweepShare, worseOf } from './defect/sweep.js';
import {
  diameterDeduction,
  lengthDeduction,
  percentageDeduction,
  squaredDeduction,
} from './defect/methods.js';

/** Under this share of gross the stick stops being a saw log. */
export const DEFAULT_CULL_SHARE = 0.5;

/** Below this many board feet net, nobody hauls it. */
export const DEFAULT_MINIMUM_NET_BF = 10;

const ORDER = ['length', 'diameter', 'squared', 'percentage'];

export function netScale(log, ruleId, options = {}) {
  const {
    overrides = {},
    sweepAllowance = 'quarter',
    cullShare = DEFAULT_CULL_SHARE,
    minimumNetBoardFeet = DEFAULT_MINIMUM_NET_BF,
  } = options;

  const rule = getRule(ruleId);
  const policy = rulePolicy(ruleId);
  const gross = grossScale(log, ruleId, options);

  if (gross.boardFeet === 0) {
    return {
      logId: log.id,
      rule: policy.id,
      grossBoardFeet: 0,
      netBoardFeet: 0,
      deductions: [],
      cull: true,
      cullReason: gross.reason ?? 'nothing to scale',
    };
  }

  let workingDiameter = log.scalingDiameterIn;
  let workingLength = log.nominalLengthFt;
  let running = gross.unrounded;
  const deductions = [];

  const bend = bendDeduction(log, rule, workingDiameter, workingLength, sweepAllowance);
  if (bend) {
    deductions.push(bend);
    running -= bend.deductionBoardFeet;
    if (bend.taken === 'crook') {
      workingLength = Math.max(0, workingLength - bend.detail.affectedFt);
    }
  }

  for (const method of ORDER) {
    for (const [index, defect] of (log.defects ?? []).entries()) {
      const entry = defectType(defect.type);
      if (!entry || entry.kind === 'form') continue;
      const chosen = methodFor(defect.type, ruleId, { overrides });
      if (chosen.method !== method) continue;

      const applied = applyMethod(chosen.method, rule.id, workingDiameter, workingLength, defect);
      const capped = Math.max(0, Math.min(applied.deductionBoardFeet, running));
      deductions.push({
        index,
        defect: entry.id,
        method: chosen.method,
        because: chosen.because,
        deductionBoardFeet: round3(capped),
        detail: applied.detail,
      });
      running -= capped;

      if (chosen.method === 'length') {
        workingLength = Math.max(0, workingLength - applied.detail.affectedFt);
      }
      if (chosen.method === 'diameter') {
        workingDiameter = applied.detail.soundDiameterIn;
      }
    }
  }

  const net = Math.max(0, Math.round(running / policy.roundsTo) * policy.roundsTo);
  const share = gross.boardFeet > 0 ? net / gross.boardFeet : 0;
  let cull = false;
  let cullReason = null;
  if (share < cullShare) {
    cull = true;
    cullReason = `net is ${Math.round(share * 100)} percent of gross, under the ${Math.round(cullShare * 100)} percent cull line`;
  } else if (net < minimumNetBoardFeet) {
    cull = true;
    cullReason = `net of ${net} board feet is under the ${minimumNetBoardFeet} board foot floor`;
  }

  return {
    logId: log.id,
    rule: policy.id,
    grossBoardFeet: gross.boardFeet,
    netBoardFeet: cull ? 0 : net,
    scaledNetBoardFeet: net,
    deductions,
    cull,
    cullReason,
  };
}

function bendDeduction(log, rule, diameterIn, lengthFt, allowance) {
  const sweep = (log.defects ?? []).find((d) => d.type === 'sweep');
  const crook = (log.defects ?? []).find((d) => d.type === 'crook');
  if (!sweep && !crook) return null;

  const gross = rule.gross(diameterIn, lengthFt);

  let sweepBf = 0;
  let sweepDetail = null;
  if (sweep) {
    const share = sweepShare(diameterIn, lengthFt, sweep.depthIn ?? 0, {
      allowance,
      sweptLengthFt: sweep.lengthFt ?? lengthFt,
    });
    sweepBf = gross * share.share;
    sweepDetail = share;
  }

  let crookBf = 0;
  let crookDetail = null;
  if (crook) {
    const affectedFt = crookLengthFt(crook.depthIn ?? 0);
    const applied = lengthDeduction(rule.id, diameterIn, lengthFt, affectedFt);
    crookBf = applied.deductionBoardFeet;
    crookDetail = applied.detail;
  }

  const chosen = worseOf(sweepBf, crookBf);
  if (chosen.boardFeet === 0) return null;
  return {
    index: null,
    defect: chosen.taken,
    method: chosen.taken === 'sweep' ? 'percentage' : 'length',
    because: 'sweep and crook are alternatives, not a sum',
    taken: chosen.taken,
    deductionBoardFeet: round3(chosen.boardFeet),
    detail: chosen.taken === 'sweep' ? sweepDetail : crookDetail,
  };
}

function applyMethod(method, ruleId, diameterIn, lengthFt, defect) {
  switch (method) {
    case 'length':
      return lengthDeduction(ruleId, diameterIn, lengthFt, defect.lengthFt ?? 0);
    case 'diameter':
      return diameterDeduction(ruleId, diameterIn, lengthFt, defect.depthIn ?? 0);
    case 'squared':
      return squaredDeduction(ruleId, diameterIn, lengthFt, defect);
    case 'percentage':
      return percentageDeduction(ruleId, diameterIn, lengthFt, defect.share ?? 0);
    case 'none':
      return { deductionBoardFeet: 0, detail: {} };
    default:
      throw new ScaleError(`cannot apply method ${method}`, { path: 'method' });
  }
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
