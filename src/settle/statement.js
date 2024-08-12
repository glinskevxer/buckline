/**
 * The settlement statement.
 *
 * One load, priced, deducted and divided, written out so that every number on
 * it can be traced back to the ticket line that produced it. Nothing here
 * computes anything new. It runs the pieces in the order the contract runs
 * them and records what each one did, and that is the whole job: the arguments
 * that reach the office are almost never about arithmetic, they are about
 * which rate was used and why.
 *
 * The order is fixed and it is not negotiable per statement:
 *
 *   1. the scale ticket, which is already written and cannot be recomputed here
 *   2. stumpage rate per line, with the sliding scale read against the index
 *      that was published on the scale date, not today's
 *   3. gross, summed from the lines
 *   4. haul, billed against the zone the load came from
 *   5. deductions, in class order
 *   6. the split
 *
 * Step two is the one that goes wrong. Reading today's index onto an old
 * ticket produces a settlement that cannot be reproduced next month.
 */

import { round2, round4, sum } from '../num.js';
import { SettleError, advanceRecovery, rateFor } from './stumpage.js';
import { applyDeductions, byClass } from './deductions.js';
import { divide, underwater } from './split.js';
import { haulCharge } from './haul.js';

/**
 * Builds a statement.
 *
 * `graded` is a list of `{ species, grade, netBoardFeet }` from the scale and
 * grade of one load. Everything else comes off the agreements.
 */
export function settle(input) {
  const {
    statementId,
    loadId,
    scaledOn,
    graded = [],
    agreement,
    split,
    rateCard = null,
    haulZone = null,
    deductionSchedule = [],
    marketIndex = null,
    dieselPerGallon = null,
    outstanding = {},
  } = input;

  if (!statementId || !loadId) {
    throw new SettleError('a statement needs an identifier and a load', { path: 'statementId' });
  }
  if (!scaledOn) {
    throw new SettleError('a statement needs the date the load was scaled', { path: 'scaledOn' });
  }
  if (graded.length === 0) {
    throw new SettleError('a statement needs at least one graded line', { path: 'graded' });
  }

  const lines = graded.map((line, index) => {
    if (!(line.netBoardFeet >= 0)) {
      throw new SettleError(`line ${index} has no scale on it`, { path: `graded[${index}]` });
    }
    const rate = rateFor(agreement, line.species, line.grade, marketIndex);
    return {
      species: rate.species,
      grade: line.grade,
      netBoardFeet: round2(line.netBoardFeet),
      basePerMbf: rate.basePerMbf,
      perMbf: rate.perMbf,
      slidingApplied: rate.slidingApplied,
      value: round2((line.netBoardFeet / 1000) * rate.perMbf),
    };
  });

  const netMbf = round4(
    sum(
      lines.map((line) => line.netBoardFeet),
      2
    ) / 1000
  );
  const gross = round2(
    sum(
      lines.map((line) => line.value),
      2
    )
  );

  let haul = null;
  if (rateCard && haulZone) {
    haul = haulCharge(
      rateCard,
      haulZone,
      { netBoardFeet: netMbf * 1000, netWeightLb: input.netWeightLb },
      { dieselPerGallon }
    );
  }

  const schedule = haul
    ? [
        ...deductionSchedule,
        { name: 'haul', class: 'contractual', basis: 'flat', amount: haul.total },
      ]
    : deductionSchedule;

  const deductions = applyDeductions(gross, netMbf, schedule, { outstanding });
  const division = divide(split, deductions.net, netMbf, deductions.lines);
  const advance = advanceRecovery(agreement, gross, outstanding.advance ?? 0);

  return {
    statementId,
    loadId,
    scaledOn,
    agreement: agreement.id,
    marketIndex,
    lines,
    netMbf,
    gross,
    haul,
    deductions: { ...deductions, byClass: byClass(deductions) },
    division,
    underwater: underwater(division),
    advance,
    payable: round2(division.landowner.net + division.logger.net),
  };
}

/** A printable summary, one line per section. */
export function statementSummary(statement) {
  const rows = [
    { label: 'gross', amount: statement.gross },
    { label: 'deductions', amount: round2(-statement.deductions.totalDeducted) },
    { label: 'landowner', amount: statement.division.landowner.net },
    { label: 'logger', amount: statement.division.logger.net },
  ];
  if (statement.haul) {
    rows.splice(1, 0, { label: 'haul', amount: round2(-statement.haul.total) });
  }
  return rows;
}

/**
 * Checks a statement against itself. Every one of these has been wrong in
 * production at some point, which is why they are asserted rather than
 * assumed.
 */
export function auditStatement(statement) {
  const problems = [];

  const lineTotal = round2(
    sum(
      statement.lines.map((line) => line.value),
      2
    )
  );
  if (Math.abs(lineTotal - statement.gross) > 0.02) {
    problems.push('gross does not equal the sum of its lines');
  }

  const netAfter = round2(statement.gross - statement.deductions.totalDeducted);
  if (Math.abs(netAfter - statement.deductions.net) > 0.02) {
    problems.push('deductions do not reconcile against the gross');
  }

  const divided = round2(statement.division.landowner.gross + statement.division.logger.gross);
  if (Math.abs(divided - statement.deductions.net) > 0.02) {
    problems.push('the split does not add back to what was divided');
  }

  if (statement.netMbf < 0) {
    problems.push('a statement cannot carry negative volume');
  }

  return { clean: problems.length === 0, problems };
}
