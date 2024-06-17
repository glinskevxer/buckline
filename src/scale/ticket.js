/**
 * The scale ticket.
 *
 * One truckload, scaled once, under one rule, by one scaler. The ticket is the
 * document the settlement is built on, so it carries everything needed to
 * reproduce the numbers without the logs: the conventions in force, the rule,
 * the per log working, and the totals broken out the way the mill wants to
 * read them.
 *
 * Totals are summed from the per log net, never recomputed from the totals of
 * anything else. A ticket that disagrees with its own lines is worse than no
 * ticket.
 */

import { byDescending, summarize } from '../collect.js';
import { round1, round4, sum } from '../num.js';

import { ScaleError } from '../errors.js';
import { rulePolicy } from './rules/index.js';
import { netScale } from './net.js';

/**
 * Scales a whole load and assembles the ticket.
 */
export function scaleTicket(load, options = {}) {
  const { rule, logs } = load;
  if (!Array.isArray(logs) || logs.length === 0) {
    throw new ScaleError('a ticket needs at least one log', { path: 'load.logs' });
  }
  const policy = rulePolicy(rule);

  const lines = logs.map((log) => netScale(log, rule, options));

  const kept = lines.filter((line) => !line.cull);
  const culled = lines.filter((line) => line.cull);

  return {
    ticketId: load.ticketId ?? null,
    loadId: load.loadId ?? null,
    tractId: load.tractId ?? null,
    scaledBy: load.scaledBy ?? null,
    scaledAt: load.scaledAt ?? null,
    rule: policy.id,
    ruleLabel: policy.label,
    lines,
    logCount: lines.length,
    keptCount: kept.length,
    culledCount: culled.length,
    grossBoardFeet: sum(lines.map((line) => line.grossBoardFeet)),
    netBoardFeet: sum(kept.map((line) => line.netBoardFeet)),
    deductionBoardFeet: round1(
      sum(lines.map((line) => line.grossBoardFeet)) - sum(kept.map((line) => line.netBoardFeet))
    ),
    bySpecies: groupBy(logs, lines, (log) => log.species),
    byLength: groupBy(logs, lines, (log) => String(log.nominalLengthFt)),
    byDiameter: groupBy(logs, lines, (log) => String(log.scalingDiameterIn)),
  };
}

/**
 * The share of gross that came off as deduction. This is the number a buyer
 * argues about and the one a forester watches for drift between scalers.
 */
export function deductionShare(ticket) {
  if (ticket.grossBoardFeet === 0) return 0;
  return round4(ticket.deductionBoardFeet / ticket.grossBoardFeet);
}

/** Average net board feet per log actually kept. */
export function averageLogSize(ticket) {
  if (ticket.keptCount === 0) return 0;
  return round1(ticket.netBoardFeet / ticket.keptCount);
}

/** The lines that were culled, with their reasons, for the woods foreman. */
export function cullReport(ticket) {
  return ticket.lines
    .filter((line) => line.cull)
    .map((line) => ({
      logId: line.logId,
      grossBoardFeet: line.grossBoardFeet,
      scaledNetBoardFeet: line.scaledNetBoardFeet ?? 0,
      reason: line.cullReason,
    }));
}

function groupBy(logs, lines, keyOf) {
  const paired = logs.map((log, index) => ({ log, line: lines[index] }));
  return summarize(paired, (pair) => keyOf(pair.log), {
    grossBoardFeet: (pair) => pair.line.grossBoardFeet,
    netBoardFeet: (pair) => (pair.line.cull ? 0 : pair.line.netBoardFeet),
  })
    .map((bucket) => ({
      key: bucket.key,
      logCount: bucket.count,
      grossBoardFeet: round1(bucket.grossBoardFeet),
      netBoardFeet: round1(bucket.netBoardFeet),
    }))
    .sort(byDescending('netBoardFeet'));
}
