/**
 * The log record.
 *
 * This is what a scaler hands over: an identity, a species, two tape readings,
 * a length off the stick, where in the tree it came from, and a list of what
 * is wrong with it. Nothing here computes a volume. The record holds the
 * measurements and the measurement conventions that produced them, so that a
 * scale can be recomputed from the ticket months later under a different rule
 * and come out the same way twice.
 */

import { round3, round4 } from '../num.js';

import { lookupSpecies } from './species.js';
import { scalingDiameter } from '../measure/diameter.js';
import { scalingLength } from '../measure/length.js';
import { taperRate } from '../measure/taper.js';
import { list, number, object, string, validate } from '../valid/check.js';

/** Where in the stem the log was cut from. It moves the log grade. */
export const LOG_POSITIONS = ['butt', 'second', 'upper'];

const defectSchema = object({
  type: string(),
  faceIndex: number({ integer: true, min: 0, max: 3, optional: true }),
  startFt: number({ min: 0, optional: true }),
  lengthFt: number({ min: 0, optional: true }),
  widthIn: number({ min: 0, optional: true }),
  depthIn: number({ min: 0, optional: true }),
  severity: string({ optional: true }),
});

const logSchema = {
  id: string(),
  species: string(),
  position: string({ oneOf: LOG_POSITIONS, default: 'upper' }),
  axesIn: list(number({ min: 1 }), { minLength: 1 }),
  largeEndIn: number({ min: 1, optional: true }),
  measuredLengthFt: number({ min: 1 }),
  defects: list(defectSchema, { default: () => [] }),
  tractId: string({ optional: true }),
  loadId: string({ optional: true }),
  scaledBy: string({ optional: true }),
  scaledAt: string({ optional: true }),
};

/**
 * Reads a raw ticket line into a log record, filling in the derived
 * measurements. `options` carries the yard conventions that were in force when
 * the log was scaled, and they are recorded on the log so a recomputation
 * cannot silently use today's conventions on last year's stick.
 */
export function makeLog(raw, options = {}) {
  const { convention = 'average', rounding = 'down', trimPolicy = 'hardwood' } = options;

  const checked = validate(raw, logSchema, { label: 'log' });
  const species = lookupSpecies(checked.species);

  const diameter = scalingDiameter(checked.axesIn, {
    convention,
    rounding,
    species: species.key,
  });
  const length = scalingLength(checked.measuredLengthFt, { policy: trimPolicy });

  const record = {
    id: checked.id,
    species: species.key,
    speciesGroup: species.group,
    position: checked.position,
    axesIn: checked.axesIn.slice(),
    largeEndIn: checked.largeEndIn ?? null,
    measuredLengthFt: checked.measuredLengthFt,
    defects: checked.defects,
    tractId: checked.tractId ?? null,
    loadId: checked.loadId ?? null,
    scaledBy: checked.scaledBy ?? null,
    scaledAt: checked.scaledAt ?? null,
    conventions: {
      convention: diameter.convention,
      rounding: diameter.rounding,
      trimPolicy: length.policy,
    },
    scalingDiameterIn: diameter.scalingDiameter,
    insideBarkIn: round3(diameter.insideBark),
    nominalLengthFt: length.nominalFt,
    trimIn: length.trimIn,
    overlengthIn: length.overlengthIn,
    merchantable: length.merchantable,
  };

  record.taperPerFoot = deriveTaper(record);
  return record;
}

function deriveTaper(record) {
  if (record.largeEndIn === null || record.nominalLengthFt <= 0) return null;
  const smallEnd = record.insideBarkIn;
  if (record.largeEndIn < smallEnd) return null;
  return round4(taperRate(smallEnd, record.largeEndIn, record.nominalLengthFt));
}

/** True when the log is a butt log, which several grade rules care about. */
export function isButtLog(record) {
  return record.position === 'butt';
}

/** Defects on one face, or every defect when no face is given. */
export function defectsOnFace(record, faceIndex) {
  if (faceIndex === undefined) return record.defects.slice();
  return record.defects.filter((defect) => defect.faceIndex === faceIndex);
}

/** A short line for a scale sheet or a log deck report. */
export function describeLog(record) {
  const length = record.merchantable ? `${record.nominalLengthFt} ft` : 'short';
  return `${record.id} ${record.species} ${record.scalingDiameterIn} in x ${length}`;
}
