/**
 * The period statement.
 *
 * A landowner does not want a statement per load. They want one at the end of
 * the month with every load on it, and they want the loads listed rather than
 * summed, because the argument is never about the total.
 *
 * The roll up is not a sum of the per load statements. Two things only make
 * sense at the period level: the minimum volume clause, which is measured
 * against everything cut in the period rather than against one load, and the
 * advance, which is recovered across the period and can run out partway
 * through it. Both are applied here and neither is applied per load.
 */

import { round2, round4, sum } from '../num.js';
import { summarize } from '../collect.js';
import { SettleError, advanceRecovery, baseRate, minimumVolumeShortfall } from './stumpage.js';

/** Groups statements by the period they fall in. */
export function periodOf(isoDate) {
  if (typeof isoDate !== 'string' || isoDate.length < 7) {
    throw new SettleError(`cannot read a period out of ${isoDate}`, { path: 'scaledOn' });
  }
  return isoDate.slice(0, 7);
}

/**
 * Rolls a period up. `statements` are per load statements already settled.
 * They are not recomputed here: a statement that has been paid is a fact.
 */
export function rollUp(statements, agreement, options = {}) {
  const { period, landowner, openingAdvance = 0, shortfallGrade = null } = options;
  if (!Array.isArray(statements) || statements.length === 0) {
    throw new SettleError('a period needs at least one statement', { path: 'statements' });
  }
  for (const statement of statements) {
    if (period && periodOf(statement.scaledOn) !== period) {
      throw new SettleError(
        `statement ${statement.statementId} is from ${periodOf(statement.scaledOn)}, not ${period}`,
        { path: 'statements' }
      );
    }
  }

  const loads = statements.map((statement) => ({
    statementId: statement.statementId,
    loadId: statement.loadId,
    scaledOn: statement.scaledOn,
    netMbf: statement.netMbf,
    gross: statement.gross,
    deductions: statement.deductions.totalDeducted,
    landowner: statement.division.landowner.net,
    logger: statement.division.logger.net,
  }));

  const netMbf = round4(
    sum(
      loads.map((load) => load.netMbf),
      4
    )
  );
  const gross = round2(
    sum(
      loads.map((load) => load.gross),
      2
    )
  );

  const shortfall = minimumVolumeShortfall(agreement, netMbf);
  let shortfallCharge = 0;
  if (shortfall.applies) {
    const grade = shortfallGrade ?? commonestGrade(statements);
    const rate = baseRate(agreement, commonestSpecies(statements), grade);
    shortfallCharge = round2(shortfall.shortfallMbf * rate.perMbf);
  }

  const advance = advanceRecovery(agreement, gross, openingAdvance);

  return {
    period,
    landowner: landowner ?? agreement.landowner,
    agreement: agreement.id,
    loads,
    loadCount: loads.length,
    netMbf,
    gross,
    deductions: round2(
      sum(
        loads.map((load) => load.deductions),
        2
      )
    ),
    landownerNet: round2(
      sum(
        loads.map((load) => load.landowner),
        2
      )
    ),
    loggerNet: round2(
      sum(
        loads.map((load) => load.logger),
        2
      )
    ),
    minimumVolume: { ...shortfall, charge: shortfallCharge },
    advance: { opening: round2(openingAdvance), ...advance },
    payable: round2(
      sum(
        loads.map((load) => load.landowner),
        2
      ) +
        shortfallCharge -
        advance.recovered
    ),
  };
}

/** What was cut in the period, by species. */
export function periodBySpecies(statements) {
  const lines = statements.flatMap((statement) => statement.lines);
  return summarize(lines, (line) => line.species, {
    netBoardFeet: (line) => line.netBoardFeet,
    value: (line) => line.value,
  })
    .map((bucket) => ({
      species: bucket.key,
      lines: bucket.count,
      netBoardFeet: round2(bucket.netBoardFeet),
      value: round2(bucket.value),
      perMbf: bucket.netBoardFeet > 0 ? round2((bucket.value / bucket.netBoardFeet) * 1000) : 0,
    }))
    .sort((a, b) => b.value - a.value || a.species.localeCompare(b.species));
}

function commonestSpecies(statements) {
  const counts = periodBySpecies(statements);
  if (counts.length === 0) {
    throw new SettleError('no species on any statement in the period', { path: 'statements' });
  }
  return counts[0].species;
}

function commonestGrade(statements) {
  const lines = statements.flatMap((statement) => statement.lines);
  const buckets = summarize(lines, (line) => line.grade, {
    netBoardFeet: (line) => line.netBoardFeet,
  }).sort((a, b) => b.netBoardFeet - a.netBoardFeet);
  return buckets[0].key;
}
