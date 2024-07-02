/**
 * Kiln schedules.
 *
 * A schedule is a list of steps. Each step names a moisture content range, a
 * dry bulb temperature and a wet bulb depression, and the charge moves to the
 * next step when the wettest sample board reaches the bottom of the current
 * range. Nothing is on a clock: the wood decides when the step ends.
 *
 * Which schedule a charge runs is not a choice. It falls out of the species
 * and the thickness together. A dense species dries slowly and checks easily,
 * so it gets a milder start. A thick piece has further for the water to travel
 * and a steeper gradient across it, so it gets a milder start too. A thick
 * piece of a dense species gets the mildest schedule the yard runs, and it
 * takes three weeks.
 */

import { BucklineError } from '../errors.js';
import { lookupSpecies } from '../model/species.js';
import { round1 } from '../num.js';

export class KilnError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'KILN', ...options });
    this.name = 'KilnError';
  }
}

/**
 * The schedules, mildest first. `severity` is the yard's own ranking and it is
 * what the selection works on.
 */
const SCHEDULES = {
  'T2-C1': {
    id: 'T2-C1',
    label: 'mild hardwood',
    severity: 1,
    steps: [
      { fromMc: 100, toMc: 40, dryBulbF: 110, depressionF: 4 },
      { fromMc: 40, toMc: 35, dryBulbF: 110, depressionF: 7 },
      { fromMc: 35, toMc: 30, dryBulbF: 110, depressionF: 11 },
      { fromMc: 30, toMc: 25, dryBulbF: 120, depressionF: 20 },
      { fromMc: 25, toMc: 20, dryBulbF: 130, depressionF: 30 },
      { fromMc: 20, toMc: 15, dryBulbF: 140, depressionF: 45 },
      { fromMc: 15, toMc: 7, dryBulbF: 160, depressionF: 50 },
    ],
  },
  'T4-C2': {
    id: 'T4-C2',
    label: 'standard hardwood',
    severity: 2,
    steps: [
      { fromMc: 100, toMc: 50, dryBulbF: 120, depressionF: 6 },
      { fromMc: 50, toMc: 40, dryBulbF: 120, depressionF: 9 },
      { fromMc: 40, toMc: 35, dryBulbF: 120, depressionF: 14 },
      { fromMc: 35, toMc: 30, dryBulbF: 130, depressionF: 25 },
      { fromMc: 30, toMc: 25, dryBulbF: 140, depressionF: 35 },
      { fromMc: 25, toMc: 20, dryBulbF: 150, depressionF: 50 },
      { fromMc: 20, toMc: 7, dryBulbF: 170, depressionF: 55 },
    ],
  },
  'T8-D4': {
    id: 'T8-D4',
    label: 'fast softwood',
    severity: 3,
    steps: [
      { fromMc: 100, toMc: 40, dryBulbF: 140, depressionF: 20 },
      { fromMc: 40, toMc: 30, dryBulbF: 150, depressionF: 30 },
      { fromMc: 30, toMc: 20, dryBulbF: 170, depressionF: 45 },
      { fromMc: 20, toMc: 12, dryBulbF: 180, depressionF: 60 },
    ],
  },
};

/** The schedule by name. */
export function schedule(id) {
  const found = SCHEDULES[id];
  if (!found) {
    throw new KilnError(`no kiln schedule called ${id}`, { path: 'schedule' });
  }
  return found;
}

/** Every schedule the yard runs, mildest first. */
export function scheduleIds() {
  return Object.values(SCHEDULES)
    .sort((a, b) => a.severity - b.severity)
    .map((entry) => entry.id);
}

/**
 * Picks the schedule for a charge. Softwood dries on its own schedule
 * regardless of thickness. Hardwood steps down to the mild schedule when the
 * wood is dense or thick, and a piece that is both gets the mild one anyway.
 */
export function scheduleFor(species, thicknessIn) {
  const entry = lookupSpecies(species);
  if (thicknessIn <= 0) {
    throw new KilnError('a charge needs a thickness', { path: 'thicknessIn' });
  }

  if (entry.group === 'softwood') {
    return { schedule: schedule('T8-D4'), because: 'softwood dries on the fast schedule' };
  }

  const dense = entry.densityLbPerFt3 >= 43;
  const thick = thicknessIn >= 1.75;

  if (dense || thick) {
    const because =
      dense && thick
        ? `${entry.key} is dense and ${thicknessIn} inch stock is thick`
        : dense
          ? `${entry.key} is dense at ${entry.densityLbPerFt3} pounds`
          : `${thicknessIn} inch stock is thick`;
    return { schedule: schedule('T2-C1'), because };
  }

  return { schedule: schedule('T4-C2'), because: 'light hardwood in thin stock' };
}

/** The step a charge at this moisture content is on, or null once it is dry. */
export function stepAt(scheduleId, moisturePct) {
  const found = schedule(scheduleId);
  const index = found.steps.findIndex(
    (step) => moisturePct <= step.fromMc + 1e-9 && moisturePct > step.toMc - 1e-9
  );
  if (index === -1) return null;
  return { index, ...found.steps[index] };
}

/**
 * The equilibrium moisture content the air in the kiln is holding, worked out
 * from the dry bulb and the depression. This is what the wood is being pulled
 * toward, and the gap between it and the wood is what does the drying and the
 * damage in equal measure.
 */
export function equilibriumMc(dryBulbF, depressionF) {
  if (depressionF < 0) {
    throw new KilnError('wet bulb depression must not be negative', { path: 'depressionF' });
  }
  const base = 26 - 0.5 * depressionF - 0.02 * (dryBulbF - 100);
  return round1(Math.max(1.5, base));
}

/**
 * The drying gradient a step imposes, which is the risk number.
 *
 * It reads the wrong way round at first glance. The gradient is gentle while
 * the wood is green and steepens as the charge dries down, which looks
 * backwards until you remember what is being protected. Above fibre saturation
 * the shell is shrinking and the core is not, and forcing that is what splits
 * a board. Below it the whole board shrinks together and a hard pull is safe.
 */
export function gradient(scheduleId, moisturePct) {
  const step = stepAt(scheduleId, moisturePct);
  if (!step) return null;
  const target = equilibriumMc(step.dryBulbF, step.depressionF);
  return { stepIndex: step.index, targetEmc: target, gradient: round1(moisturePct / target) };
}
