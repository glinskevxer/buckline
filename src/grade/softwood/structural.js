/**
 * Structural grading.
 *
 * Every characteristic is read separately and the piece takes the worst answer
 * any one of them gives. There is no averaging and no trading: a piece with
 * select structural knots and number three slope of grain is number three.
 * That is the whole logic of a strength grade, because the piece breaks at its
 * weakest section and nothing elsewhere makes up for it.
 *
 * Slope of grain is the one that catches people. It is written as a ratio, one
 * in twelve for the top grade, and a steeper slope is a smaller second number,
 * so the comparison runs the opposite way to every other limit here.
 */

import { GradeError } from '../../errors.js';
import { round2, round3 } from '../../num.js';
import { STRUCTURAL_GRADES, readClusters, readKnot } from './knots.js';

/** Slope of grain limits, written as the run for one of rise. */
const SLOPE_RUN = { SS: 12, No1: 10, No2: 8, No3: 4 };

/** Wane allowed on a corner, as a fraction of the face it is on. */
const WANE_SHARE = { SS: 0.25, No1: 0.25, No2: 0.33, No3: 0.5 };

/** Split length allowed, as a multiple of the piece width. */
const SPLIT_MULTIPLE = { SS: 1, No1: 1.5, No2: 2, No3: 4 };

/** The best grade a slope of grain qualifies for, or null. */
export function gradeForSlope(run) {
  if (typeof run !== 'number' || !Number.isFinite(run) || run <= 0) {
    throw new GradeError('slope of grain must be a positive run', { path: 'slopeRun' });
  }
  return STRUCTURAL_GRADES.find((grade) => run >= SLOPE_RUN[grade]) ?? null;
}

/** The best grade a wane fraction qualifies for, or null. */
export function gradeForWane(share) {
  if (share < 0) {
    throw new GradeError('wane share must not be negative', { path: 'waneShare' });
  }
  return STRUCTURAL_GRADES.find((grade) => share <= WANE_SHARE[grade] + 1e-9) ?? null;
}

/** The best grade a split qualifies for, given the piece width. */
export function gradeForSplit(splitLengthIn, widthIn) {
  if (splitLengthIn < 0 || widthIn <= 0) {
    throw new GradeError('a split needs a length and a width', { path: 'split' });
  }
  const multiple = splitLengthIn / widthIn;
  return STRUCTURAL_GRADES.find((grade) => multiple <= SPLIT_MULTIPLE[grade] + 1e-9) ?? null;
}

/** The best grade every knot on the piece qualifies for, or null. */
export function gradeForKnots(knots, widthIn) {
  for (const grade of STRUCTURAL_GRADES) {
    const everyKnotPasses = knots.every((knot) => readKnot(knot, grade, widthIn).passes);
    const everyClusterPasses = readClusters(knots, grade, widthIn).every(
      (cluster) => cluster.passes
    );
    if (everyKnotPasses && everyClusterPasses) return grade;
  }
  return null;
}

/**
 * Grades a piece. Each characteristic is read on its own and the piece takes
 * the worst, with the governing characteristic named so a mill can see what
 * is costing it grade.
 */
export function gradePiece(piece) {
  const { widthIn, knots = [], slopeRun = Infinity, waneShare = 0, splitLengthIn = 0 } = piece;
  if (typeof widthIn !== 'number' || widthIn <= 0) {
    throw new GradeError('a piece needs a width', { path: 'widthIn' });
  }

  const readings = [
    { characteristic: 'knots', grade: gradeForKnots(knots, widthIn) },
    {
      characteristic: 'slope of grain',
      grade: Number.isFinite(slopeRun) ? gradeForSlope(slopeRun) : STRUCTURAL_GRADES[0],
    },
    { characteristic: 'wane', grade: gradeForWane(waneShare) },
    { characteristic: 'splits', grade: gradeForSplit(splitLengthIn, widthIn) },
  ];

  const worstIndex = readings.reduce((worst, reading) => {
    const index =
      reading.grade === null ? STRUCTURAL_GRADES.length : STRUCTURAL_GRADES.indexOf(reading.grade);
    return Math.max(worst, index);
  }, 0);

  const grade = worstIndex >= STRUCTURAL_GRADES.length ? null : STRUCTURAL_GRADES[worstIndex];
  const governing = readings.filter((reading) => {
    const index =
      reading.grade === null ? STRUCTURAL_GRADES.length : STRUCTURAL_GRADES.indexOf(reading.grade);
    return index === worstIndex;
  });

  return {
    grade,
    readings,
    governedBy: governing.map((reading) => reading.characteristic),
    economyOnly: grade === null,
  };
}

/**
 * What the piece would grade if one characteristic were fixed. This is the
 * question a mill actually asks: is it worth resawing to lose the wane, and
 * what would that buy.
 */
export function gradeWithout(piece, characteristic) {
  const clean = { ...piece };
  switch (characteristic) {
    case 'knots':
      clean.knots = [];
      break;
    case 'slope of grain':
      clean.slopeRun = Infinity;
      break;
    case 'wane':
      clean.waneShare = 0;
      break;
    case 'splits':
      clean.splitLengthIn = 0;
      break;
    default:
      throw new GradeError(`nothing called ${characteristic} is graded here`, {
        path: 'characteristic',
      });
  }
  return gradePiece(clean);
}

/** How much of the width is lost to wane, as a fraction. */
export function waneShareOf(nominalWidthIn, actualWidthIn) {
  if (nominalWidthIn <= 0) return 0;
  return round3(Math.max(0, nominalWidthIn - actualWidthIn) / nominalWidthIn);
}

/** Slope of grain from a deviation measured over a run. */
export function slopeRunFrom(deviationIn, overIn) {
  if (deviationIn <= 0) return Infinity;
  return round2(overIn / deviationIn);
}
