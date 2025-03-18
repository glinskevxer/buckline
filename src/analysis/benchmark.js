/**
 * Benchmarking.
 *
 * Comparing one mill against others, or against itself last year. It is easy
 * to do badly and the two commonest mistakes are both here as guards.
 *
 * The first is comparing figures that were measured on different bases. A
 * recovery factor from a mill scaling International and one scaling Doyle are
 * not the same number and never will be. Every measure here declares what it
 * is measured on and a comparison across bases is refused.
 *
 * The second is reading a rank as a difference. Being third of five says
 * nothing about how far behind third is, and a mill that is third by a tenth
 * of a percent gets a different meeting from one that is third by a fifth. The
 * gap is always reported with the rank.
 */

import { round2, round4 } from '../num.js';
import { BucklineError } from '../errors.js';

export class BenchmarkError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'BENCHMARK', ...options });
    this.name = 'BenchmarkError';
  }
}

/** The measures a mill is compared on, and which way is better. */
export const MEASURES = {
  lrf: { label: 'lumber recovery factor', better: 'high', basis: 'cubic' },
  overrunShare: { label: 'overrun', better: 'high', basis: 'rule' },
  gradeYield: { label: 'on grade share', better: 'high', basis: 'grade rules' },
  degradeShare: { label: 'drying degrade', better: 'low', basis: 'none' },
  targetOversize: { label: 'sawing oversize', better: 'low', basis: 'none' },
};

/** Checks a set of readings can honestly be compared. */
export function comparable(readings, measure) {
  const spec = MEASURES[measure];
  if (!spec) {
    throw new BenchmarkError(`nobody benchmarks on ${measure}`, { path: 'measure' });
  }
  if (spec.basis === 'none') return { comparable: true, reasons: [] };

  const bases = new Set(readings.map((reading) => reading.basis ?? null));
  if (bases.has(null)) {
    return {
      comparable: false,
      reasons: [`${measure} is measured on a ${spec.basis}, and one reading does not say which`],
    };
  }
  if (bases.size > 1) {
    return {
      comparable: false,
      reasons: [
        `these readings are on ${[...bases].sort().join(' and ')}, which are not the same ${spec.basis}`,
      ],
    };
  }
  return { comparable: true, reasons: [] };
}

/**
 * Ranks a set of readings on one measure and reports the gap as well as the
 * place. Refuses outright when the readings are not comparable.
 */
export function rank(readings, measure) {
  const spec = MEASURES[measure];
  const check = comparable(readings, measure);
  if (!check.comparable) {
    throw new BenchmarkError(check.reasons.join('; '), { path: 'readings' });
  }
  if (readings.length < 2) {
    throw new BenchmarkError('a ranking needs at least two readings', { path: 'readings' });
  }

  const sorted = [...readings].sort((a, b) =>
    spec.better === 'high' ? b.value - a.value : a.value - b.value
  );
  const best = sorted[0].value;

  return sorted.map((reading, index) => ({
    ...reading,
    place: index + 1,
    of: sorted.length,
    gapToBest: round4(Math.abs(reading.value - best)),
    gapShare: best !== 0 ? round4(Math.abs(reading.value - best) / Math.abs(best)) : null,
  }));
}

/** The middle of a set of readings, which is the honest comparison point. */
export function median(readings) {
  if (readings.length === 0) {
    throw new BenchmarkError('a median needs readings', { path: 'readings' });
  }
  const values = readings.map((reading) => reading.value).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : round4((values[middle - 1] + values[middle]) / 2);
}

/**
 * One mill against a peer set, on every measure it has a reading for. Measures
 * where the peer set is not comparable come back named rather than dropped
 * quietly.
 */
export function against(mill, peers, options = {}) {
  const { measures = Object.keys(MEASURES) } = options;
  const rows = [];
  const skipped = [];

  for (const measure of measures) {
    if (mill[measure] === undefined) continue;
    const readings = [
      { mill: mill.name, value: mill[measure], basis: mill.basis?.[measure] },
      ...peers
        .filter((peer) => peer[measure] !== undefined)
        .map((peer) => ({ mill: peer.name, value: peer[measure], basis: peer.basis?.[measure] })),
    ];
    const check = comparable(readings, measure);
    if (!check.comparable) {
      skipped.push({ measure, reasons: check.reasons });
      continue;
    }
    if (readings.length < 2) {
      skipped.push({ measure, reasons: ['no peer reported this measure'] });
      continue;
    }
    const ranked = rank(readings, measure);
    const ours = ranked.find((row) => row.mill === mill.name);
    rows.push({
      measure,
      label: MEASURES[measure].label,
      value: mill[measure],
      place: ours.place,
      of: ours.of,
      gapToBest: ours.gapToBest,
      median: median(readings),
      aboveMedian:
        MEASURES[measure].better === 'high'
          ? mill[measure] > median(readings)
          : mill[measure] < median(readings),
    });
  }

  return {
    mill: mill.name,
    peers: peers.length,
    rows,
    skipped,
    firsts: rows.filter((row) => row.place === 1).length,
    lasts: rows.filter((row) => row.place === row.of).length,
  };
}

/** Where a mill has moved between two of its own periods. */
export function movement(before, after, options = {}) {
  const { measures = Object.keys(MEASURES) } = options;
  return measures
    .filter((measure) => before[measure] !== undefined && after[measure] !== undefined)
    .map((measure) => {
      const spec = MEASURES[measure];
      const change = after[measure] - before[measure];
      return {
        measure,
        label: spec.label,
        before: before[measure],
        after: after[measure],
        change: round4(change),
        improved: spec.better === 'high' ? change > 0 : change < 0,
        share: before[measure] !== 0 ? round2(change / Math.abs(before[measure])) : null,
      };
    });
}
