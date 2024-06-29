/**
 * Target sizing.
 *
 * The rough green thickness a mill saws to is not the finished thickness plus
 * a guess. It is the finished thickness plus four separate allowances, and the
 * fourth is the one mills get wrong: the saw does not cut the same thickness
 * twice, and the target has to cover the thin end of that spread, not the
 * middle of it.
 *
 * A board that comes out thin is worth nothing, because it will not clean up
 * at the planer. A board that comes out thick is worth its board feet minus
 * the sawdust that should not have been made. So the whole exercise is
 * choosing how much of the thin tail to accept, and every thousandth of an
 * inch of saw variation costs two thousandths on every board in the mill.
 *
 * Sawing variation has two parts and they add in quadrature, not straight.
 * Within board variation is the saw wandering down one cut. Between board
 * variation is the setworks landing in a different place each time. Halving
 * one of them barely moves the total if the other is untouched.
 */

import { lookupSpecies } from '../model/species.js';
import { round3, round4 } from '../num.js';
import { MillError } from './pattern.js';
import { FIBRE_SATURATION_PCT } from '../kiln/moisture.js';

/** Planing allowances by how the board will be surfaced. */
export const PLANING_ALLOWANCE_IN = {
  rough: 0,
  s1s: 0.0625,
  s2s: 0.125,
};

/** How many standard deviations of the thin tail the target covers. */
export const DEFAULT_COVERAGE_SIGMA = 2;

/** Typical machine variation, in inches of standard deviation. */
export const MACHINE_VARIATION = {
  'thin kerf band': { withinIn: 0.008, betweenIn: 0.012 },
  'wide band': { withinIn: 0.012, betweenIn: 0.018 },
  circular: { withinIn: 0.02, betweenIn: 0.025 },
  scragg: { withinIn: 0.03, betweenIn: 0.035 },
};

/** The two variations added the way variations add. */
export function totalVariationIn(machine) {
  const spec = MACHINE_VARIATION[machine];
  if (!spec) {
    throw new MillError(`no variation figures for a ${machine}`, { path: 'machine' });
  }
  return round4(Math.sqrt(spec.withinIn ** 2 + spec.betweenIn ** 2));
}

/**
 * Shrinkage allowance in inches. Thickness moves on the radial figure for
 * flatsawn stock, and nothing moves until the wood is below fibre saturation.
 */
export function shrinkageAllowanceIn(species, finishedThicknessIn, toMoisturePct, options = {}) {
  const { quartersawn = false } = options;
  const entry = lookupSpecies(species);
  if (toMoisturePct >= FIBRE_SATURATION_PCT) return 0;
  const pct = quartersawn ? entry.shrinkTangentialPct : entry.shrinkRadialPct;
  const progress = (FIBRE_SATURATION_PCT - toMoisturePct) / FIBRE_SATURATION_PCT;
  return round4(finishedThicknessIn * (pct / 100) * progress);
}

/**
 * The green target thickness, with every allowance itemised so a mill can see
 * which one it is paying for.
 */
export function targetThickness(request) {
  const {
    species,
    finishedThicknessIn,
    machine = 'wide band',
    surfacing = 's2s',
    toMoisturePct = 8,
    coverageSigma = DEFAULT_COVERAGE_SIGMA,
    quartersawn = false,
  } = request;

  if (!(finishedThicknessIn > 0)) {
    throw new MillError('a target needs a finished thickness', { path: 'finishedThicknessIn' });
  }
  const planing = PLANING_ALLOWANCE_IN[surfacing];
  if (planing === undefined) {
    throw new MillError(`no planing allowance for ${surfacing}`, { path: 'surfacing' });
  }
  if (coverageSigma < 0) {
    throw new MillError('coverage cannot be negative', { path: 'coverageSigma' });
  }

  const variation = totalVariationIn(machine);
  const shrinkage = shrinkageAllowanceIn(species, finishedThicknessIn, toMoisturePct, {
    quartersawn,
  });
  const sawingAllowance = round4(coverageSigma * variation);

  const target = round3(finishedThicknessIn + planing + shrinkage + sawingAllowance);

  return {
    species,
    finishedThicknessIn,
    allowances: {
      planingIn: planing,
      shrinkageIn: shrinkage,
      sawingIn: sawingAllowance,
    },
    variationIn: variation,
    targetThicknessIn: target,
    oversizeIn: round3(target - finishedThicknessIn),
    machine,
    surfacing,
  };
}

/**
 * What a mill saves by improving the saw. This is the number that justifies a
 * guide change or a new setworks, and it is per thousand board feet sawn.
 */
export function savingFromMachine(request, betterMachine) {
  const before = targetThickness(request);
  const after = targetThickness({ ...request, machine: betterMachine });
  const savedIn = round4(before.targetThicknessIn - after.targetThicknessIn);
  const share = savedIn / before.targetThicknessIn;
  return {
    from: request.machine ?? 'wide band',
    to: betterMachine,
    savedIn,
    shareOfTarget: round4(share),
    extraBoardFeetPerMbf: round3(share * 1000),
    worthDoing: savedIn > 0,
  };
}

/** Whether a measured board would have cleaned up at the planer. */
export function cleansUp(measuredThicknessIn, request) {
  const target = targetThickness(request);
  const needed = request.finishedThicknessIn + PLANING_ALLOWANCE_IN[target.surfacing];
  return {
    measuredThicknessIn,
    neededIn: round3(needed),
    cleansUp: measuredThicknessIn >= needed - 1e-9,
    overTargetIn: round3(measuredThicknessIn - target.targetThicknessIn),
  };
}
