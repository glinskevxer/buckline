/**
 * The trimmer.
 *
 * The last decision before the green chain: cut the board back to a shorter
 * standard length to lose a defect, or leave it long and take the grade. It is
 * the same trade the edger makes, one dimension over, and it is worse in one
 * respect: length classes are two feet apart, so trimming throws away a lot at
 * once and there is no fine adjustment.
 *
 * Trimming the wrong end matters too. A defect two feet in from one end costs
 * two feet if you trim that end and ten if you trim the other, and a trimmer
 * that only cuts the tail end throws the difference away all day.
 */

import { round2, round4 } from '../num.js';
import { boardFeet } from '../units.js';
import { surfaceMeasure } from '../model/board.js';
import { LUMBER_GRADES, dimensionsAllow } from '../grade/lumber/spec.js';
import { searchCuttings } from '../grade/lumber/cutting-search.js';
import { lumberSpec, allowancesFor, requiredUnits } from '../grade/lumber/spec.js';
import { MillError } from './pattern.js';

/** Standard trimmed lengths, shortest first. */
export const TRIM_LENGTHS = [4, 6, 8, 10, 12, 14, 16];

/** Every piece the trimmer could make out of a board, either end. */
export function trimOptions(board, options = {}) {
  const { lengths = TRIM_LENGTHS } = options;
  const out = [{ fromFt: 0, toFt: board.lengthFt, lengthFt: board.lengthFt, trimmed: 'nothing' }];

  for (const length of lengths) {
    if (length >= board.lengthFt - 1e-9) continue;
    out.push({ fromFt: 0, toFt: length, lengthFt: length, trimmed: 'tail' });
    out.push({
      fromFt: round2(board.lengthFt - length),
      toFt: board.lengthFt,
      lengthFt: length,
      trimmed: 'butt',
    });
  }
  return out;
}

/** A board cut down to one of those pieces, defects moved with it. */
export function pieceOf(board, option) {
  const defects = (board.defects ?? [])
    .filter(
      (defect) =>
        defect.startFt < option.toFt - 1e-9 &&
        defect.startFt + defect.lengthFt > option.fromFt + 1e-9
    )
    .map((defect) => ({
      ...defect,
      startFt: round2(Math.max(0, defect.startFt - option.fromFt)),
      lengthFt: round2(
        Math.min(option.toFt, defect.startFt + defect.lengthFt) -
          Math.max(option.fromFt, defect.startFt)
      ),
    }));

  return {
    ...board,
    lengthFt: option.lengthFt,
    surfaceMeasure: surfaceMeasure(board.widthIn, option.lengthFt),
    boardFeet: round2(boardFeet(board.thicknessIn, board.widthIn, option.lengthFt)),
    defects,
  };
}

/**
 * The best grade one face of a piece will make. This is the cheap version of
 * the full grader: it reads one face under each grade's own allowance and
 * stops at the first that yields enough.
 */
export function quickGrade(piece, face = 0) {
  for (const grade of LUMBER_GRADES) {
    if (!dimensionsAllow(grade, piece).allowed) continue;
    const spec = lumberSpec(grade);
    for (const allowance of allowancesFor(grade, piece.surfaceMeasure)) {
      const found = searchCuttings(piece, face, {
        maxCuttings: allowance.maxCuttings,
        minSizes: spec.minCuttingSizes,
      });
      if (found.units >= requiredUnits(piece.surfaceMeasure, allowance) - 1e-9) {
        return grade;
      }
    }
  }
  return null;
}

/** Every trim priced. */
export function trimValues(board, prices, options = {}) {
  if (!(board.lengthFt > 0) || !(board.widthIn > 0)) {
    throw new MillError('a board needs a length and a width to trim', { path: 'board' });
  }
  return trimOptions(board, options)
    .map((option) => {
      const piece = pieceOf(board, option);
      const grade = quickGrade(piece, options.face ?? 0);
      const perMbf = grade === null ? 0 : (prices[grade] ?? 0);
      return {
        ...option,
        grade,
        boardFeet: piece.boardFeet,
        perMbf,
        value: round2((piece.boardFeet / 1000) * perMbf),
      };
    })
    .sort((a, b) => b.value - a.value || b.lengthFt - a.lengthFt);
}

/**
 * The trim to make, with what leaving the board alone would have been worth,
 * so an operator can see whether trimming paid.
 */
export function bestTrim(board, prices, options = {}) {
  const rows = trimValues(board, prices, options);
  const best = rows[0];
  const untrimmed = rows.find((row) => row.trimmed === 'nothing');
  return {
    best,
    untrimmed,
    gain: round2(best.value - untrimmed.value),
    gainShare: untrimmed.value > 0 ? round4((best.value - untrimmed.value) / untrimmed.value) : 0,
    worthTrimming: best.value > untrimmed.value + 1e-9,
    rows,
  };
}

/** What a trimmer that only ever cuts the tail end gives up. */
export function costOfOneEnded(board, prices, options = {}) {
  const rows = trimValues(board, prices, options);
  const bothEnds = rows[0];
  const tailOnly = rows.filter((row) => row.trimmed !== 'butt')[0];
  return {
    bothEnds,
    tailOnly,
    lostValue: round2(bothEnds.value - tailOnly.value),
    mattersHere: bothEnds.trimmed === 'butt' && bothEnds.value > tailOnly.value + 1e-9,
  };
}
