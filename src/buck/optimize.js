/**
 * Bucking for value.
 *
 * Given the cut positions and what every stretch between them is worth, choose
 * the cuts that get the most money off the stem. The wood between two chosen
 * cuts is one log and there is no overlap, so this is a walk up the stem
 * rather than a search over every combination.
 *
 * It is filled in from the top of the stem downward. The best value from a
 * position with k logs left is the best of taking no more logs, or taking one
 * log to some higher position and then using the answer already worked out for
 * that position with k minus one logs left. Because the table is filled from
 * the top down, the answer it needs is always already there.
 *
 * This started as a recursion with a memo, which reads better and blows the
 * stack on a long stem with a fine position grid. A hundred foot stem offered
 * every nominal length off every defect edge runs to several hundred
 * positions, and the recursion nests once per log down the stem.
 *
 * The wood below the first cut and above the last is waste. It is reported,
 * because a bucking pattern that leaves nine feet of good butt log on the
 * ground is worth knowing about even when it wins on value.
 */

import { round2, round3 } from '../num.js';
import { BuckError } from './stem.js';
import { totalValue, valuedCandidates } from './candidates.js';

/**
 * The best bucking pattern for a stem.
 *
 * `positions` are the heights a cut may be made at. Everything else falls out
 * of the candidate grid.
 */
export function buckStem(stem, positions, ruleId, priceList, options = {}) {
  const { maxLogs = Infinity } = options;
  if (!Array.isArray(positions) || positions.length < 2) {
    throw new BuckError('bucking needs at least two cut positions', { path: 'positions' });
  }
  if (maxLogs < 1) {
    throw new BuckError('a stem has to be allowed at least one log', { path: 'maxLogs' });
  }

  const grid = valuedCandidates(stem, positions, ruleId, priceList, options);
  const n = positions.length;
  const cap = Math.min(maxLogs, n - 1);

  // table[k][i] is the best value reachable from position i with k logs left.
  // Row zero is all zeros and every later row only reads the row below it, so
  // filling the rows in order is enough.
  const table = [];
  for (let k = 0; k <= cap; k += 1) {
    table.push(new Array(n).fill(null).map(() => ({ value: 0, next: null, taken: null })));
  }

  let states = 0;
  for (let k = 1; k <= cap; k += 1) {
    for (let from = n - 2; from >= 0; from -= 1) {
      let bestValue = 0;
      let bestNext = null;
      let bestTaken = null;
      for (let to = from + 1; to < n; to += 1) {
        const candidate = grid[from][to];
        if (!candidate) continue;
        const value = round2(candidate.value + table[k - 1][to].value);
        if (value > bestValue + 1e-9) {
          bestValue = value;
          bestNext = to;
          bestTaken = candidate;
        }
      }
      table[k][from] = { value: bestValue, next: bestNext, taken: bestTaken };
      states += 1;
    }
  }

  let start = 0;
  for (let i = 1; i < n - 1; i += 1) {
    if (table[cap][i].value > table[cap][start].value + 1e-9) start = i;
  }

  const chosen = [];
  let at = start;
  let left = cap;
  while (left > 0 && table[left][at].taken) {
    chosen.push(table[left][at].taken);
    at = table[left][at].next;
    left -= 1;
  }

  return summarise(stem, positions, chosen, states);
}

function summarise(stem, positions, chosen, statesVisited) {
  const merchTop = positions.at(-1);
  const firstCut = chosen.length > 0 ? chosen[0].fromFt : merchTop;
  const lastCut = chosen.length > 0 ? chosen.at(-1).toFt : stem.stumpHeightFt;

  const gaps = [];
  if (firstCut > stem.stumpHeightFt + 1e-9) {
    gaps.push({ fromFt: stem.stumpHeightFt, toFt: firstCut, reason: 'left below the first log' });
  }
  for (let i = 1; i < chosen.length; i += 1) {
    if (chosen[i].fromFt > chosen[i - 1].toFt + 1e-9) {
      gaps.push({
        fromFt: chosen[i - 1].toFt,
        toFt: chosen[i].fromFt,
        reason: 'cut out between logs',
      });
    }
  }
  if (merchTop > lastCut + 1e-9) {
    gaps.push({ fromFt: lastCut, toFt: merchTop, reason: 'left above the last log' });
  }

  return {
    stemId: stem.id,
    logs: chosen,
    logCount: chosen.length,
    value: totalValue(chosen),
    netBoardFeet: round2(chosen.reduce((total, log) => total + log.netBoardFeet, 0)),
    usedLengthFt: round3(chosen.reduce((total, log) => total + (log.toFt - log.fromFt), 0)),
    wasteLengthFt: round3(gaps.reduce((total, gap) => total + (gap.toFt - gap.fromFt), 0)),
    gaps,
    statesVisited,
  };
}

/**
 * The same stem under two rules or two price lists. A bucking pattern is not a
 * property of the tree: change the contract and the right place to cut moves.
 */
export function compareBucking(stem, positions, a, b, options = {}) {
  const left = buckStem(stem, positions, a.rule, a.priceList, { ...options, ...a.options });
  const right = buckStem(stem, positions, b.rule, b.priceList, { ...options, ...b.options });
  const samePattern =
    left.logs.length === right.logs.length &&
    left.logs.every((log, index) => Math.abs(log.toFt - right.logs[index].toFt) < 1e-6);

  return {
    left: { label: a.label ?? a.rule, ...left },
    right: { label: b.label ?? b.rule, ...right },
    samePattern,
    valueDifference: round2(right.value - left.value),
  };
}
