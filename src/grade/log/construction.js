/**
 * The grades that are not factory grades.
 *
 * A factory log is bought for the clear wood that can be cut out of it. Two
 * other markets buy logs for something else entirely, and neither of them
 * reads a face the way the factory grades do.
 *
 * Veneer is bought for a single continuous sheet peeled or sliced off the
 * whole log, so a defect anywhere on a face ruins the whole face rather than
 * costing a cutting. That is why a veneer log is judged on how many faces are
 * completely clear and not on yield at all.
 *
 * Ties and timbers are bought for one big square piece cut out of the middle.
 * Face quality is irrelevant. What matters is whether a rectangle of the
 * required size fits inside the log once sweep has been taken off, and whether
 * the wood in the middle is sound.
 */

import { GradeError } from '../../errors.js';
import { checklist } from '../../checklist.js';
import { lookupSpecies } from '../../model/species.js';
import { defectType } from '../../scale/defect/types.js';
import { clearCuttings, FACE_COUNT, gradingZone } from './faces.js';
import { round3 } from '../../num.js';

/** Standard tie sizes, largest first. Dimensions are inches. */
export const TIE_SIZES = [
  { name: 'grade 5 tie', thicknessIn: 7, widthIn: 9, minLengthFt: 8.5 },
  { name: 'grade 4 tie', thicknessIn: 7, widthIn: 8, minLengthFt: 8.5 },
  { name: 'grade 3 tie', thicknessIn: 6, widthIn: 8, minLengthFt: 8.5 },
  { name: 'switch tie', thicknessIn: 7, widthIn: 9, minLengthFt: 11 },
];

/** Faults that put a log out of the veneer market whatever else is true. */
const VENEER_EXCLUSIONS = ['ring shake', 'metal in log', 'heart rot', 'sap rot'];

const VENEER = {
  minDiameterIn: 14,
  minLengthFt: 8,
  facesRequired: 3,
  maxSweepIn: 1,
};

/**
 * Whether the log will sell as veneer, and why not if it will not.
 */
export function veneerGrade(log, options = {}) {
  const species = lookupSpecies(log.species);
  const list = checklist()
    .require(species.veneerCandidate, `${species.key} is not a veneer species`)
    .require(
      log.scalingDiameterIn >= VENEER.minDiameterIn,
      `scaling diameter ${log.scalingDiameterIn} is under the ${VENEER.minDiameterIn} inch veneer floor`
    )
    .require(
      log.nominalLengthFt >= VENEER.minLengthFt,
      `length ${log.nominalLengthFt} is under the ${VENEER.minLengthFt} foot veneer floor`
    );

  for (const defect of log.defects ?? []) {
    if (VENEER_EXCLUSIONS.includes(defect.type)) {
      list.add(`${defect.type} puts the log out of the veneer market`);
    }
  }

  const sweep = (log.defects ?? []).find((defect) => defect.type === 'sweep');
  if (sweep) {
    list.require(
      (sweep.depthIn ?? 0) <= VENEER.maxSweepIn,
      `sweep of ${sweep.depthIn} inches is over the ${VENEER.maxSweepIn} inch veneer limit`
    );
  }

  const zone = gradingZone(log, options);
  const clearFaces = [];
  for (let index = 0; index < FACE_COUNT; index += 1) {
    const cuttings = clearCuttings(log, index, options);
    const whole = cuttings.length === 1 && Math.abs(cuttings[0].lengthFt - zone.lengthFt) < 1e-6;
    if (whole) clearFaces.push(index);
  }
  list.require(
    clearFaces.length >= VENEER.facesRequired,
    `${clearFaces.length} entirely clear faces of the ${VENEER.facesRequired} veneer needs`
  );

  return { grade: list.ok ? 'veneer' : null, clearFaces, reasons: list.reasons };
}

/**
 * The largest tie that can be cut out of the log. Sweep is taken off the
 * diameter before the rectangle is fitted, because a swept log cannot hold a
 * straight timber across its whole length.
 */
export function tieGrade(log, options = {}) {
  const { sizes = TIE_SIZES } = options;
  if (!Array.isArray(sizes) || sizes.length === 0) {
    throw new GradeError('tieGrade needs at least one tie size', { path: 'sizes' });
  }

  const reasons = [];
  const sweep = (log.defects ?? []).find((defect) => defect.type === 'sweep');
  const sweepIn = sweep ? (sweep.depthIn ?? 0) : 0;
  const workingDiameter = log.scalingDiameterIn - sweepIn;

  const unsound = (log.defects ?? []).filter((defect) => {
    const entry = defectType(defect.type);
    return entry && !entry.sound && entry.extent !== 'shell';
  });
  if (unsound.length > 0) {
    reasons.push(`unsound wood in the heart: ${unsound.map((d) => d.type).join(', ')}`);
  }

  const fits = sizes
    .filter((size) => log.nominalLengthFt >= size.minLengthFt)
    .filter((size) => diagonalIn(size) <= workingDiameter + 1e-9)
    .sort((a, b) => area(b) - area(a));

  if (fits.length === 0) {
    reasons.push(
      `nothing fits a ${round3(workingDiameter)} inch working diameter over ${log.nominalLengthFt} feet`
    );
  }

  return {
    grade: reasons.length === 0 ? fits[0].name : null,
    size: reasons.length === 0 ? fits[0] : null,
    workingDiameterIn: round3(workingDiameter),
    sweepDeductedIn: sweepIn,
    candidates: fits.map((size) => size.name),
    reasons,
  };
}

/** The corner to corner measurement a rectangle needs inside the log. */
export function diagonalIn(size) {
  return Math.sqrt(size.thicknessIn ** 2 + size.widthIn ** 2);
}

function area(size) {
  return size.thicknessIn * size.widthIn;
}
