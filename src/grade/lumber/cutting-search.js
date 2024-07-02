/**
 * Finding the cuttings.
 *
 * A grader looks at a board and works out where to cut it to get the most
 * clear wood out in the fewest pieces. This does the same thing, and it does
 * it the way the grader does: cuttings are taken across the board, one after
 * another along its length, and each one is as wide as the clear band that
 * runs the whole way through it.
 *
 * That last part is what makes it a search rather than an arithmetic problem.
 * A knot near one edge does not stop a cutting, it narrows it, and where you
 * put the ends of the cutting decides how much it narrows. Ending the cutting
 * a foot earlier can buy two inches of width over its whole length.
 *
 * The candidate cut positions are the ends of the board and the ends of every
 * defect. There is never any reason to cut anywhere else: moving a cut from a
 * defect edge into clear wood only throws wood away, and moving it into a
 * defect gains nothing.
 */

import { GradeError } from '../../errors.js';
import { round3 } from '../../num.js';

/**
 * The clear width bands across a length interval of a face, widest first. A
 * defect blocks a band for the whole interval if it overlaps the interval at
 * all, because the cutting has to run clear end to end.
 */
export function clearBands(board, face, startFt, endFt) {
  if (endFt <= startFt) return [];
  const blocked = (board.defects ?? [])
    .filter((defect) => defect.face === face)
    .filter(
      (defect) => defect.startFt < endFt - 1e-9 && defect.startFt + defect.lengthFt > startFt + 1e-9
    )
    .map((defect) => ({
      fromIn: Math.max(0, defect.fromEdgeIn),
      toIn: Math.min(board.widthIn, defect.fromEdgeIn + defect.widthIn),
    }))
    .filter((span) => span.toIn > span.fromIn)
    .sort((a, b) => a.fromIn - b.fromIn);

  const merged = [];
  for (const span of blocked) {
    const last = merged.at(-1);
    if (last && span.fromIn <= last.toIn + 1e-9) {
      last.toIn = Math.max(last.toIn, span.toIn);
    } else {
      merged.push({ ...span });
    }
  }

  const bands = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.fromIn - cursor > 1e-9) {
      bands.push({ fromIn: round3(cursor), toIn: round3(span.fromIn) });
    }
    cursor = Math.max(cursor, span.toIn);
  }
  if (board.widthIn - cursor > 1e-9) {
    bands.push({ fromIn: round3(cursor), toIn: round3(board.widthIn) });
  }

  return bands
    .map((band) => ({ ...band, widthIn: round3(band.toIn - band.fromIn) }))
    .sort((a, b) => b.widthIn - a.widthIn || a.fromIn - b.fromIn);
}

/** Every position worth cutting at, in order. */
export function cutPositions(board, face) {
  const points = new Set([0, board.lengthFt]);
  for (const defect of board.defects ?? []) {
    if (defect.face !== face) continue;
    const start = Math.max(0, Math.min(board.lengthFt, defect.startFt));
    const end = Math.max(0, Math.min(board.lengthFt, defect.startFt + defect.lengthFt));
    points.add(round3(start));
    points.add(round3(end));
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * The best single cutting between two positions, or null when nothing there
 * meets any of the minimum sizes.
 */
export function bestCutting(board, face, startFt, endFt, minSizes) {
  const lengthFt = round3(endFt - startFt);
  if (lengthFt <= 0) return null;
  let best = null;
  for (const band of clearBands(board, face, startFt, endFt)) {
    const fits = minSizes.some(
      (size) => band.widthIn >= size.widthIn - 1e-9 && lengthFt >= size.lengthFt - 1e-9
    );
    if (!fits) continue;
    const units = round3(band.widthIn * lengthFt);
    if (!best || units > best.units) {
      best = {
        startFt: round3(startFt),
        endFt: round3(endFt),
        lengthFt,
        widthIn: band.widthIn,
        fromEdgeIn: band.fromIn,
        units,
      };
    }
  }
  return best;
}

/**
 * The best set of at most `maxCuttings` cuttings on a face, by total units.
 *
 * This is a walk along the board rather than a search over subsets. At each
 * cut position it either carries the best answer forward unchanged or closes a
 * cutting that ends there, which is enough because cuttings cannot overlap and
 * they are taken in order along the length.
 */
export function searchCuttings(board, face, options = {}) {
  const { maxCuttings = null, minSizes } = options;
  if (!Array.isArray(minSizes) || minSizes.length === 0) {
    throw new GradeError('searchCuttings needs at least one minimum cutting size', {
      path: 'minSizes',
    });
  }

  const positions = cutPositions(board, face);
  const n = positions.length;
  const limit = maxCuttings === null ? n : Math.min(maxCuttings, n);

  const candidates = [];
  for (let i = 0; i < n; i += 1) {
    candidates.push([]);
    for (let j = i + 1; j < n; j += 1) {
      candidates[i][j] = bestCutting(board, face, positions[i], positions[j], minSizes);
    }
  }

  // best[k][j] is the most units using at most k cuttings, all of them ending
  // at or before position j.
  const best = [];
  for (let k = 0; k <= limit; k += 1) {
    best.push(new Array(n).fill(null).map(() => ({ units: 0, cuttings: [] })));
  }

  for (let k = 1; k <= limit; k += 1) {
    for (let j = 1; j < n; j += 1) {
      let winner = best[k][j - 1];
      for (let i = 0; i < j; i += 1) {
        const cutting = candidates[i][j];
        if (!cutting) continue;
        const previous = best[k - 1][i];
        const units = round3(previous.units + cutting.units);
        if (units > winner.units + 1e-9) {
          winner = { units, cuttings: [...previous.cuttings, cutting] };
        }
      }
      best[k][j] = winner;
    }
  }

  const answer = limit === 0 ? { units: 0, cuttings: [] } : best[limit][n - 1];
  return {
    face,
    units: answer.units,
    cuttings: answer.cuttings,
    cuttingCount: answer.cuttings.length,
    positionsConsidered: n,
  };
}
