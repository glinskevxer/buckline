/**
 * What a veneer bolt yields.
 *
 * A veneer log is turned against a knife and peeled into one continuous
 * ribbon. The arithmetic is the area of the ring between the log and the core
 * that is left on the chucks, divided by the thickness, and that part is easy.
 *
 * Three things make it less easy and all three are why a lathe operator earns
 * their money.
 *
 * Round up is the first turn or two before the knife is taking a full sheet.
 * It comes off the outside, which is where the best veneer is, and it is
 * decided by how far from round the log is rather than by its size.
 *
 * The core is what the chucks hold, and it is a fixed diameter whatever the
 * log. That means a small log loses a far bigger share of itself to the core
 * than a large one, and it is why a veneer buyer pays for diameter far more
 * steeply than a sawmill does.
 *
 * Grade falls as the peel goes in. The outside is clear and the middle is
 * where the knots the tree grew forty years ago are, so the share of face
 * grade veneer depends on where in the log you are, not on the log as a whole.
 */

import { round2, round4 } from '../../num.js';
import { GradeError } from '../../errors.js';

/** Diameter of the core the chucks hold, in inches. */
export const CHUCK_CORE_IN = 3.5;

/** Common veneer thicknesses in inches. */
export const VENEER_THICKNESSES = [1 / 32, 1 / 24, 1 / 20, 1 / 16, 1 / 10];

/**
 * The diameter the knife starts taking a full sheet at. A log two inches out
 * of round loses two inches of diameter before it is round, and no amount of
 * skill recovers it.
 */
export function roundUpDiameter(diameterIn, outOfRoundIn) {
  if (!(diameterIn > 0)) {
    throw new GradeError('a bolt needs a diameter', { path: 'diameterIn' });
  }
  if (outOfRoundIn < 0) {
    throw new GradeError('out of round cannot be negative', { path: 'outOfRoundIn' });
  }
  return round2(Math.max(CHUCK_CORE_IN, diameterIn - outOfRoundIn));
}

/**
 * Square feet of veneer at a thickness, from the ring between the round up
 * diameter and the core.
 */
export function veneerArea(bolt, options = {}) {
  const { thicknessIn = 1 / 20, coreIn = CHUCK_CORE_IN, outOfRoundIn = 0 } = options;
  if (!(thicknessIn > 0)) {
    throw new GradeError('veneer needs a thickness', { path: 'thicknessIn' });
  }
  if (coreIn < CHUCK_CORE_IN) {
    throw new GradeError(`the chucks cannot hold a core under ${CHUCK_CORE_IN} inches`, {
      path: 'coreIn',
    });
  }

  const startIn = roundUpDiameter(bolt.diameterIn, outOfRoundIn);
  if (startIn <= coreIn) {
    return { squareFeet: 0, ribbonFeet: 0, startIn, coreIn, reason: 'nothing outside the core' };
  }

  // The ribbon length is the area of the ring divided by the thickness.
  const ringArea = (Math.PI / 4) * (startIn * startIn - coreIn * coreIn);
  const ribbonInches = ringArea / thicknessIn;
  const squareFeet = (ribbonInches * bolt.lengthIn) / 144;

  return {
    squareFeet: round2(squareFeet),
    ribbonFeet: round2(ribbonInches / 12),
    startIn,
    coreIn,
    reason: null,
  };
}

/**
 * What share of the bolt is lost to the core. This is the number that shows
 * why veneer buyers will not look at a small log.
 */
export function coreLossShare(diameterIn, options = {}) {
  const { coreIn = CHUCK_CORE_IN } = options;
  if (!(diameterIn > 0)) {
    throw new GradeError('a bolt needs a diameter', { path: 'diameterIn' });
  }
  if (diameterIn <= coreIn) return 1;
  return round4((coreIn * coreIn) / (diameterIn * diameterIn));
}

/**
 * The grade split down the peel. `clearFaces` is how many of the four faces
 * were clear when the log was bought, and it sets how far in the face grade
 * veneer runs before the knots start.
 */
export function gradeSplit(bolt, options = {}) {
  const { clearFaces = 4, coreIn = CHUCK_CORE_IN, outOfRoundIn = 0 } = options;
  if (clearFaces < 0 || clearFaces > 4) {
    throw new GradeError('a bolt has four faces', { path: 'clearFaces' });
  }
  const startIn = roundUpDiameter(bolt.diameterIn, outOfRoundIn);
  if (startIn <= coreIn) {
    return { face: 0, back: 0, core: 1 };
  }

  // The face grade runs from the outside in, as far as the clear faces carry
  // it. Four clear faces reach three quarters of the way to the core; none
  // reach nowhere at all.
  const reach = (clearFaces / 4) * 0.75;
  const faceStop = startIn - (startIn - coreIn) * reach;

  const total = startIn * startIn - coreIn * coreIn;
  const face = (startIn * startIn - faceStop * faceStop) / total;
  return {
    face: round4(face),
    back: round4(1 - face),
    faceStopIn: round2(faceStop),
  };
}

/** Square feet of each grade, at a thickness. */
export function yieldByGrade(bolt, options = {}) {
  const area = veneerArea(bolt, options);
  const split = gradeSplit(bolt, options);
  return {
    ...area,
    faceSquareFeet: round2(area.squareFeet * split.face),
    backSquareFeet: round2(area.squareFeet * split.back),
    faceShare: split.face,
  };
}

/**
 * What the bolt is worth, given a price per thousand square feet for each
 * grade. Veneer is sold by the surface, never by the board foot, and mixing
 * the two units is the commonest mistake in a veneer settlement.
 */
export function veneerValue(bolt, prices, options = {}) {
  const yields = yieldByGrade(bolt, options);
  const face = (yields.faceSquareFeet / 1000) * (prices.facePerMsf ?? 0);
  const back = (yields.backSquareFeet / 1000) * (prices.backPerMsf ?? 0);
  return {
    ...yields,
    faceValue: round2(face),
    backValue: round2(back),
    value: round2(face + back),
  };
}
