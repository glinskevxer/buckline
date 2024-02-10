/**
 * The Scribner Decimal C log rule.
 *
 * Scribner is a diagram rule. Somebody drew boards inside circles on paper in
 * 1846 and wrote down how many fitted, so there is no formula behind it and no
 * amount of algebra will reproduce it. The numbers have to be carried as a
 * table, and they are not smooth. Nineteen and twenty inch logs each gain
 * forty board feet over the class below them where the classes either side
 * gain twenty, and that step is in the diagram, not in the wood.
 *
 * Decimal C is Scribner rounded to the nearest ten board feet and written with
 * the last digit dropped, so a scaler writes 16 for a log that scales 160. The
 * table below is held in whole board feet and the decimal form is produced on
 * the way out.
 *
 * Lengths other than sixteen feet are prorated off the sixteen foot column.
 * The mill has always done it that way and the settlement clerk expects it.
 */

const SIXTEEN_FOOT_COLUMN = {
  6: 10,
  7: 20,
  8: 30,
  9: 40,
  10: 60,
  11: 70,
  12: 80,
  13: 100,
  14: 110,
  15: 140,
  16: 160,
  17: 180,
  18: 200,
  19: 240,
  20: 280,
  21: 300,
  22: 330,
  23: 360,
  24: 400,
  25: 430,
  26: 460,
  27: 500,
  28: 540,
  29: 570,
  30: 610,
  31: 640,
  32: 690,
  33: 730,
  34: 780,
  35: 830,
  36: 870,
  37: 910,
  38: 960,
  39: 1010,
  40: 1060,
};

const BASIS_FT = 16;

export const id = 'scribner';
export const label = 'Scribner Decimal C';
export const deductionMethod = 'diameter';
export const segmentFt = null;
export const roundsTo = 10;
export const smallestDiameterIn = 6;
export const largestDiameterIn = 40;

/** The sixteen foot table entry, or null outside the table. */
export function tableEntry(diameterIn) {
  requireNumber('diameterIn', diameterIn);
  const whole = Math.floor(diameterIn);
  return Object.prototype.hasOwnProperty.call(SIXTEEN_FOOT_COLUMN, whole)
    ? SIXTEEN_FOOT_COLUMN[whole]
    : null;
}

/**
 * Board feet for one log, unrounded and prorated off the sixteen foot column.
 * A diameter below the table scales at nothing; a diameter above it is held at
 * the top entry, because the yard will not take a log that big without a
 * separate negotiation anyway.
 */
export function gross(diameterIn, lengthFt) {
  requireNumber('diameterIn', diameterIn);
  requireNumber('lengthFt', lengthFt);
  const whole = Math.floor(diameterIn);
  if (whole < smallestDiameterIn) return 0;
  const clamped = Math.min(whole, largestDiameterIn);
  return (SIXTEEN_FOOT_COLUMN[clamped] * lengthFt) / BASIS_FT;
}

/** Board feet as the ticket writes them, rounded to the nearest ten. */
export function scale(diameterIn, lengthFt) {
  return Math.round(gross(diameterIn, lengthFt) / roundsTo) * roundsTo;
}

/** The same figure written the way a scaler writes it, with the zero dropped. */
export function decimalC(diameterIn, lengthFt) {
  return scale(diameterIn, lengthFt) / roundsTo;
}

/** Every diameter the table carries, ascending. */
export function tableDiameters() {
  return Object.keys(SIXTEEN_FOOT_COLUMN)
    .map(Number)
    .sort((a, b) => a - b);
}

/** A printed scale stick column for one length. */
export function column(lengthFt, options = {}) {
  const { from = smallestDiameterIn, to = largestDiameterIn } = options;
  const out = [];
  for (let d = from; d <= to; d += 1) {
    out.push({ diameterIn: d, boardFeet: scale(d, lengthFt), decimalC: decimalC(d, lengthFt) });
  }
  return out;
}

function requireNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  if (value < 0) {
    throw new RangeError(`${name} must not be negative, got ${value}`);
  }
}
