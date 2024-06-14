/**
 * Reading a tally.
 *
 * Footage by grade is the number the mill lives on. It is also the number
 * everybody quotes wrongly, because there are two of them and they are not
 * close. Grade recovery on a piece count says what proportion of boards made
 * the grade; grade recovery on footage says what proportion of the wood did.
 * A mill cutting wide FAS and narrow common looks far better on footage than
 * on pieces, and a mill doing the opposite looks worse. Both are reported here
 * and neither is called "the" recovery.
 */

import { round2, round4 } from '../num.js';
import { TallyError } from './unit.js';

/**
 * Footage and piece count per grade, best grade first if an order is given.
 */
export function byGrade(entries, options = {}) {
  const { order = null } = options;
  const buckets = new Map();
  for (const entry of entries) {
    const key = entry.grade ?? 'ungraded';
    const bucket = buckets.get(key) ?? { grade: key, pieces: 0, boardFeet: 0 };
    bucket.pieces += 1;
    bucket.boardFeet += entry.boardFeet ?? 0;
    buckets.set(key, bucket);
  }

  const totalFeet = [...buckets.values()].reduce((sum, bucket) => sum + bucket.boardFeet, 0);
  const totalPieces = [...buckets.values()].reduce((sum, bucket) => sum + bucket.pieces, 0);

  const rows = [...buckets.values()].map((bucket) => ({
    grade: bucket.grade,
    pieces: bucket.pieces,
    boardFeet: round2(bucket.boardFeet),
    footageShare: totalFeet > 0 ? round4(bucket.boardFeet / totalFeet) : 0,
    pieceShare: totalPieces > 0 ? round4(bucket.pieces / totalPieces) : 0,
  }));

  if (order) {
    const rank = (grade) => {
      const index = order.indexOf(grade);
      return index === -1 ? order.length : index;
    };
    return rows.sort((a, b) => rank(a.grade) - rank(b.grade) || a.grade.localeCompare(b.grade));
  }
  return rows.sort((a, b) => b.boardFeet - a.boardFeet || a.grade.localeCompare(b.grade));
}

/**
 * The share that made a named set of grades, on footage and on pieces. The two
 * are returned together on purpose so nobody can quote one as the other.
 */
export function recovery(entries, onGrade) {
  if (!Array.isArray(onGrade) || onGrade.length === 0) {
    throw new TallyError('recovery needs the grades that count as on grade', { path: 'onGrade' });
  }
  const total = { pieces: 0, boardFeet: 0 };
  const made = { pieces: 0, boardFeet: 0 };
  for (const entry of entries) {
    total.pieces += 1;
    total.boardFeet += entry.boardFeet ?? 0;
    if (onGrade.includes(entry.grade)) {
      made.pieces += 1;
      made.boardFeet += entry.boardFeet ?? 0;
    }
  }
  return {
    onGrade: onGrade.slice(),
    pieces: made.pieces,
    totalPieces: total.pieces,
    boardFeet: round2(made.boardFeet),
    totalBoardFeet: round2(total.boardFeet),
    footageRecovery: total.boardFeet > 0 ? round4(made.boardFeet / total.boardFeet) : 0,
    pieceRecovery: total.pieces > 0 ? round4(made.pieces / total.pieces) : 0,
  };
}

/** Footage split by thickness, which is what the kiln schedules off. */
export function byThickness(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const key = entry.quarters ?? 0;
    const bucket = buckets.get(key) ?? { quarters: key, pieces: 0, boardFeet: 0 };
    bucket.pieces += 1;
    bucket.boardFeet += entry.boardFeet ?? 0;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, boardFeet: round2(bucket.boardFeet) }))
    .sort((a, b) => a.quarters - b.quarters);
}

/**
 * Compares an actual grade mix against what the log deck was expected to
 * produce. A run that comes in under on the top grades is either bad logs or
 * bad sawing, and the difference between those two is a different day's work,
 * so this only reports the gap.
 */
export function againstTarget(entries, target) {
  const actual = new Map(byGrade(entries).map((row) => [row.grade, row.footageShare]));
  const rows = Object.entries(target).map(([grade, expected]) => {
    const got = actual.get(grade) ?? 0;
    return {
      grade,
      expectedShare: expected,
      actualShare: got,
      gap: round4(got - expected),
      short: got < expected - 1e-9,
    };
  });
  return {
    rows: rows.sort((a, b) => a.gap - b.gap),
    worstShort: rows.filter((row) => row.short).sort((a, b) => a.gap - b.gap)[0] ?? null,
    totalExpected: round4(Object.values(target).reduce((sum, share) => sum + share, 0)),
  };
}
