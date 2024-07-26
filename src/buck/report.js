/**
 * Telling the woods crew where to cut.
 *
 * The optimiser produces a set of cut heights. A sawhand does not work from
 * heights up the stem; they work from the butt end of the stick in front of
 * them, in whole feet, one cut at a time. So the report is a running tape
 * measure, and every line says how far up from the last cut rather than how
 * far up from the stump.
 *
 * The second half of the report is the part that gets read at the end of the
 * week: what the pattern gave up. A crew that consistently leaves four feet of
 * butt log on the ground is losing more money than one that occasionally
 * misses a grade, and only one of those shows up on a scale ticket.
 */

import { round2, round3 } from '../num.js';
import { BuckError } from './stem.js';
import { valuedCandidates } from './candidates.js';

/** The cutting instructions, in the order they are made. */
export function cuttingCard(result) {
  if (!result || !Array.isArray(result.logs)) {
    throw new BuckError('a cutting card needs a bucking result', { path: 'result' });
  }
  const lines = [];
  let cursor = null;

  for (const [index, log] of result.logs.entries()) {
    if (cursor === null) {
      lines.push({
        step: lines.length + 1,
        action: 'trim',
        atFt: round3(log.fromFt),
        fromLastCutFt: round3(log.fromFt),
        note: 'square the butt',
      });
    } else if (log.fromFt > cursor + 1e-9) {
      lines.push({
        step: lines.length + 1,
        action: 'cut out',
        atFt: round3(log.fromFt),
        fromLastCutFt: round3(log.fromFt - cursor),
        note: 'waste piece',
      });
    }
    lines.push({
      step: lines.length + 1,
      action: 'log',
      atFt: round3(log.toFt),
      fromLastCutFt: round3(log.toFt - log.fromFt),
      note: `${log.nominalLengthFt} ft ${log.scalingDiameterIn} in, ${log.grade}`,
      logNumber: index + 1,
    });
    cursor = log.toFt;
  }

  return lines;
}

/**
 * What the pattern gave up. Three numbers, and they are different kinds of
 * loss: length left on the ground, value left in a lower grade, and value the
 * length classes cost by not fitting the stem.
 */
export function valueLoss(stem, positions, ruleId, priceList, result, options = {}) {
  const grid = valuedCandidates(stem, positions, ruleId, priceList, options);

  let bestSingleAnywhere = 0;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const candidate = grid[i][j];
      if (candidate && candidate.value > bestSingleAnywhere) bestSingleAnywhere = candidate.value;
    }
  }

  const wasteValue = result.gaps.reduce((total, gap) => {
    const lengthFt = gap.toFt - gap.fromFt;
    const perFoot = result.usedLengthFt > 0 ? result.value / result.usedLengthFt : 0;
    return total + lengthFt * perFoot;
  }, 0);

  return {
    stemId: stem.id,
    chosenValue: result.value,
    bestSingleLogValue: round2(bestSingleAnywhere),
    wasteLengthFt: result.wasteLengthFt,
    wasteValueAtAverage: round2(wasteValue),
    logCount: result.logCount,
    valuePerFoot: result.usedLengthFt > 0 ? round2(result.value / result.usedLengthFt) : 0,
  };
}

/** A per log line for the scale office, before the logs reach the yard. */
export function expectedTally(result) {
  return result.logs.map((log, index) => ({
    logNumber: index + 1,
    logId: log.log.id,
    lengthFt: log.nominalLengthFt,
    diameterIn: log.scalingDiameterIn,
    grade: log.grade,
    market: log.market,
    netBoardFeet: log.netBoardFeet,
    value: log.value,
  }));
}

/**
 * Compares what the crew actually cut against what the optimiser wanted. This
 * is the feedback loop, and it is the only way to find out whether a bucking
 * study is being followed.
 */
export function againstPlan(planned, actual, options = {}) {
  const { toleranceFt = 0.5 } = options;
  const rows = [];
  const count = Math.max(planned.logs.length, actual.length);

  for (let i = 0; i < count; i += 1) {
    const want = planned.logs[i] ?? null;
    const got = actual[i] ?? null;
    if (!want) {
      rows.push({
        logNumber: i + 1,
        verdict: 'extra log cut',
        plannedFt: null,
        actualFt: got.lengthFt,
      });
      continue;
    }
    if (!got) {
      rows.push({
        logNumber: i + 1,
        verdict: 'log not cut',
        plannedFt: want.nominalLengthFt,
        actualFt: null,
      });
      continue;
    }
    const difference = got.lengthFt - want.nominalLengthFt;
    rows.push({
      logNumber: i + 1,
      plannedFt: want.nominalLengthFt,
      actualFt: got.lengthFt,
      differenceFt: round3(difference),
      verdict: Math.abs(difference) <= toleranceFt ? 'as planned' : 'off plan',
    });
  }

  const followed = rows.filter((row) => row.verdict === 'as planned').length;
  return {
    rows,
    followedCount: followed,
    plannedCount: planned.logs.length,
    followedShare: rows.length > 0 ? round2(followed / rows.length) : 0,
  };
}
