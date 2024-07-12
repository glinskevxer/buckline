/**
 * Turning a stretch of stem into a log worth a number.
 *
 * A candidate is a pair of cut heights. What it is worth is not a property of
 * the pair, because everything downstream has to run first: the small end
 * comes off the upper cut, the length has to fall on a nominal class with trim
 * on it, the defects have to be shifted from stem coordinates to log
 * coordinates, and only then can the thing be scaled, graded and priced.
 *
 * The first cut off the stem is a butt log and nothing else on the stem is,
 * which matters because the top log grade will not take an upper log at all.
 * So the value of the identical stretch of wood changes depending on whether
 * anything was cut off below it.
 */

import { makeLog } from '../model/log.js';
import { round2, round3 } from '../num.js';
import { nominalLengths, scalingLength } from '../measure/length.js';
import { valueLog } from '../price/value.js';
import { BuckError, defectsBetween, diameterAtHeight } from './stem.js';

/**
 * Builds the log a cut pair would produce, or null when the stretch cannot
 * make a merchantable stick at all.
 */
export function candidateLog(stem, fromFt, toFt, options = {}) {
  const { trimPolicy = 'hardwood', convention = 'average', rounding = 'down' } = options;
  if (toFt <= fromFt) return null;

  const rawLengthFt = round3(toFt - fromFt);
  const length = scalingLength(rawLengthFt, { policy: trimPolicy });
  if (!length.merchantable) return null;

  const smallEndIn = diameterAtHeight(stem, toFt);
  const largeEndIn = diameterAtHeight(stem, fromFt);
  if (smallEndIn <= 0) return null;

  const defects = defectsBetween(stem, fromFt, toFt);

  return makeLog(
    {
      id: `${stem.id}-${round3(fromFt)}-${round3(toFt)}`,
      species: stem.species,
      position: fromFt <= stem.stumpHeightFt + 1e-9 ? 'butt' : 'upper',
      axesIn: [smallEndIn, smallEndIn],
      largeEndIn,
      measuredLengthFt: rawLengthFt,
      defects,
    },
    { convention, rounding, trimPolicy }
  );
}

/**
 * Every candidate log between two cut positions on the stem, with its value.
 * Candidates that make nothing are dropped rather than valued at zero, so the
 * optimiser never has to decide whether a worthless log is worth cutting.
 */
export function valuedCandidates(stem, positions, ruleId, priceList, options = {}) {
  if (!Array.isArray(positions) || positions.length < 2) {
    throw new BuckError('bucking needs at least two cut positions', { path: 'positions' });
  }

  const out = [];
  for (let i = 0; i < positions.length; i += 1) {
    out.push([]);
    for (let j = i + 1; j < positions.length; j += 1) {
      const log = candidateLog(stem, positions[i], positions[j], options);
      if (!log) {
        out[i][j] = null;
        continue;
      }
      const valued = valueLog(log, ruleId, priceList, options);
      out[i][j] =
        valued.value > 0
          ? {
              fromFt: positions[i],
              toFt: positions[j],
              log,
              nominalLengthFt: log.nominalLengthFt,
              scalingDiameterIn: log.scalingDiameterIn,
              market: valued.market,
              grade: valued.grade,
              netBoardFeet: valued.netBoardFeet,
              value: valued.value,
            }
          : null;
    }
  }
  return out;
}

/**
 * Adds the nominal length classes to a candidate list. A bucker does not cut
 * at arbitrary heights: they cut to a length class, so the useful positions
 * are the defect edges plus every nominal length above each of them.
 */
export function withLengthClasses(stem, positions, options = {}) {
  const { trimPolicy = 'hardwood', trimAllowanceFt = 4 / 12, topFt = null } = options;
  const ceiling = topFt ?? positions.at(-1);
  const out = new Set(positions);

  for (const start of positions) {
    for (const nominal of nominalLengths(trimPolicy)) {
      const cut = round3(start + nominal + trimAllowanceFt);
      if (cut < ceiling - 1e-9) out.add(cut);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The best single log that could come off the whole stem. */
export function bestSingleLog(stem, positions, ruleId, priceList, options = {}) {
  const grid = valuedCandidates(stem, positions, ruleId, priceList, options);
  let best = null;
  for (let i = 0; i < grid.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const candidate = grid[i][j];
      if (candidate && (!best || candidate.value > best.value)) best = candidate;
    }
  }
  return best;
}

/** Sums the value of a chosen set of candidates. */
export function totalValue(candidates) {
  return round2(candidates.reduce((total, candidate) => total + candidate.value, 0));
}
