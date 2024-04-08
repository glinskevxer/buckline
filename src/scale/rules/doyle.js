/**
 * The Doyle log rule.
 *
 * Doyle is a formula rule and a bad one. It subtracts four inches from the
 * scaling diameter for slab and edging loss, squares what is left, and divides
 * by sixteen. That is a fixed allowance applied to a log of any size, so it
 * takes a punishing share out of a small log and almost nothing out of a large
 * one. A twelve inch log scales barely half of what it will actually saw. A
 * thirty inch log scales more than it will saw.
 *
 * It is still the rule most southern hardwood is bought on, because it favours
 * the buyer on exactly the sizes most timber comes in. buckline implements it
 * because the settlement has to match the contract, not because it is right.
 */

import { requireNonNegative } from '../../num.js';

const SLAB_ALLOWANCE_IN = 4;
const DIVISOR = 16;

export const id = 'doyle';
export const label = 'Doyle';
export const deductionMethod = 'squared';
export const segmentFt = null;
export const roundsTo = 1;
export const smallestDiameterIn = 6;

/**
 * Board feet for one log, unrounded. Diameters at or under the slab allowance
 * return zero rather than a negative volume, which is what the squared form
 * would otherwise produce.
 */
export function gross(diameterIn, lengthFt) {
  requireNonNegative('diameterIn', diameterIn);
  requireNonNegative('lengthFt', lengthFt);
  if (diameterIn <= SLAB_ALLOWANCE_IN) return 0;
  const side = diameterIn - SLAB_ALLOWANCE_IN;
  return ((side * side) / DIVISOR) * lengthFt;
}

/** Board feet as the ticket writes them, rounded to the nearest board foot. */
export function scale(diameterIn, lengthFt) {
  return Math.round(gross(diameterIn, lengthFt));
}

/**
 * The share of a log that Doyle throws away as slab, as a fraction of the
 * cross section. This is the number that shows why the rule behaves the way it
 * does, and the recovery study uses it directly.
 */
export function slabShare(diameterIn) {
  requireNonNegative('diameterIn', diameterIn);
  if (diameterIn <= 0) return 1;
  if (diameterIn <= SLAB_ALLOWANCE_IN) return 1;
  const inscribed = diameterIn - SLAB_ALLOWANCE_IN;
  return 1 - (inscribed * inscribed) / (diameterIn * diameterIn);
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
