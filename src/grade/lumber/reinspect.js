/**
 * Reinspection.
 *
 * A car of lumber is sold on a grade and the buyer has it reinspected. Nobody
 * expects every board to make the grade: graders work at a board every two
 * seconds and a shipment is bought on the whole, not on the worst piece in it.
 * So a tolerance exists, and it is a share of the footage rather than a share
 * of the pieces, because a shipment carried on ten bad wide boards is a
 * different problem from one carried on forty bad narrow ones.
 *
 * Two things are checked and they are separate. How much of the footage fell
 * below grade, and how far below the worst of it fell. A shipment inside the
 * footage tolerance still fails if a piece is two grades down, because that is
 * not a grader working fast, it is the wrong pack.
 */

import { round2, round4 } from '../../num.js';
import { GradeError } from '../../errors.js';
import { LUMBER_GRADES } from './spec.js';

/** How much off grade footage a shipment may carry, by the grade it was sold on. */
const FOOTAGE_TOLERANCE = {
  FAS: 0.05,
  F1F: 0.05,
  SEL: 0.05,
  '1C': 0.1,
  '2AC': 0.1,
  '3AC': 0.15,
};

/** Grades below a grade, worst last. */
export function gradesBelow(grade) {
  const index = LUMBER_GRADES.indexOf(grade);
  if (index === -1) {
    throw new GradeError(`no lumber grade called ${grade}`, { path: 'grade' });
  }
  return LUMBER_GRADES.slice(index + 1);
}

/** How many grades below the sold grade a piece fell, or zero if it made it. */
export function gradesShort(soldAs, gradedAs) {
  const sold = LUMBER_GRADES.indexOf(soldAs);
  if (sold === -1) {
    throw new GradeError(`no lumber grade called ${soldAs}`, { path: 'soldAs' });
  }
  if (gradedAs === null || gradedAs === undefined) {
    return LUMBER_GRADES.length - sold;
  }
  const got = LUMBER_GRADES.indexOf(gradedAs);
  if (got === -1) {
    throw new GradeError(`no lumber grade called ${gradedAs}`, { path: 'gradedAs' });
  }
  return Math.max(0, got - sold);
}

/**
 * The tolerance a shipment is judged against. Green stock is allowed a little
 * more, because a board that will make the grade once it has dried and been
 * surfaced cannot be read at the green chain.
 */
export function toleranceFor(soldAs, options = {}) {
  const { green = false, maxGradesShort = 1 } = options;
  const base = FOOTAGE_TOLERANCE[soldAs];
  if (base === undefined) {
    throw new GradeError(`no reinspection tolerance for ${soldAs}`, { path: 'soldAs' });
  }
  return {
    soldAs,
    footageShare: green ? round4(base * 1.5) : base,
    maxGradesShort,
    green,
  };
}

/**
 * Reinspects a shipment. `pieces` are the reinspection results, each with the
 * grade it actually made and its footage.
 */
export function reinspect(soldAs, pieces, options = {}) {
  if (!Array.isArray(pieces) || pieces.length === 0) {
    throw new GradeError('a reinspection needs pieces', { path: 'pieces' });
  }
  const tolerance = toleranceFor(soldAs, options);

  let totalFeet = 0;
  let shortFeet = 0;
  let worstShort = 0;
  const offGrade = [];

  for (const piece of pieces) {
    const feet = piece.boardFeet ?? 0;
    totalFeet += feet;
    const short = gradesShort(soldAs, piece.grade);
    if (short > 0) {
      shortFeet += feet;
      worstShort = Math.max(worstShort, short);
      offGrade.push({ id: piece.id ?? null, grade: piece.grade ?? 'none', boardFeet: feet, short });
    }
  }

  const share = totalFeet > 0 ? shortFeet / totalFeet : 0;
  const withinFootage = share <= tolerance.footageShare + 1e-9;
  const withinDepth = worstShort <= tolerance.maxGradesShort;

  const reasons = [];
  if (!withinFootage) {
    reasons.push(
      `${Math.round(share * 1000) / 10} percent of the footage is off grade, over the ${Math.round(tolerance.footageShare * 1000) / 10} percent allowed`
    );
  }
  if (!withinDepth) {
    reasons.push(`a piece graded ${worstShort} grades below ${soldAs}`);
  }

  return {
    soldAs,
    tolerance,
    pieces: pieces.length,
    totalBoardFeet: round2(totalFeet),
    offGradeBoardFeet: round2(shortFeet),
    offGradeShare: round4(share),
    worstGradesShort: worstShort,
    offGrade,
    holds: reasons.length === 0,
    reasons,
  };
}

/**
 * What the shipment is worth if it is regraded rather than rejected. A car
 * that fails reinspection is usually settled at a blended price rather than
 * sent back, because the freight is already spent.
 */
export function blendedGrade(result, pricePerGrade) {
  const onGradeFeet = round2(result.totalBoardFeet - result.offGradeBoardFeet);
  const soldPrice = pricePerGrade[result.soldAs];
  if (soldPrice === undefined) {
    throw new GradeError(`no price for the sold grade ${result.soldAs}`, { path: 'pricePerGrade' });
  }

  let value = (onGradeFeet / 1000) * soldPrice;
  for (const piece of result.offGrade) {
    const price = pricePerGrade[piece.grade];
    if (price === undefined) {
      throw new GradeError(`no price for ${piece.grade}, which the reinspection found`, {
        path: 'pricePerGrade',
      });
    }
    value += (piece.boardFeet / 1000) * price;
  }

  const asSold = (result.totalBoardFeet / 1000) * soldPrice;
  return {
    asSold: round2(asSold),
    blended: round2(value),
    allowance: round2(asSold - value),
    blendedPerMbf: result.totalBoardFeet > 0 ? round2((value / result.totalBoardFeet) * 1000) : 0,
  };
}
