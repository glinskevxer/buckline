/**
 * Putting a number on wood.
 *
 * Value is the last step and it depends on everything before it. A log is
 * worth its net scale times a price, the price comes off its grade, the grade
 * comes off the market that will take it, and which market that is depends on
 * the species and the faces. Change the log rule and the net scale changes.
 * Change the market list and the grade changes. Both change the money and
 * neither touches the log.
 *
 * So a value is only meaningful with the terms it was worked out under, and
 * every function here carries them back with the number.
 */

import { round2 } from '../num.js';
import { gradeLog } from '../grade/log/index.js';
import { netScale } from '../scale/net.js';
import { PriceError, priceFor, valueOf } from './list.js';

/**
 * What one log is worth. `options` carries the contract terms and the open
 * markets, and both are recorded on the result.
 */
export function valueLog(log, ruleId, list, options = {}) {
  const scale = netScale(log, ruleId, options);
  const graded = gradeLog(log, options);

  if (scale.cull) {
    return {
      logId: log.id,
      rule: ruleId,
      market: null,
      grade: null,
      netBoardFeet: 0,
      perMbf: 0,
      value: 0,
      reason: scale.cullReason,
    };
  }
  if (graded.grade === null) {
    return {
      logId: log.id,
      rule: ruleId,
      market: null,
      grade: null,
      netBoardFeet: scale.netBoardFeet,
      perMbf: 0,
      value: 0,
      reason: 'no market would take it',
    };
  }

  const price = priceFor(list, log.species, graded.grade);
  return {
    logId: log.id,
    rule: ruleId,
    priceList: list.id,
    market: graded.market,
    grade: graded.grade,
    netBoardFeet: scale.netBoardFeet,
    perMbf: price.perMbf,
    priceRoute: price.route,
    value: valueOf(scale.netBoardFeet, price.perMbf),
    reason: null,
  };
}

/** A whole load, with the totals and the logs that earned nothing. */
export function valueLoad(logs, ruleId, list, options = {}) {
  const lines = logs.map((log) => valueLog(log, ruleId, list, options));
  const earning = lines.filter((line) => line.value > 0);
  return {
    rule: ruleId,
    priceList: list.id,
    lines,
    logCount: lines.length,
    earningCount: earning.length,
    netBoardFeet: round2(earning.reduce((total, line) => total + line.netBoardFeet, 0)),
    value: round2(lines.reduce((total, line) => total + line.value, 0)),
    averagePerMbf: 0,
  };
}

/** Fills in the average realised price on a valued load. */
export function withAveragePrice(result) {
  const average = result.netBoardFeet > 0 ? round2((result.value / result.netBoardFeet) * 1000) : 0;
  return { ...result, averagePerMbf: average };
}

/**
 * The same load under two sets of terms, so a buyer and a seller can see
 * exactly where the difference comes from. This is the report that ends most
 * arguments, because it separates the scale difference from the grade
 * difference instead of leaving them tangled in one total.
 */
export function compareTerms(logs, list, a, b, options = {}) {
  const left = withAveragePrice(valueLoad(logs, a.rule, list, { ...options, ...a.options }));
  const right = withAveragePrice(valueLoad(logs, b.rule, list, { ...options, ...b.options }));

  return {
    left: { label: a.label ?? a.rule, ...left },
    right: { label: b.label ?? b.rule, ...right },
    scaleDifferenceBoardFeet: round2(right.netBoardFeet - left.netBoardFeet),
    valueDifference: round2(right.value - left.value),
    priceDifferencePerMbf: round2(right.averagePerMbf - left.averagePerMbf),
  };
}

/**
 * What a load would be worth if every log made one grade better. This is the
 * number a woods foreman needs to justify a bucking change, and it is not the
 * same as the value of the top grade because the scale does not move.
 */
export function upgradeValue(logs, ruleId, list, ladder, options = {}) {
  if (!Array.isArray(ladder) || ladder.length < 2) {
    throw new PriceError('an upgrade needs a grade ladder to walk', { path: 'ladder' });
  }
  const base = valueLoad(logs, ruleId, list, options);
  let uplift = 0;
  for (const line of base.lines) {
    const index = ladder.indexOf(line.grade);
    if (index <= 0) continue;
    const better = ladder[index - 1];
    const price = priceFor(list, logs.find((log) => log.id === line.logId).species, better);
    uplift += valueOf(line.netBoardFeet, price.perMbf) - line.value;
  }
  return {
    baseValue: base.value,
    upliftValue: round2(uplift),
    upliftShare: base.value > 0 ? round2(uplift / base.value) : 0,
  };
}
