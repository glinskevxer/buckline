/**
 * A kiln run.
 *
 * The charge goes in, the schedule starts at step one, and the operator reads
 * the sample boards every shift. When the wettest sample reaches the bottom of
 * the current step the kiln advances. Nothing about that is on a clock, and a
 * run recorded against a clock is a run nobody can learn anything from
 * afterwards.
 *
 * What is worth recording is every reading and every advance, in order, with
 * the moisture that caused it. Two runs of the same charge on the same
 * schedule that took nine days and fourteen days differ somewhere in that
 * list, and the list is the only place the answer can be.
 */

import { round1, round2 } from '../num.js';
import { KilnError, schedule, stepAt } from './schedule.js';
import { chargeSpread } from './moisture.js';

/** Starts a run. */
export function startRun(charge, options = {}) {
  const { startedAt, startMoisturePct = 60, runId = null } = options;
  if (!startedAt) {
    throw new KilnError('a run needs a start time', { path: 'startedAt' });
  }
  if (!charge.runnable) {
    throw new KilnError(`this charge is not runnable: ${charge.reason}`, { path: 'charge' });
  }

  const found = stepAt(charge.schedule, startMoisturePct);
  if (!found) {
    throw new KilnError(`${startMoisturePct} percent is off the ${charge.schedule} schedule`, {
      path: 'startMoisturePct',
    });
  }

  return {
    runId,
    kilnId: charge.kilnId,
    schedule: charge.schedule,
    boardFeet: charge.boardFeet,
    startedAt,
    finishedAt: null,
    stepIndex: found.index,
    moisturePct: startMoisturePct,
    readings: [],
    advances: [],
  };
}

/**
 * Records a reading and advances the step if the wettest sample has reached
 * the bottom of it. The advance is driven by the reading, never by elapsed
 * time, and a reading that goes the wrong way is recorded rather than
 * discarded: wood does take water back up when a kiln is misbehaving.
 */
export function record(run, reading) {
  const { at, samples } = reading;
  if (!at) {
    throw new KilnError('a reading needs a time', { path: 'at' });
  }
  if (run.finishedAt) {
    throw new KilnError('this run has already finished', { path: 'run' });
  }
  const spread = chargeSpread(samples);
  const wettest = spread.wettest;

  const next = {
    ...run,
    moisturePct: wettest,
    readings: [
      ...run.readings,
      { at, wettest, driest: spread.driest, mean: spread.mean, even: spread.even },
    ],
    advances: [...run.advances],
  };

  const steps = schedule(run.schedule).steps;
  let index = run.stepIndex;
  while (index < steps.length && wettest <= steps[index].toMc + 1e-9) {
    index += 1;
    next.advances.push({
      at,
      from: index - 1,
      to: index < steps.length ? index : null,
      atMoisturePct: wettest,
    });
  }
  next.stepIndex = Math.min(index, steps.length - 1);

  if (index >= steps.length) {
    next.finishedAt = at;
  }
  return next;
}

/** Runs a whole list of readings through in order. */
export function replay(run, readings) {
  return readings.reduce(
    (state, reading) => (state.finishedAt ? state : record(state, reading)),
    run
  );
}

/** How long the run took, and how long each step took. */
export function runTiming(run) {
  if (run.readings.length === 0) {
    return { hours: 0, steps: [], averageDropPerDay: 0 };
  }
  const start = Date.parse(run.startedAt);
  const end = Date.parse(run.finishedAt ?? run.readings.at(-1).at);
  const hours = round1((end - start) / 3600000);

  const steps = [];
  let previous = start;
  let previousStep = 0;
  for (const advance of run.advances) {
    const at = Date.parse(advance.at);
    steps.push({
      step: previousStep,
      hours: round1((at - previous) / 3600000),
      leftAtMoisturePct: advance.atMoisturePct,
    });
    previous = at;
    previousStep = advance.to ?? previousStep;
  }

  const first = run.readings[0].wettest;
  const last = run.readings.at(-1).wettest;
  const days = hours / 24;
  return {
    hours,
    days: round1(days),
    steps,
    averageDropPerDay: days > 0 ? round2((first - last) / days) : 0,
  };
}

/** Whether the run is finished, and where it has got to if not. */
export function runState(run) {
  const steps = schedule(run.schedule).steps;
  const step = steps[run.stepIndex];
  return {
    finished: Boolean(run.finishedAt),
    stepIndex: run.stepIndex,
    stepsRemaining: steps.length - run.stepIndex - 1,
    moisturePct: run.moisturePct,
    target: step ? step.toMc : null,
    dryBulbF: step ? step.dryBulbF : null,
    depressionF: step ? step.depressionF : null,
  };
}
