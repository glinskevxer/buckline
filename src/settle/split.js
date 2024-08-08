/**
 * Splitting the money.
 *
 * There are two ways a timber sale is divided and they look similar on a good
 * load and behave completely differently on a bad one.
 *
 * On a **residual** sale the logger is paid a rate per thousand for cutting
 * and hauling, and the landowner gets whatever is left. The logger's money is
 * safe and the landowner carries the risk, so a load of low grade wood can pay
 * the landowner nothing at all and can in principle owe money.
 *
 * On a **share** sale both parties take a percentage of the gross. Nobody's
 * money is safe and nobody carries all the risk.
 *
 * Which deductions come off which share is a separate question again and it
 * has to be stated. A severance tax is the landowner's by law in most places.
 * Insurance is usually the logger's. Road maintenance is argued about every
 * time, which is exactly why it is a field here rather than a default.
 */

import { round2, round4 } from '../num.js';
import { SettleError } from './stumpage.js';

/** The two arrangements. */
export const SPLIT_KINDS = ['residual', 'share'];

/** Who a deduction is charged to. */
export const BEARERS = ['landowner', 'logger', 'both'];

/** Builds a split agreement and checks the shares add up. */
export function makeSplit(spec) {
  const { kind, cutAndHaulPerMbf = 0, landownerShare = 0, loggerShare = 0, bears = {} } = spec;

  if (!SPLIT_KINDS.includes(kind)) {
    throw new SettleError(`no split arrangement called ${kind}`, { path: 'kind' });
  }
  if (kind === 'residual' && !(cutAndHaulPerMbf > 0)) {
    throw new SettleError('a residual sale needs a cut and haul rate', {
      path: 'cutAndHaulPerMbf',
    });
  }
  if (kind === 'share') {
    const total = landownerShare + loggerShare;
    if (Math.abs(total - 1) > 1e-9) {
      throw new SettleError(`share split adds to ${round4(total)}, not one`, {
        path: 'landownerShare',
      });
    }
  }
  for (const [name, bearer] of Object.entries(bears)) {
    if (!BEARERS.includes(bearer)) {
      throw new SettleError(`${name} is charged to ${bearer}, who is not a party`, {
        path: 'bears',
      });
    }
  }

  return { kind, cutAndHaulPerMbf, landownerShare, loggerShare, bears };
}

/** Who bears a deduction, defaulting to the landowner. */
export function bearerOf(split, name) {
  return Object.prototype.hasOwnProperty.call(split.bears, name) ? split.bears[name] : 'landowner';
}

/**
 * Divides a gross settlement. `deductionLines` are the applied lines from the
 * deduction schedule, and each one is charged to whichever party the split
 * says bears it.
 */
export function divide(split, gross, netMbf, deductionLines = []) {
  if (gross < 0) {
    throw new SettleError('a gross settlement cannot be negative', { path: 'gross' });
  }

  let landownerGross;
  let loggerGross;
  if (split.kind === 'residual') {
    loggerGross = round2(Math.min(gross, netMbf * split.cutAndHaulPerMbf));
    landownerGross = round2(gross - loggerGross);
  } else {
    landownerGross = round2(gross * split.landownerShare);
    loggerGross = round2(gross * split.loggerShare);
  }

  const charges = { landowner: 0, logger: 0 };
  const detail = [];
  for (const line of deductionLines) {
    const bearer = bearerOf(split, line.name);
    if (bearer === 'both') {
      const half = round2(line.amount / 2);
      charges.landowner += half;
      charges.logger += round2(line.amount - half);
      detail.push({
        ...line,
        bearer,
        landownerShare: half,
        loggerShare: round2(line.amount - half),
      });
    } else {
      charges[bearer] += line.amount;
      detail.push({
        ...line,
        bearer,
        landownerShare: bearer === 'landowner' ? line.amount : 0,
        loggerShare: bearer === 'logger' ? line.amount : 0,
      });
    }
  }

  return {
    kind: split.kind,
    gross: round2(gross),
    landowner: {
      gross: landownerGross,
      deductions: round2(charges.landowner),
      net: round2(landownerGross - charges.landowner),
    },
    logger: {
      gross: loggerGross,
      deductions: round2(charges.logger),
      net: round2(loggerGross - charges.logger),
    },
    deductionDetail: detail,
    unallocated: round2(gross - landownerGross - loggerGross),
  };
}

/**
 * Whether either party ends up owing money. On a residual sale this is the
 * landowner's risk and it is real, which is why it is reported rather than
 * clamped to zero: a settlement quietly floored at nothing hides a contract
 * that is not working.
 */
export function underwater(result) {
  const parties = [];
  if (result.landowner.net < 0) parties.push('landowner');
  if (result.logger.net < 0) parties.push('logger');
  return {
    underwater: parties.length > 0,
    parties,
    shortfall: round2(Math.min(0, result.landowner.net) + Math.min(0, result.logger.net)),
  };
}

/**
 * What the same load would pay each party under the other arrangement. This is
 * the number that gets a contract renegotiated, and it moves most on the loads
 * where it matters most.
 */
export function compareArrangements(a, b, gross, netMbf, deductionLines = []) {
  const left = divide(a, gross, netMbf, deductionLines);
  const right = divide(b, gross, netMbf, deductionLines);
  return {
    left: { kind: a.kind, ...left },
    right: { kind: b.kind, ...right },
    landownerDifference: round2(right.landowner.net - left.landowner.net),
    loggerDifference: round2(right.logger.net - left.logger.net),
  };
}
