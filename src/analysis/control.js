/**
 * Control charts.
 *
 * A sawmill measures the same thing over and over: board thickness off a saw,
 * pounds per thousand off a weight scale, overrun against a rule. Every one of
 * those wanders, and the question is never "did it move" but "did it move for
 * a reason". A control chart answers that and nothing else answers it: the
 * eye sees a trend in any run of numbers, and a mill that resets the setworks
 * every time it sees one makes the saw worse.
 *
 * The limits are three standard deviations from the mean of a stable period,
 * and they are set once from that period rather than recomputed from the data
 * being judged. Recomputing them is the mistake that makes every chart look
 * fine: a process that has drifted out has drifted its own limits with it.
 *
 * The run rules are the standard four. Any one of them firing is a signal, and
 * which one fired says something different about what went wrong.
 */

import { round, round2 } from '../num.js';
import { BucklineError } from '../errors.js';

export class ControlError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'CONTROL', ...options });
    this.name = 'ControlError';
  }
}

/** Builds limits from a period the mill says was running properly. */
export function makeLimits(baseline, options = {}) {
  const { sigma = 3, label = 'measurement' } = options;
  if (!Array.isArray(baseline) || baseline.length < 8) {
    throw new ControlError('limits need at least eight readings from a stable period', {
      path: 'baseline',
    });
  }
  const n = baseline.length;
  const mean = baseline.reduce((total, value) => total + value, 0) / n;
  const variance = baseline.reduce((total, value) => total + (value - mean) ** 2, 0) / (n - 1);
  const deviation = Math.sqrt(variance);
  if (deviation === 0) {
    throw new ControlError('a baseline with no variation cannot set limits', { path: 'baseline' });
  }

  // Six places, not four. A four quarter board is measured in thousandths and
  // its deviation runs to a hundredth of that, so rounding the limits to four
  // places moves them by a tenth of a sigma.
  return {
    label,
    readings: n,
    mean: round(mean, 6),
    deviation: round(deviation, 6),
    sigma,
    upper: round(mean + sigma * deviation, 6),
    lower: round(mean - sigma * deviation, 6),
    zoneA: sigma - 1,
    zoneB: sigma - 2,
  };
}

/** How many standard deviations a reading sits from the mean. */
export function zScore(limits, value) {
  return round((value - limits.mean) / limits.deviation, 6);
}

/**
 * The four run rules, checked against a series read newest last.
 *
 *   outside   one point past three sigma
 *   shift     nine in a row on one side of the mean
 *   trend     six in a row climbing or falling
 *   drift     two of three past two sigma on the same side
 */
export function runRules(limits, series) {
  if (!Array.isArray(series) || series.length === 0) {
    throw new ControlError('the run rules need a series', { path: 'series' });
  }
  const z = series.map((value) => zScore(limits, value));
  const signals = [];

  z.forEach((value, index) => {
    if (Math.abs(value) > limits.sigma) {
      signals.push({
        rule: 'outside',
        at: index,
        z: value,
        says: 'something changed at that point',
      });
    }
  });

  for (let i = 8; i < z.length; i += 1) {
    const window = z.slice(i - 8, i + 1);
    if (window.every((value) => value > 0) || window.every((value) => value < 0)) {
      signals.push({ rule: 'shift', at: i, z: z[i], says: 'the process has moved off target' });
    }
  }

  for (let i = 5; i < z.length; i += 1) {
    const window = z.slice(i - 5, i + 1);
    const climbing = window.every((value, index) => index === 0 || value > window[index - 1]);
    const falling = window.every((value, index) => index === 0 || value < window[index - 1]);
    if (climbing || falling) {
      signals.push({
        rule: 'trend',
        at: i,
        z: z[i],
        says: climbing ? 'something is wearing or loosening' : 'something is tightening',
      });
    }
  }

  for (let i = 2; i < z.length; i += 1) {
    const window = z.slice(i - 2, i + 1);
    const high = window.filter((value) => value > limits.zoneA).length;
    const low = window.filter((value) => value < -limits.zoneA).length;
    if (high >= 2 || low >= 2) {
      signals.push({ rule: 'drift', at: i, z: z[i], says: 'the process is edging out' });
    }
  }

  return {
    label: limits.label,
    points: series.length,
    z,
    signals: signals.sort((a, b) => a.at - b.at || a.rule.localeCompare(b.rule)),
    inControl: signals.length === 0,
  };
}

/**
 * The capability of a process against a specification. A saw can be perfectly
 * in control and still be incapable of holding the target, and the two get
 * confused constantly: in control means predictable, capable means good
 * enough, and they are independent.
 */
export function capability(limits, spec) {
  const { lower, upper } = spec;
  if (!(upper > lower)) {
    throw new ControlError('a specification needs an upper over a lower', { path: 'spec' });
  }
  const width = 6 * limits.deviation;
  const cp = (upper - lower) / width;
  const cpk = Math.min(
    (upper - limits.mean) / (3 * limits.deviation),
    (limits.mean - lower) / (3 * limits.deviation)
  );
  return {
    cp: round2(cp),
    cpk: round2(cpk),
    centred: Math.abs(cp - cpk) < 0.05,
    capable: cpk >= 1,
    says: cpk >= 1 ? 'holds the specification' : 'cannot hold the specification as it stands',
  };
}
