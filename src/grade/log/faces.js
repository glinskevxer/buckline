/**
 * Log faces and the clear cuttings on them.
 *
 * A log is graded on its faces, and a face is one quarter of the circumference
 * running the whole length of the log. There are four of them and they are
 * numbered clockwise from wherever the scaler started. What matters is not
 * which face is which but how many of them are good, so the grade rules always
 * talk about the best two or the best three.
 *
 * A clear cutting is a run of face with no grading defect in it. Finding them
 * is just finding the gaps between the defects, but two details matter. A
 * defect that is recorded without a position spoils the whole face, because
 * nobody can prove where it was. And the grading zone is not always the whole
 * log: on a butt log the bottom foot is usually excluded, since that is where
 * the flare and the felling damage live.
 */

import { requireNonNegative, round3 } from '../../num.js';

export const FACE_COUNT = 4;

/** The part of the log a grade is read on. */
export function gradingZone(log, options = {}) {
  const { excludeButtFt = 1 } = options;
  const length = log.nominalLengthFt;
  const start = log.position === 'butt' ? Math.min(excludeButtFt, length) : 0;
  return { startFt: start, endFt: length, lengthFt: round3(Math.max(0, length - start)) };
}

/**
 * The clear runs on one face, longest first. A defect with no position on it
 * spoils the face outright and the result is an empty list.
 */
export function clearCuttings(log, faceIndex, options = {}) {
  const zone = gradingZone(log, options);
  if (zone.lengthFt <= 0) return [];

  const onFace = (log.defects ?? []).filter(
    (defect) => defect.faceIndex === faceIndex && countsAgainstFace(defect)
  );
  if (onFace.some((defect) => defect.startFt === undefined || defect.lengthFt === undefined)) {
    return [];
  }

  const blocked = onFace
    .map((defect) => ({
      startFt: Math.max(zone.startFt, defect.startFt),
      endFt: Math.min(zone.endFt, defect.startFt + defect.lengthFt),
    }))
    .filter((span) => span.endFt > span.startFt)
    .sort((a, b) => a.startFt - b.startFt);

  const merged = [];
  for (const span of blocked) {
    const last = merged.at(-1);
    if (last && span.startFt <= last.endFt + 1e-9) {
      last.endFt = Math.max(last.endFt, span.endFt);
    } else {
      merged.push({ ...span });
    }
  }

  const cuttings = [];
  let cursor = zone.startFt;
  for (const span of merged) {
    if (span.startFt - cursor > 1e-9) {
      cuttings.push({ startFt: round3(cursor), lengthFt: round3(span.startFt - cursor) });
    }
    cursor = Math.max(cursor, span.endFt);
  }
  if (zone.endFt - cursor > 1e-9) {
    cuttings.push({ startFt: round3(cursor), lengthFt: round3(zone.endFt - cursor) });
  }

  return cuttings.sort((a, b) => b.lengthFt - a.lengthFt || a.startFt - b.startFt);
}

/**
 * How a face reads against one set of cutting requirements.
 *
 * The requirements are not properties of the face. They come out of the grade
 * table, and for grade one they come out of the table by way of the scaling
 * diameter, so the same face passes at twenty inches and fails at fourteen.
 */
export function readFace(log, faceIndex, requirements, options = {}) {
  const { minCuttingFt, maxCuttings, minYieldShare } = requirements;
  requireNonNegative('minCuttingFt', minCuttingFt);
  const zone = gradingZone(log, options);
  const all = clearCuttings(log, faceIndex, options);
  const usable = all.filter((cutting) => cutting.lengthFt >= minCuttingFt - 1e-9);
  const taken = maxCuttings === null ? usable : usable.slice(0, maxCuttings);
  const clearFt = taken.reduce((total, cutting) => total + cutting.lengthFt, 0);
  const yieldShare = zone.lengthFt > 0 ? clearFt / zone.lengthFt : 0;

  return {
    faceIndex,
    zoneLengthFt: zone.lengthFt,
    cuttings: taken,
    cuttingCount: taken.length,
    rejectedCount: all.length - usable.length,
    clearFt: round3(clearFt),
    yieldShare: round3(yieldShare),
    passes: taken.length > 0 && yieldShare >= minYieldShare - 1e-9,
  };
}

/** Every face read against the same requirements, best first. */
export function readFaces(log, requirements, options = {}) {
  const reads = [];
  for (let index = 0; index < FACE_COUNT; index += 1) {
    reads.push(readFace(log, index, requirements, options));
  }
  return reads.sort((a, b) => b.yieldShare - a.yieldShare || a.faceIndex - b.faceIndex);
}

/** How many faces pass, which is what the grade table actually asks for. */
export function passingFaceCount(log, requirements, options = {}) {
  return readFaces(log, requirements, options).filter((face) => face.passes).length;
}

function countsAgainstFace(defect) {
  return defect.type !== 'sweep' && defect.type !== 'crook';
}
