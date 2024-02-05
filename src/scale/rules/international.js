/**
 * The International quarter inch log rule.
 *
 * This is the only common rule that was derived rather than guessed at. It
 * walks the log in four foot sections, works out the volume of each section
 * from its own small end diameter, and adds half an inch of taper between one
 * section and the next. The quarter inch in the name is the saw kerf it
 * assumes.
 *
 * Because it accounts for taper and for a real kerf, it tracks what a log
 * actually saws to within a few percent across every size. That makes it the
 * rule to use for a recovery study even when the settlement is written on
 * something else.
 */

const SECTION_FT = 4;
const TAPER_PER_SECTION_IN = 0.5;
const A = 0.199;
const B = 0.642;

export const id = 'international';
export const label = 'International 1/4 inch';
export const deductionMethod = 'length';
export const segmentFt = SECTION_FT;
export const roundsTo = 5;
export const smallestDiameterIn = 5;

/** Volume of one full four foot section from its own small end diameter. */
export function sectionVolume(diameterIn) {
  requireNumber('diameterIn', diameterIn);
  const value = A * diameterIn * diameterIn - B * diameterIn;
  return value > 0 ? value : 0;
}

/**
 * Board feet for one log, unrounded. A length that is not a multiple of four
 * feet gets a prorated last section, which is what the published tables do for
 * the odd lengths.
 */
export function gross(diameterIn, lengthFt) {
  requireNumber('diameterIn', diameterIn);
  requireNumber('lengthFt', lengthFt);
  if (lengthFt === 0) return 0;

  let total = 0;
  let remaining = lengthFt;
  let sectionSmallEnd = diameterIn;

  while (remaining > 1e-9) {
    const span = Math.min(SECTION_FT, remaining);
    total += sectionVolume(sectionSmallEnd) * (span / SECTION_FT);
    remaining -= span;
    sectionSmallEnd += TAPER_PER_SECTION_IN;
  }
  return total;
}

/** Board feet as the ticket writes them, rounded to the nearest five. */
export function scale(diameterIn, lengthFt) {
  return Math.round(gross(diameterIn, lengthFt) / roundsTo) * roundsTo;
}

/** The section by section breakdown, small end first, for an audit. */
export function sections(diameterIn, lengthFt) {
  requireNumber('diameterIn', diameterIn);
  requireNumber('lengthFt', lengthFt);
  const out = [];
  let remaining = lengthFt;
  let sectionSmallEnd = diameterIn;
  let index = 0;

  while (remaining > 1e-9) {
    const span = Math.min(SECTION_FT, remaining);
    out.push({
      index,
      lengthFt: round3(span),
      smallEndIn: round3(sectionSmallEnd),
      boardFeet: round3(sectionVolume(sectionSmallEnd) * (span / SECTION_FT)),
    });
    remaining -= span;
    sectionSmallEnd += TAPER_PER_SECTION_IN;
    index += 1;
  }
  return out;
}

/** A printed scale stick column: board feet by diameter for one length. */
export function column(lengthFt, options = {}) {
  const { from = smallestDiameterIn, to = 40 } = options;
  const out = [];
  for (let d = from; d <= to; d += 1) {
    out.push({ diameterIn: d, boardFeet: scale(d, lengthFt) });
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

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
