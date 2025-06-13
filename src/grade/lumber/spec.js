/**
 * The mill's grading table.
 *
 * Our graders work to the hardwood rules and a disputed car goes to a
 * certified inspector, whose word is final. This table is the shop
 * transcription the tally system runs on, and it exists so the office can
 * price a load the same way twice. Where it and an inspector disagree, the
 * inspector is right and this file gets edited.
 *
 * Three things vary per grade and all three are looked up rather than fixed:
 *
 *   the minimum size a cutting has to be before it counts at all, which comes
 *   as a pair of alternatives because a narrow long cutting and a wide short
 *   one are both worth having
 *
 *   how many cuttings the board is allowed, which comes out of the surface
 *   measure
 *
 *   how many cutting units it has to yield, which is quoted per surface
 *   measure so it scales with the board
 *
 * The last two are entangled on purpose. On the common grades a board may take
 * one more cutting than the schedule allows if it yields more, so the number of
 * cuttings permitted depends on the yield achieved, and the yield achieved
 * depends on how many cuttings were taken. A grader resolves that by trying
 * both. So does the search in cutting-search.js.
 */

import { GradeError } from '../../errors.js';
import { checklist } from '../../checklist.js';

/** Grades best first. The order is the order a board is offered in. */
export const LUMBER_GRADES = ['FAS', 'F1F', 'SEL', '1C', '2AC', '3AC'];

const UNITS_PER_SM = 12;

function band(sm, table) {
  const row = table.find((entry) => sm >= entry.from && sm <= entry.to);
  return row ? row.cuttings : null;
}

const FAS_CUTTINGS = [
  { from: 4, to: 9, cuttings: 1 },
  { from: 10, to: 14, cuttings: 2 },
  { from: 15, to: Infinity, cuttings: 3 },
];

const COMMON_CUTTINGS = [
  { from: 1, to: 2, cuttings: 1 },
  { from: 3, to: 4, cuttings: 2 },
  { from: 5, to: 7, cuttings: 3 },
  { from: 8, to: 10, cuttings: 4 },
  { from: 11, to: 13, cuttings: 5 },
  { from: 14, to: Infinity, cuttings: 6 },
];

const SPECS = {
  FAS: {
    grade: 'FAS',
    label: 'firsts and seconds',
    minWidthIn: 6,
    minLengthFt: 8,
    maxLengthFt: 16,
    minSurfaceMeasure: 4,
    minCuttingSizes: [
      { widthIn: 4, lengthFt: 5 },
      { widthIn: 3, lengthFt: 7 },
    ],
    backFace: null,
    allowances: (sm) => alternatives(band(sm, FAS_CUTTINGS), 10, null),
  },
  F1F: {
    grade: 'F1F',
    label: 'FAS one face',
    minWidthIn: 6,
    minLengthFt: 8,
    maxLengthFt: 16,
    minSurfaceMeasure: 4,
    minCuttingSizes: [
      { widthIn: 4, lengthFt: 5 },
      { widthIn: 3, lengthFt: 7 },
    ],
    backFace: '1C',
    allowances: (sm) => alternatives(band(sm, FAS_CUTTINGS), 10, null),
  },
  SEL: {
    grade: 'SEL',
    label: 'selects',
    minWidthIn: 4,
    minLengthFt: 6,
    maxLengthFt: 16,
    minSurfaceMeasure: 2,
    minCuttingSizes: [
      { widthIn: 4, lengthFt: 5 },
      { widthIn: 3, lengthFt: 7 },
    ],
    backFace: '1C',
    allowances: (sm) => alternatives(band(sm, FAS_CUTTINGS) ?? 1, 10, null),
  },
  '1C': {
    grade: '1C',
    label: 'number one common',
    minWidthIn: 3,
    minLengthFt: 4,
    maxLengthFt: 16,
    minSurfaceMeasure: 1,
    minCuttingSizes: [
      { widthIn: 4, lengthFt: 2 },
      { widthIn: 3, lengthFt: 3 },
    ],
    backFace: null,
    allowances: (sm) => alternatives(band(sm, COMMON_CUTTINGS), 8, 10),
  },
  '2AC': {
    grade: '2AC',
    label: 'number two a common',
    minWidthIn: 3,
    minLengthFt: 4,
    maxLengthFt: 16,
    minSurfaceMeasure: 1,
    minCuttingSizes: [{ widthIn: 3, lengthFt: 2 }],
    backFace: null,
    allowances: (sm) => alternatives(band(sm, COMMON_CUTTINGS), 6, 8),
  },
  '3AC': {
    grade: '3AC',
    label: 'number three a common',
    minWidthIn: 3,
    minLengthFt: 4,
    maxLengthFt: 16,
    minSurfaceMeasure: 1,
    minCuttingSizes: [{ widthIn: 3, lengthFt: 2 }],
    backFace: null,
    allowances: () => [{ maxCuttings: null, unitsPerSm: 4, extra: false }],
  },
};

/**
 * Builds the allowance list. The second entry is the trade a grader makes on
 * the common grades: one more cutting in exchange for a higher yield.
 */
function alternatives(maxCuttings, unitsPerSm, bonusUnitsPerSm) {
  if (maxCuttings === null || maxCuttings === undefined) return [];
  const out = [{ maxCuttings, unitsPerSm, extra: false }];
  if (bonusUnitsPerSm !== null) {
    out.push({ maxCuttings: maxCuttings + 1, unitsPerSm: bonusUnitsPerSm, extra: true });
  }
  return out;
}

/** The spec for a named grade. */
export function lumberSpec(grade) {
  const spec = SPECS[grade];
  if (!spec) {
    throw new GradeError(`no lumber grade called ${grade}`, {
      path: 'grade',
      hint: `we grade ${LUMBER_GRADES.join(', ')}`,
    });
  }
  return spec;
}

/**
 * The ways this board could make this grade, as a list of allowances. An empty
 * list means the surface measure is outside the grade's table entirely.
 */
export function allowancesFor(grade, surfaceMeasure) {
  return lumberSpec(grade).allowances(surfaceMeasure);
}

/** Cutting units the board must yield under one allowance. */
export function requiredUnits(surfaceMeasure, allowance) {
  return surfaceMeasure * allowance.unitsPerSm;
}

/** The share of the face that has to come out clear under an allowance. */
export function requiredShare(allowance) {
  return allowance.unitsPerSm / UNITS_PER_SM;
}

/** True when a cutting of this size counts at all under this grade. */
export function cuttingCounts(grade, widthIn, lengthFt) {
  return lumberSpec(grade).minCuttingSizes.some(
    (size) => widthIn >= size.widthIn - 1e-9 && lengthFt >= size.lengthFt - 1e-9
  );
}

/** Whether the board's outside dimensions let it be offered at a grade. */
export function dimensionsAllow(grade, board) {
  const spec = lumberSpec(grade);
  return checklist()
    .require(
      board.widthIn >= spec.minWidthIn,
      `${board.widthIn} inches is under the ${spec.minWidthIn} inch minimum for ${grade}`
    )
    .require(
      board.lengthFt >= spec.minLengthFt,
      `${board.lengthFt} feet is under the ${spec.minLengthFt} foot minimum for ${grade}`
    )
    .require(
      board.lengthFt <= spec.maxLengthFt,
      `${board.lengthFt} feet is over the ${spec.maxLengthFt} foot maximum for ${grade}`
    )
    .require(
      board.surfaceMeasure >= spec.minSurfaceMeasure,
      `surface measure ${board.surfaceMeasure} is under the ${spec.minSurfaceMeasure} minimum for ${grade}`
    )
    .verdict('allowed');
}
