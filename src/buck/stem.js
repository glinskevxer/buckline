/**
 * The stem.
 *
 * A felled tree before anybody has cut it into logs. It is described by a
 * taper profile rather than a single taper figure, because a real stem does
 * not open out at one rate: the butt flares over the first few feet, the merch
 * length runs almost straight, and the top falls away fast once the crown
 * starts.
 *
 * The profile is a list of breakpoints, each giving a diameter at a height.
 * Between two breakpoints the diameter runs straight, which is close enough
 * over a few feet and has the useful property that a cut anywhere has an exact
 * answer rather than an interpolated guess that two callers disagree about.
 */

import { BucklineError } from '../errors.js';
import { round3 } from '../num.js';
import { checkStem } from '../limits.js';

export class BuckError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'BUCK', ...options });
    this.name = 'BuckError';
  }
}

/** Kerf lost at every crosscut in the woods. */
export const CROSSCUT_KERF_FT = 0.05;

/**
 * Builds a stem. `profile` is a list of `{ atFt, diameterIn }` outside bark,
 * lowest first, and it has to start at the stump and run to the tip.
 */
export function makeStem(spec) {
  const { id, species, profile, defects = [], stumpHeightFt = 0.5, position = 'butt' } = spec;
  if (!id) {
    throw new BuckError('a stem needs an identifier', { path: 'id' });
  }
  checkStem(spec);
  if (!Array.isArray(profile) || profile.length < 2) {
    throw new BuckError('a stem profile needs at least two breakpoints', { path: 'profile' });
  }
  for (let i = 1; i < profile.length; i += 1) {
    if (profile[i].atFt <= profile[i - 1].atFt) {
      throw new BuckError('profile breakpoints must climb the stem', { path: 'profile' });
    }
    if (profile[i].diameterIn > profile[i - 1].diameterIn + 1e-9) {
      throw new BuckError('a stem cannot get fatter as it goes up', { path: 'profile' });
    }
  }

  return {
    id,
    species,
    position,
    profile: profile.map((point) => ({ ...point })),
    defects: defects.map((defect) => ({ ...defect })),
    stumpHeightFt,
    totalLengthFt: round3(profile.at(-1).atFt - profile[0].atFt),
    buttDiameterIn: profile[0].diameterIn,
    tipDiameterIn: profile.at(-1).diameterIn,
  };
}

/** Diameter outside bark at a height up the stem. */
export function diameterAtHeight(stem, atFt) {
  const first = stem.profile[0];
  const last = stem.profile.at(-1);
  if (atFt < first.atFt - 1e-9 || atFt > last.atFt + 1e-9) {
    throw new BuckError(`${atFt} feet is off a stem that runs ${first.atFt} to ${last.atFt}`, {
      path: 'atFt',
    });
  }
  for (let i = 1; i < stem.profile.length; i += 1) {
    const low = stem.profile[i - 1];
    const high = stem.profile[i];
    if (atFt <= high.atFt + 1e-9) {
      const span = high.atFt - low.atFt;
      const share = span === 0 ? 0 : (atFt - low.atFt) / span;
      return round3(low.diameterIn + share * (high.diameterIn - low.diameterIn));
    }
  }
  return last.diameterIn;
}

/** The highest point on the stem still at or above a merchantable top. */
export function merchantableHeightFt(stem, topDiameterIn) {
  const first = stem.profile[0];
  if (diameterAtHeight(stem, first.atFt) < topDiameterIn) return first.atFt;

  for (let i = 1; i < stem.profile.length; i += 1) {
    const low = stem.profile[i - 1];
    const high = stem.profile[i];
    if (high.diameterIn <= topDiameterIn) {
      const span = high.diameterIn - low.diameterIn;
      if (span === 0) return round3(high.atFt);
      const share = (topDiameterIn - low.diameterIn) / span;
      return round3(low.atFt + share * (high.atFt - low.atFt));
    }
  }
  return round3(stem.profile.at(-1).atFt);
}

/** Taper over a stretch of the stem, in inches of diameter per foot. */
export function taperOver(stem, fromFt, toFt) {
  if (toFt <= fromFt) {
    throw new BuckError('a taper needs a stretch with length in it', { path: 'toFt' });
  }
  const low = diameterAtHeight(stem, fromFt);
  const high = diameterAtHeight(stem, toFt);
  return round3((low - high) / (toFt - fromFt));
}

/** The defects that fall inside a stretch of the stem. */
export function defectsBetween(stem, fromFt, toFt) {
  return stem.defects
    .filter((defect) => {
      const start = defect.atFt ?? 0;
      const end = start + (defect.lengthFt ?? 0);
      return end > fromFt + 1e-9 && start < toFt - 1e-9;
    })
    .map((defect) => ({
      ...defect,
      startFt: round3(Math.max(0, (defect.atFt ?? 0) - fromFt)),
    }));
}

/**
 * Where a bucker could sensibly cut. The stump, every defect boundary, the
 * merchantable top, and nothing else. Cutting in clear wood only throws length
 * away, and cutting inside a defect gains nothing that cutting at its edge
 * does not.
 */
export function cutCandidates(stem, options = {}) {
  const { topDiameterIn = 8 } = options;
  const top = merchantableHeightFt(stem, topDiameterIn);
  const points = new Set([round3(stem.stumpHeightFt), round3(top)]);

  for (const defect of stem.defects) {
    const start = defect.atFt ?? 0;
    const end = start + (defect.lengthFt ?? 0);
    for (const point of [start, end]) {
      if (point > stem.stumpHeightFt + 1e-9 && point < top - 1e-9) {
        points.add(round3(point));
      }
    }
  }
  return [...points].sort((a, b) => a - b);
}
