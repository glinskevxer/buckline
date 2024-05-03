/**
 * The board record.
 *
 * A board comes off the saw with a thickness in quarters, a width that varies
 * along its length because the log was round, and a length in feet. Grading
 * reads it as a rectangle, so the width the grader uses is the narrowest
 * point, not the average and not the widest.
 *
 * Surface measure is the number every hardwood grade rule is built on. It is
 * the face area in square feet, and it is deliberately blind to thickness: a
 * four quarter board and an eight quarter board of the same face are the same
 * surface measure and are graded by the same table.
 */

import { boardFeet, quarters } from '../units.js';
import { round2, round3 } from '../num.js';
import { list, number, object, string, validate } from '../valid/check.js';

const defectSchema = object({
  type: string(),
  face: number({ integer: true, min: 0, max: 1, default: 0 }),
  startFt: number({ min: 0 }),
  lengthFt: number({ min: 0 }),
  fromEdgeIn: number({ min: 0, default: 0 }),
  widthIn: number({ min: 0 }),
});

const boardSchema = {
  id: string(),
  species: string(),
  thicknessIn: number({ min: 0.25 }),
  widthIn: number({ min: 1 }),
  wideWidthIn: number({ min: 1, optional: true }),
  lengthFt: number({ min: 1 }),
  moisturePct: number({ min: 0, max: 200, optional: true }),
  defects: list(defectSchema, { default: () => [] }),
  logId: string({ optional: true }),
};

/**
 * Surface measure in square feet. Width in inches times length in feet over
 * twelve, with a half or more counting as one whole foot and less than a half
 * dropped. That rounding is written into the rule book, not a convenience.
 */
export function surfaceMeasure(widthIn, lengthFt) {
  const raw = (widthIn * lengthFt) / 12;
  const whole = Math.floor(raw);
  return raw - whole >= 0.5 - 1e-9 ? whole + 1 : whole;
}

/**
 * Cutting units for a piece of board. One unit is one inch of width by one
 * foot of length, so a four inch by three foot cutting is twelve units. Grade
 * requirements are quoted as units per surface measure, which is why the two
 * have to be counted in the same money.
 */
export function cuttingUnits(widthIn, lengthFt) {
  return round3(widthIn * lengthFt);
}

/** Reads a raw tally line into a board record. */
export function makeBoard(raw) {
  const checked = validate(raw, boardSchema, { label: 'board' });
  const wide = checked.wideWidthIn ?? checked.widthIn;
  if (wide < checked.widthIn) {
    throw new RangeError(`board ${checked.id} is wider at its narrow point than its wide point`);
  }

  return {
    ...checked,
    wideWidthIn: wide,
    quarters: quarters(checked.thicknessIn),
    surfaceMeasure: surfaceMeasure(checked.widthIn, checked.lengthFt),
    boardFeet: round2(boardFeet(checked.thicknessIn, checked.widthIn, checked.lengthFt)),
    totalUnits: cuttingUnits(checked.widthIn, checked.lengthFt),
    wane: round2(wanePercent(checked.widthIn, wide)),
  };
}

/**
 * How much of the board's width is missing at the narrow point, as a
 * percentage of the wide point. This is the number a wane allowance is written
 * against.
 */
export function wanePercent(narrowIn, wideIn) {
  if (wideIn <= 0) return 0;
  return ((wideIn - narrowIn) / wideIn) * 100;
}

/** Board feet of a whole tally, summed piece by piece. */
export function tallyBoardFeet(boards) {
  return round2(boards.reduce((total, board) => total + board.boardFeet, 0));
}

/** A short line for a tally sheet. */
export function describeBoard(board) {
  return `${board.id} ${board.quarters}/4 ${board.widthIn}in x ${board.lengthFt}ft sm ${board.surfaceMeasure}`;
}
