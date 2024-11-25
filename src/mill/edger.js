/**
 * The edger.
 *
 * A flitch comes off the headrig with bark on both edges and the edgerman
 * decides how much to take off. Every inch of width thrown away is board feet
 * gone. Every inch of wane left on is a grade the board might not make.
 *
 * That trade has no general answer, because both sides of it move. Width
 * decides surface measure, surface measure decides which line of the grade
 * table applies, and the grade decides how much wane is allowed. So the
 * question "is this board wide enough to carry the wane" cannot be answered
 * without first deciding how wide it is going to be, which is the decision
 * being made.
 *
 * The way out is to price every width the edger could cut and take the best.
 * There are only a handful, because widths go in whole inches.
 */

import { round2, round4 } from '../num.js';
import { boardFeet } from '../units.js';
import { surfaceMeasure } from '../model/board.js';
import { LUMBER_GRADES, dimensionsAllow, lumberSpec } from '../grade/lumber/spec.js';
import { MillError } from './pattern.js';

/** How much wane each grade will carry, as a share of the width. */
const WANE_ALLOWANCE = {
  FAS: 0,
  F1F: 0,
  SEL: 0.08,
  '1C': 0.17,
  '2AC': 0.33,
  '3AC': 0.5,
};

/** Widths an edger can actually cut. */
export function availableWidths(flitch, options = {}) {
  const { minWidthIn = 3, step = 1 } = options;
  const widest = Math.floor(flitch.wideWidthIn);
  const out = [];
  for (let width = minWidthIn; width <= widest; width += step) {
    out.push(width);
  }
  return out;
}

/**
 * The wane left on a board of a given width, as a share of that width. A
 * flitch is widest in the middle and narrowest at the ends; cutting narrower
 * than the narrow point leaves no wane at all.
 */
export function waneAt(flitch, widthIn) {
  if (widthIn <= flitch.narrowWidthIn) return 0;
  return round4((widthIn - flitch.narrowWidthIn) / widthIn);
}

/** The best grade a board of that width and wane could make. */
export function gradeAt(flitch, widthIn, options = {}) {
  const { lengthFt } = flitch;
  const wane = waneAt(flitch, widthIn);
  const board = {
    widthIn,
    lengthFt,
    surfaceMeasure: surfaceMeasure(widthIn, lengthFt),
  };

  for (const grade of LUMBER_GRADES) {
    if (!dimensionsAllow(grade, board).allowed) continue;
    if (wane > WANE_ALLOWANCE[grade] + 1e-9) continue;
    if (
      options.faceGrade &&
      LUMBER_GRADES.indexOf(grade) < LUMBER_GRADES.indexOf(options.faceGrade)
    ) {
      continue;
    }
    return { grade, wane, surfaceMeasure: board.surfaceMeasure, spec: lumberSpec(grade).label };
  }
  return { grade: null, wane, surfaceMeasure: board.surfaceMeasure, spec: null };
}

/**
 * Every width the edger could cut, priced. `prices` maps a grade to a price
 * per thousand board feet.
 */
export function edgingOptions(flitch, prices, options = {}) {
  if (!(flitch.wideWidthIn > 0) || !(flitch.narrowWidthIn > 0)) {
    throw new MillError('a flitch needs a wide and a narrow width', { path: 'flitch' });
  }
  if (flitch.narrowWidthIn > flitch.wideWidthIn) {
    throw new MillError('a flitch cannot be wider at its narrow point', { path: 'flitch' });
  }

  return availableWidths(flitch, options)
    .map((widthIn) => {
      const read = gradeAt(flitch, widthIn, options);
      const feet = boardFeet(flitch.thicknessIn, widthIn, flitch.lengthFt);
      const perMbf = read.grade === null ? 0 : (prices[read.grade] ?? 0);
      return {
        widthIn,
        ...read,
        boardFeet: round2(feet),
        perMbf,
        value: round2((feet / 1000) * perMbf),
      };
    })
    .sort((a, b) => b.value - a.value || a.widthIn - b.widthIn);
}

/**
 * The width the edger should cut, with the runner up, because the runner up is
 * what tells an operator whether the decision was close. A decision that is
 * close does not need arguing about; one that is not close and is being made
 * the other way is a training problem.
 */
export function bestEdging(flitch, prices, options = {}) {
  const rows = edgingOptions(flitch, prices, options);
  if (rows.length === 0 || rows[0].value === 0) {
    return { best: null, runnerUp: null, margin: 0, close: false, rows };
  }
  const best = rows[0];
  const runnerUp = rows[1] ?? null;
  const margin = runnerUp ? round2(best.value - runnerUp.value) : best.value;
  return {
    best,
    runnerUp,
    margin,
    marginShare: best.value > 0 ? round4(margin / best.value) : 0,
    close: runnerUp !== null && margin / best.value < 0.05,
    rows,
  };
}

/** What cutting to a fixed width instead of the best one costs. */
export function costOfFixedWidth(flitch, prices, widthIn, options = {}) {
  const rows = edgingOptions(flitch, prices, options);
  const chosen = rows.find((row) => row.widthIn === widthIn);
  if (!chosen) {
    throw new MillError(`the edger cannot cut ${widthIn} inches off this flitch`, {
      path: 'widthIn',
    });
  }
  const best = rows[0];
  return {
    chosen,
    best,
    lostValue: round2(best.value - chosen.value),
    lostBoardFeet: round2(best.boardFeet - chosen.boardFeet),
  };
}
