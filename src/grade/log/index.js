/**
 * Which market a log goes to.
 *
 * A log does not have a grade. It has a grade in each market that will take
 * it, and the yard sends it to whichever is worth most. That is why this is a
 * dispatcher and not a ladder: veneer is not simply better than factory, it is
 * a different buyer with different rules, and a log that fails veneer on one
 * knot can still be the best factory log on the truck.
 *
 * The order markets are tried in is a business decision and it is passed in.
 * The default is the order the yard sells in on an ordinary week. When the
 * veneer buyer is not taking logs, the caller drops veneer from the list and
 * nothing else changes.
 */

import { GradeError } from '../../errors.js';
import { lookupSpecies } from '../../model/species.js';
import { factoryGrade } from './usfs.js';
import { tieGrade, veneerGrade } from './construction.js';

/** The markets, in the order the yard normally tries them. */
export const DEFAULT_MARKET_ORDER = ['veneer', 'factory', 'tie', 'pulp'];

const MARKETS = {
  veneer: (log, options) => {
    const result = veneerGrade(log, options);
    return { market: 'veneer', grade: result.grade, reasons: result.reasons, detail: result };
  },
  factory: (log, options) => {
    const result = factoryGrade(log, options);
    return { market: 'factory', grade: result.grade, reasons: result.reasons, detail: result };
  },
  tie: (log, options) => {
    const result = tieGrade(log, options);
    return { market: 'tie', grade: result.grade, reasons: result.reasons, detail: result };
  },
  pulp: (log) => {
    const takes = log.merchantable && log.scalingDiameterIn >= 4;
    return {
      market: 'pulp',
      grade: takes ? 'pulpwood' : null,
      reasons: takes ? [] : ['nothing left that a chipper would take'],
      detail: null,
    };
  },
};

/**
 * Species faults that do not show up in any of the market rules but that the
 * grader has to apply anyway. Mineral streak is the clear case: it is a
 * grading defect in the maples and invisible everywhere else, so the same
 * streak on the same face is a downgrade on one log and nothing on the next.
 */
export function speciesDowngrades(log) {
  const species = lookupSpecies(log.species);
  const notes = [];
  for (const defect of log.defects ?? []) {
    if (defect.type === 'mineral streak' && species.mineralStreakCounts) {
      notes.push(`mineral streak counts against ${species.key}`);
    }
  }
  if (species.heartRotProne && !(log.defects ?? []).some((d) => d.type === 'heart rot')) {
    notes.push(`${species.key} hides heart rot, bore before buying on grade`);
  }
  return notes;
}

/**
 * Grades a log in every market that is open and returns the first that takes
 * it, along with what every other market said.
 */
export function gradeLog(log, options = {}) {
  const { markets = DEFAULT_MARKET_ORDER } = options;
  if (!Array.isArray(markets) || markets.length === 0) {
    throw new GradeError('gradeLog needs at least one open market', { path: 'markets' });
  }

  const attempts = markets.map((name) => {
    const run = MARKETS[name];
    if (!run) {
      throw new GradeError(`no market called ${name}`, { path: 'markets' });
    }
    return run(log, options);
  });

  const taken = attempts.find((attempt) => attempt.grade !== null) ?? null;

  return {
    logId: log.id,
    market: taken ? taken.market : null,
    grade: taken ? taken.grade : null,
    attempts,
    notes: speciesDowngrades(log),
    reasons: taken ? [] : attempts.flatMap((attempt) => attempt.reasons),
  };
}

/** Grades a whole load and counts what came out of it. */
export function gradeLoad(logs, options = {}) {
  const results = logs.map((log) => gradeLog(log, options));
  const counts = new Map();
  for (const result of results) {
    const key = result.grade ?? 'no market';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    results,
    byGrade: [...counts.entries()]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count || a.grade.localeCompare(b.grade)),
    ungraded: results.filter((result) => result.grade === null).length,
  };
}
