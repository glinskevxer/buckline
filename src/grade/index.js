/**
 * The grading front door.
 *
 * The species decides the rule book, the rule book decides what gets measured,
 * and only then does anything get measured. That order matters because the two
 * books do not read the same board. The hardwood book asks how much clear wood
 * can be cut out of the face. The structural book asks how much of the cross
 * section is missing at the worst point. A board with one big centre knot and
 * nothing else is poor hardwood and good structural lumber, and neither answer
 * is a compromise on the other.
 *
 * So a caller does not choose a grader. It hands over a board and the species
 * on that board settles it.
 */

import { GradeError } from '../errors.js';
import { RULE_BOOKS, lookupSpecies, ruleBookFor } from '../model/species.js';
import { gradeBoard } from './lumber/grade.js';
import { gradePiece, waneShareOf } from './softwood/structural.js';

/**
 * Turns a board record into the piece shape the structural grader wants. The
 * two graders take different inputs because they are asking different
 * questions, and pretending otherwise is how the wrong limit gets applied.
 */
export function asStructuralPiece(board) {
  return {
    widthIn: board.widthIn,
    knots: (board.defects ?? [])
      .filter((defect) => defect.type === 'knot' || defect.type === 'sound knot')
      .map((defect) => ({
        fromEdgeIn: defect.fromEdgeIn ?? 0,
        sizeIn: defect.widthIn ?? 0,
        atFt: defect.startFt ?? 0,
        face: defect.face === 1 ? 'wide' : 'wide',
      })),
    slopeRun: board.slopeRun ?? Infinity,
    waneShare: waneShareOf(board.wideWidthIn ?? board.widthIn, board.widthIn),
    splitLengthIn: board.splitLengthIn ?? 0,
  };
}

/** Grades a board under whichever book its species belongs to. */
export function grade(board, options = {}) {
  const species = lookupSpecies(board.species);
  const book = ruleBookFor(board.species);

  if (book === RULE_BOOKS.hardwood) {
    const result = gradeBoard(board, options);
    return {
      boardId: board.id,
      species: species.key,
      book,
      grade: result.grade,
      detail: result,
      reasons: result.reasons,
    };
  }

  if (book === RULE_BOOKS.softwood) {
    const result = gradePiece(asStructuralPiece(board));
    return {
      boardId: board.id,
      species: species.key,
      book,
      grade: result.grade,
      detail: result,
      reasons: result.grade === null ? ['no structural grade takes this piece'] : [],
    };
  }

  throw new GradeError(`no grader for rule book ${book}`, { path: 'species' });
}

/** Grades a tally and counts what came out of it. */
export function gradeTally(boards, options = {}) {
  const results = boards.map((board) => grade(board, options));
  const counts = new Map();
  for (const result of results) {
    const key = `${result.book}:${result.grade ?? 'none'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    results,
    byGrade: [...counts.entries()]
      .map(([key, count]) => {
        const [book, gradeName] = key.split(':');
        return { book, grade: gradeName, count };
      })
      .sort((a, b) => b.count - a.count || a.grade.localeCompare(b.grade)),
    ungraded: results.filter((result) => result.grade === null).length,
  };
}

/** Which book a board would be graded under, without grading it. */
export function bookFor(board) {
  return ruleBookFor(board.species);
}
