/**
 * Sawing patterns.
 *
 * A log is a circle and a board is a rectangle, so every pattern is a
 * different answer to the same question: where do you put the parallel lines.
 * The answers trade volume against grade and they trade it hard. Live sawing
 * gets the most board feet out of a log and puts the best wood in the middle
 * of wide boards where a defect ruins the lot. Quarter sawing throws away a
 * quarter of the volume and produces stock that will not cup.
 *
 * Widths come off the geometry. A cut at distance x from the centre of a log
 * of diameter D gives a board 2 times the square root of (D over 2 squared
 * minus x squared) wide, and that is why the outside boards off a big log are
 * narrow and worth little.
 */

import { BucklineError } from '../errors.js';
import { boardFeet } from '../units.js';
import { round2, round3 } from '../num.js';

export class MillError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'MILL', ...options });
    this.name = 'MillError';
  }
}

/** The patterns the mill runs, with what each one buys and costs. */
export const PATTERNS = ['live', 'cant', 'grade', 'quarter'];

/** Board width at a distance from the centre of a round log. */
export function chordWidth(diameterIn, offsetIn) {
  const radius = diameterIn / 2;
  const inside = radius * radius - offsetIn * offsetIn;
  return inside <= 0 ? 0 : round3(2 * Math.sqrt(inside));
}

/**
 * Live sawing. Every cut is parallel and the log is never turned, so the
 * boards come off in one run and the widths follow the circle.
 */
export function liveSaw(log, options = {}) {
  const { thicknessIn = 1, kerfIn = 0.125, minWidthIn = 4 } = options;
  requirePositive('thicknessIn', thicknessIn);
  const step = thicknessIn + kerfIn;
  const radius = log.scalingDiameterIn / 2;

  const boards = [];
  // Start half a step off centre so the pattern is symmetric about the middle.
  for (let offset = step / 2; offset < radius; offset += step) {
    for (const sign of [-1, 1]) {
      const centre = sign * offset;
      const width = chordWidth(log.scalingDiameterIn, Math.abs(centre) + thicknessIn / 2);
      if (width < minWidthIn) continue;
      boards.push({
        offsetIn: round3(centre),
        widthIn: width,
        thicknessIn,
        lengthFt: log.nominalLengthFt,
        boardFeet: round2(boardFeet(thicknessIn, width, log.nominalLengthFt)),
        fromCentre: round3(Math.abs(centre)),
      });
    }
  }
  return finish('live', log, boards, { thicknessIn, kerfIn, gradeLift: 0 });
}

/**
 * Cant sawing. The log is squared to a cant and the cant is sawn straight
 * through. Fewer, more uniform boards and much less edging.
 */
export function cantSaw(log, options = {}) {
  const { thicknessIn = 1, kerfIn = 0.125, cantShare = 0.71 } = options;
  requirePositive('thicknessIn', thicknessIn);
  const cantIn = round3(log.scalingDiameterIn * cantShare);
  const step = thicknessIn + kerfIn;
  const count = Math.floor(cantIn / step);

  const boards = [];
  for (let i = 0; i < count; i += 1) {
    boards.push({
      offsetIn: round3(i * step - cantIn / 2 + step / 2),
      widthIn: cantIn,
      thicknessIn,
      lengthFt: log.nominalLengthFt,
      boardFeet: round2(boardFeet(thicknessIn, cantIn, log.nominalLengthFt)),
      fromCentre: round3(Math.abs(i * step - cantIn / 2 + step / 2)),
    });
  }
  return finish('cant', log, boards, { thicknessIn, kerfIn, cantIn, gradeLift: 0 });
}

/**
 * Grade sawing. Live sawing with the log turned once the face being cut stops
 * being the best one, which costs a little volume in the turns and lifts the
 * grade of what comes off. The volume model is live sawing less a turn
 * allowance; the grade lift is what pays for it.
 */
export function gradeSaw(log, options = {}) {
  const { turns = 3, turnLossShare = 0.03 } = options;
  const live = liveSaw(log, options);
  const keep = Math.max(0, live.boards.length - turns);
  const boards = live.boards
    .slice()
    .sort((a, b) => a.fromCentre - b.fromCentre)
    .slice(0, keep);
  const result = finish('grade', log, boards, {
    ...live.settings,
    turns,
    gradeLift: 0.15,
  });
  result.boardFeet = round2(result.boardFeet * (1 - turnLossShare));
  return result;
}

/**
 * Quarter sawing. The log is quartered and each quarter is sawn toward the
 * centre, so the rings meet the face nearly square.
 *
 * The volume goes in two places. The wedge at the pith is unusable, and past
 * roughly forty five degrees off the radius the face is riftsawn rather than
 * quartersawn and is not what the customer is paying for. Both are taken here
 * as half the offset distance coming off the usable width, which lands the
 * pattern around two thirds of what live sawing gets out of the same log.
 */
export function quarterSaw(log, options = {}) {
  const { thicknessIn = 1, kerfIn = 0.125, minWidthIn = 4 } = options;
  requirePositive('thicknessIn', thicknessIn);
  const step = thicknessIn + kerfIn;
  const radius = log.scalingDiameterIn / 2;

  const boards = [];
  for (let quarter = 0; quarter < 4; quarter += 1) {
    for (let offset = step; offset < radius; offset += step) {
      const width = round3(Math.sqrt(radius * radius - offset * offset) - offset / 2);
      if (width < minWidthIn) continue;
      boards.push({
        offsetIn: round3(offset),
        quarter,
        widthIn: width,
        thicknessIn,
        lengthFt: log.nominalLengthFt,
        boardFeet: round2(boardFeet(thicknessIn, width, log.nominalLengthFt)),
        fromCentre: round3(offset),
      });
    }
  }
  return finish('quarter', log, boards, { thicknessIn, kerfIn, gradeLift: 0.3 });
}

const RUNNERS = { live: liveSaw, cant: cantSaw, grade: gradeSaw, quarter: quarterSaw };

/** Runs a named pattern. */
export function saw(log, pattern, options = {}) {
  const run = RUNNERS[pattern];
  if (!run) {
    throw new MillError(`no sawing pattern called ${pattern}, we run ${PATTERNS.join(', ')}`, {
      path: 'pattern',
    });
  }
  return run(log, options);
}

/** Every pattern on the same log, most board feet first. */
export function comparePatterns(log, options = {}) {
  return PATTERNS.map((pattern) => {
    const result = saw(log, pattern, options);
    return {
      pattern,
      boardCount: result.boardCount,
      boardFeet: result.boardFeet,
      averageWidthIn: result.averageWidthIn,
      gradeLift: result.settings.gradeLift,
    };
  }).sort((a, b) => b.boardFeet - a.boardFeet);
}

function finish(pattern, log, boards, settings) {
  const total = boards.reduce((sum, board) => sum + board.boardFeet, 0);
  const widths = boards.map((board) => board.widthIn);
  return {
    pattern,
    logId: log.id,
    boards,
    boardCount: boards.length,
    boardFeet: round2(total),
    averageWidthIn: widths.length > 0 ? round2(widths.reduce((a, b) => a + b, 0) / widths.length) : 0,
    widestIn: widths.length > 0 ? Math.max(...widths) : 0,
    settings,
  };
}

function requirePositive(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new MillError(`${name} must be a positive number`, { path: name });
  }
}
