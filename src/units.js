/**
 * Unit handling for a log yard.
 *
 * Everything upstream of the saw is measured in inches and feet, everything
 * downstream is measured in board feet, and the two only meet through a log
 * rule. This module holds the conversions that are not opinionated. Anything
 * that involves a choice about how a log is measured belongs in src/measure.
 */

import { requireFinite, requirePositive } from './num.js';

/** A board foot is 144 cubic inches of lumber. */
export const CUBIC_INCHES_PER_BOARD_FOOT = 144;

/** Log rules and price lists are quoted per thousand board feet. */
export const BOARD_FEET_PER_MBF = 1000;

/** Nominal lumber thickness is written in quarters of an inch. */
export const QUARTERS_PER_INCH = 4;

const CUBIC_FEET_PER_CORD = 128;

/**
 * Board feet of a rectangular piece measured in inches of thickness and width
 * and feet of length. This is the mill floor formula, not the log rule.
 */
export function boardFeet(thicknessIn, widthIn, lengthFt) {
  requirePositive('thicknessIn', thicknessIn);
  requirePositive('widthIn', widthIn);
  requirePositive('lengthFt', lengthFt);
  return (thicknessIn * widthIn * lengthFt) / 12;
}

/** Cubic feet of a rectangular piece, used for chip and residue accounting. */
export function cubicFeet(thicknessIn, widthIn, lengthFt) {
  requirePositive('thicknessIn', thicknessIn);
  requirePositive('widthIn', widthIn);
  requirePositive('lengthFt', lengthFt);
  return (thicknessIn * widthIn * lengthFt) / 144;
}

/** Cubic feet of a cylinder of the given diameter in inches and length in feet. */
export function cylinderCubicFeet(diameterIn, lengthFt) {
  requirePositive('diameterIn', diameterIn);
  requirePositive('lengthFt', lengthFt);
  const radiusFt = diameterIn / 24;
  return Math.PI * radiusFt * radiusFt * lengthFt;
}

export function toMbf(bf) {
  requireFinite('bf', bf);
  return bf / BOARD_FEET_PER_MBF;
}

export function fromMbf(mbf) {
  requireFinite('mbf', mbf);
  return mbf * BOARD_FEET_PER_MBF;
}

export function cordsFromCubicFeet(cubic) {
  requireFinite('cubic', cubic);
  return cubic / CUBIC_FEET_PER_CORD;
}

/**
 * Nominal thickness written the way a tally sheet writes it. 1 inch is 4/4,
 * 1.25 inch is 5/4, and so on. Anything that is not a clean quarter is a
 * mistake somewhere upstream, so it throws rather than rounding quietly.
 */
export function quarters(thicknessIn) {
  requirePositive('thicknessIn', thicknessIn);
  const q = thicknessIn * QUARTERS_PER_INCH;
  if (Math.abs(q - Math.round(q)) > 1e-9) {
    throw new RangeError(`thickness ${thicknessIn} is not a whole quarter`);
  }
  return Math.round(q);
}

export function inchesFromQuarters(q) {
  requirePositive('q', q);
  if (!Number.isInteger(q)) {
    throw new RangeError(`quarters must be a whole number, got ${q}`);
  }
  return q / QUARTERS_PER_INCH;
}

/** Formats a quarter thickness the way it is written on a package tag. */
export function formatQuarters(q) {
  return `${q}/4`;
}
