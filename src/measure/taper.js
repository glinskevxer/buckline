/**
 * Taper.
 *
 * A log is a truncated cone, and how fast it opens out decides three separate
 * things: how much volume a segment scaling rule finds, where a long stick can
 * be cut and still make a merchantable top, and whether the large end carries
 * enough wood to be worth the extra freight.
 *
 * Taper is carried here as inches of diameter gained per foot of length,
 * measured from the small end toward the butt. A butt log off a well formed
 * tree runs about an inch in eight feet. An upper log runs faster, and a log
 * with a swelled butt runs faster still over the last two feet and then
 * settles down.
 */

import { requireFinite, requirePositive, round3 } from '../num.js';

/** Typical taper in inches of diameter per foot, by log position. */
export const TYPICAL_TAPER = {
  butt: 0.125,
  second: 0.1,
  upper: 0.09,
};

/**
 * The taper that segment based log rules assume when the scaler has only
 * measured the small end. International uses half an inch in four feet.
 */
export const ASSUMED_TAPER_PER_FOOT = 0.125;

/**
 * Taper measured from both ends of a real log. Returns inches of diameter per
 * foot. A log measured smaller at the butt than at the top is a measurement
 * error, not a negative taper, so it throws.
 */
export function taperRate(smallEndIn, largeEndIn, lengthFt) {
  requirePositive('smallEndIn', smallEndIn);
  requirePositive('largeEndIn', largeEndIn);
  requirePositive('lengthFt', lengthFt);
  if (largeEndIn + 1e-9 < smallEndIn) {
    throw new RangeError(
      `large end ${largeEndIn} is smaller than small end ${smallEndIn}, check the tape`
    );
  }
  return (largeEndIn - smallEndIn) / lengthFt;
}

/**
 * Diameter at a distance from the small end, walking toward the butt.
 * Distances beyond the log throw, because extrapolating taper off the end of
 * a stick has produced more bad bucking decisions than any other shortcut.
 */
export function diameterAt(smallEndIn, taperPerFoot, distanceFt, options = {}) {
  const { lengthFt = Infinity } = options;
  requirePositive('smallEndIn', smallEndIn);
  requireFinite('taperPerFoot', taperPerFoot);
  requireFinite('distanceFt', distanceFt);
  if (taperPerFoot < 0) {
    throw new RangeError(`taperPerFoot must not be negative, got ${taperPerFoot}`);
  }
  if (distanceFt < 0) {
    throw new RangeError(`distanceFt must not be negative, got ${distanceFt}`);
  }
  if (distanceFt > lengthFt + 1e-9) {
    throw new RangeError(`distanceFt ${distanceFt} runs past the end of a ${lengthFt} foot log`);
  }
  return smallEndIn + taperPerFoot * distanceFt;
}

/**
 * The small end diameter of every segment of a log scaled in segments, small
 * end first. Segment rules scale each piece as if it were its own short log,
 * which is why a long stick scales differently from two short ones.
 */
export function segmentDiameters(smallEndIn, taperPerFoot, lengthFt, segmentFt) {
  requirePositive('lengthFt', lengthFt);
  requirePositive('segmentFt', segmentFt);
  const count = Math.max(1, Math.ceil(lengthFt / segmentFt - 1e-9));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const at = i * segmentFt;
    const remaining = Math.min(segmentFt, lengthFt - at);
    out.push({
      index: i,
      startFt: at,
      lengthFt: round3(remaining),
      smallEndIn: round3(diameterAt(smallEndIn, taperPerFoot, at, { lengthFt })),
    });
  }
  return out;
}

/**
 * Where along a stem the diameter drops to a given top, measured from the
 * small end. Returns null when the taper never reaches it. Used by the bucker
 * to find the last point worth cutting.
 */
export function distanceToDiameter(smallEndIn, taperPerFoot, targetIn) {
  requirePositive('smallEndIn', smallEndIn);
  requirePositive('targetIn', targetIn);
  requireFinite('taperPerFoot', taperPerFoot);
  if (targetIn < smallEndIn) return 0;
  if (taperPerFoot <= 0) return null;
  return (targetIn - smallEndIn) / taperPerFoot;
}

/**
 * Butt swell. The last couple of feet of a butt log flare, and scaling that
 * flare as if it were sound taper overstates the log badly. This trims a large
 * end measurement back to what the taper above the swell would predict.
 */
export function trimButtSwell(smallEndIn, largeEndIn, lengthFt, options = {}) {
  const { swellFt = 2, taperPerFoot = TYPICAL_TAPER.butt } = options;
  requirePositive('lengthFt', lengthFt);
  if (lengthFt <= swellFt) return largeEndIn;
  const predicted = smallEndIn + taperPerFoot * lengthFt;
  return Math.min(largeEndIn, predicted);
}
