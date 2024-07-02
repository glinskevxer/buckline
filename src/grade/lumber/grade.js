/**
 * Grading a board.
 *
 * The board is offered at each grade in turn, best first, and the first one it
 * makes is the grade it gets. Within a grade it is offered under each
 * allowance the table gives, because taking an extra cutting for a higher
 * yield is a real alternative and not a fallback: a board can fail the plain
 * allowance and pass the extra one, and it can fail the extra one and pass the
 * plain one. Both have to be tried.
 *
 * The one face grades are graded twice. The better face is read against FAS
 * and the poor face against number one common, and which face is which is
 * decided by reading both and keeping the better answer. A board is never
 * turned over by the grader to suit the paperwork.
 */

import { GradeError } from '../../errors.js';
import { round3 } from '../../num.js';
import {
  LUMBER_GRADES,
  allowancesFor,
  dimensionsAllow,
  lumberSpec,
  requiredUnits,
} from './spec.js';
import { searchCuttings } from './cutting-search.js';

/**
 * Reads one face against one grade under every allowance and keeps the best
 * result. Returns the working even when the face fails.
 */
export function readFaceAtGrade(board, face, grade) {
  const spec = lumberSpec(grade);
  const allowances = allowancesFor(grade, board.surfaceMeasure);
  if (allowances.length === 0) {
    return {
      grade,
      face,
      meets: false,
      units: 0,
      required: null,
      allowance: null,
      cuttings: [],
      reason: `surface measure ${board.surfaceMeasure} is off the ${grade} table`,
    };
  }

  let best = null;
  for (const allowance of allowances) {
    const found = searchCuttings(board, face, {
      maxCuttings: allowance.maxCuttings,
      minSizes: spec.minCuttingSizes,
    });
    const required = requiredUnits(board.surfaceMeasure, allowance);
    const meets = found.units >= required - 1e-9;
    const attempt = {
      grade,
      face,
      meets,
      units: found.units,
      required: round3(required),
      shortBy: meets ? 0 : round3(required - found.units),
      allowance,
      cuttings: found.cuttings,
      reason: meets
        ? null
        : `${found.units} cutting units of the ${round3(required)} ${grade} needs`,
    };
    if (
      !best ||
      (attempt.meets && !best.meets) ||
      (attempt.meets === best.meets && attempt.units > best.units)
    ) {
      best = attempt;
    }
    if (meets && !allowance.extra) break;
  }
  return best;
}

/** Tests a whole board at one grade, both faces where the grade wants both. */
export function meetsLumberGrade(board, grade) {
  const spec = lumberSpec(grade);
  const dimensions = dimensionsAllow(grade, board);
  if (!dimensions.allowed) {
    return { grade, meets: false, reasons: dimensions.reasons, faces: [] };
  }

  const front = readFaceAtGrade(board, 0, grade);
  const back = readFaceAtGrade(board, 1, grade);

  if (spec.backFace === null) {
    const better = front.units >= back.units ? front : back;
    return {
      grade,
      meets: better.meets,
      reasons: better.meets ? [] : [better.reason],
      faces: [better],
      betterFace: better.face,
    };
  }

  const frontIsBetter = front.units >= back.units;
  const better = frontIsBetter ? front : back;
  const poorFace = frontIsBetter ? 1 : 0;
  const poor = readFaceAtGrade(board, poorFace, spec.backFace);

  const reasons = [];
  if (!better.meets) reasons.push(`better face: ${better.reason}`);
  if (!poor.meets) reasons.push(`back face: ${poor.reason}`);

  return {
    grade,
    meets: reasons.length === 0,
    reasons,
    faces: [better, poor],
    betterFace: better.face,
  };
}

/** The best grade the board makes, with what every grade said. */
export function gradeBoard(board, options = {}) {
  const { grades = LUMBER_GRADES } = options;
  if (!Array.isArray(grades) || grades.length === 0) {
    throw new GradeError('gradeBoard needs at least one grade to try', { path: 'grades' });
  }

  const attempts = [];
  for (const grade of grades) {
    const attempt = meetsLumberGrade(board, grade);
    attempts.push(attempt);
    if (attempt.meets) {
      return {
        boardId: board.id,
        grade,
        surfaceMeasure: board.surfaceMeasure,
        boardFeet: board.boardFeet,
        attempts,
        reasons: [],
      };
    }
  }

  return {
    boardId: board.id,
    grade: null,
    surfaceMeasure: board.surfaceMeasure,
    boardFeet: board.boardFeet,
    attempts,
    reasons: attempts.at(-1).reasons,
  };
}
