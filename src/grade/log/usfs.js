/**
 * Factory log grades.
 *
 * These are the three grades a hardwood saw log is sold on. What makes them
 * awkward to implement is that the requirements are not constants. Two of them
 * are looked up from measurements of the same log they are about to judge.
 *
 * For grade one, the minimum length of a clear cutting depends on the scaling
 * diameter. A thirteen inch log has to show seven foot cuttings; a twenty inch
 * log only has to show three foot cuttings, because there is more width in
 * every board and a shorter clear run is still worth cutting. So the diameter
 * does not merely have to clear a floor, it decides the standard the faces are
 * then read against.
 *
 * For grade two, the number of cuttings allowed on a face depends on the log
 * length. A short log gets two, a long one gets three. Allowing a third
 * cutting is what lets a long log with an extra knot still make the grade,
 * and it is the reason a grader cannot judge a face without first knowing how
 * long the log is.
 *
 * The cull limit is the last gate and it is checked against the net scale, so
 * a log can pass every face test and still fall out of grade because of what
 * came off inside it.
 */

import { GradeError } from '../../errors.js';
import { checklist } from '../../checklist.js';
import { passingFaceCount, readFaces } from './faces.js';

/** The three factory grades, best first. */
export const FACTORY_GRADES = ['F1', 'F2', 'F3'];

/**
 * Minimum clear cutting length for grade one, by scaling diameter class. The
 * classes are inclusive at both ends.
 */
const F1_CUTTING_BY_DIAMETER = [
  { minDiameterIn: 13, maxDiameterIn: 15, minCuttingFt: 7 },
  { minDiameterIn: 16, maxDiameterIn: 19, minCuttingFt: 5 },
  { minDiameterIn: 20, maxDiameterIn: Infinity, minCuttingFt: 3 },
];

const SPECS = {
  F1: {
    grade: 'F1',
    label: 'grade 1 factory',
    positions: ['butt'],
    minDiameterIn: 13,
    minLengthFt: 10,
    facesRequired: 3,
    minYieldShare: 5 / 6,
    maxCuttings: () => 2,
    minCuttingFt: (diameterIn) => {
      const band = F1_CUTTING_BY_DIAMETER.find(
        (row) => diameterIn >= row.minDiameterIn && diameterIn <= row.maxDiameterIn
      );
      return band ? band.minCuttingFt : null;
    },
    maxCullShare: 0.4,
  },
  F2: {
    grade: 'F2',
    label: 'grade 2 factory',
    positions: ['butt', 'second', 'upper'],
    minDiameterIn: 11,
    minLengthFt: 8,
    facesRequired: 3,
    minYieldShare: 2 / 3,
    maxCuttings: (lengthFt) => (lengthFt >= 12 ? 3 : 2),
    minCuttingFt: () => 3,
    maxCullShare: 0.5,
  },
  F3: {
    grade: 'F3',
    label: 'grade 3 factory',
    positions: ['butt', 'second', 'upper'],
    minDiameterIn: 8,
    minLengthFt: 8,
    facesRequired: 2,
    minYieldShare: 0.5,
    maxCuttings: () => null,
    minCuttingFt: () => 2,
    maxCullShare: 0.5,
  },
};

/** The spec for a named grade. */
export function gradeSpec(grade) {
  const spec = SPECS[grade];
  if (!spec) {
    throw new GradeError(`no factory grade called ${grade}`, { path: 'grade' });
  }
  return spec;
}

/**
 * The cutting requirements this log will be read against for a given grade.
 * Two of the three come out of the log itself.
 */
export function requirementsFor(log, grade) {
  const spec = gradeSpec(grade);
  return {
    minCuttingFt: spec.minCuttingFt(log.scalingDiameterIn),
    maxCuttings: spec.maxCuttings(log.nominalLengthFt),
    minYieldShare: spec.minYieldShare,
  };
}

/**
 * Tests one log against one grade and says why it failed if it did.
 * `cullShare` is the deduction share off the net scale, if it is known.
 */
export function meetsGrade(log, grade, options = {}) {
  const { cullShare = 0 } = options;
  const spec = gradeSpec(grade);
  const list = checklist()
    .require(
      spec.positions.includes(log.position),
      `${grade} takes ${spec.positions.join(' or ')} logs, this is ${log.position}`
    )
    .require(
      log.scalingDiameterIn >= spec.minDiameterIn,
      `scaling diameter ${log.scalingDiameterIn} is under the ${spec.minDiameterIn} inch floor`
    )
    .require(
      log.nominalLengthFt >= spec.minLengthFt,
      `length ${log.nominalLengthFt} is under the ${spec.minLengthFt} foot floor`
    )
    .require(
      cullShare <= spec.maxCullShare + 1e-9,
      `cull of ${Math.round(cullShare * 100)} percent is over the ${Math.round(spec.maxCullShare * 100)} percent limit`
    );

  const requirements = requirementsFor(log, grade);
  if (requirements.minCuttingFt === null) {
    list.add(`no cutting standard for a ${log.scalingDiameterIn} inch log at ${grade}`);
    return {
      grade,
      meets: false,
      reasons: list.reasons,
      requirements,
      faces: [],
      passingFaces: 0,
    };
  }

  const faces = readFaces(log, requirements, options);
  const passing = passingFaceCount(log, requirements, options);
  list.require(
    passing >= spec.facesRequired,
    `${passing} clear faces of the ${spec.facesRequired} ${grade} needs`
  );

  return {
    grade,
    meets: list.ok,
    reasons: list.reasons,
    requirements,
    faces,
    passingFaces: passing,
  };
}

/**
 * The best factory grade the log makes, or null if it makes none. Grades are
 * tried best first, so the first pass wins.
 */
export function factoryGrade(log, options = {}) {
  const attempts = FACTORY_GRADES.map((grade) => meetsGrade(log, grade, options));
  const passed = attempts.find((attempt) => attempt.meets);
  return {
    grade: passed ? passed.grade : null,
    attempts,
    reasons: passed ? [] : attempts.at(-1).reasons,
  };
}
