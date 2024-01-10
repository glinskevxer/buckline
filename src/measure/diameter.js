/**
 * Scaling diameter.
 *
 * The number a scaler writes down is not the diameter of the log. It is the
 * diameter of the log after a measuring convention, a bark deduction and a
 * rounding rule have all been applied, and the three are chosen independently
 * of each other by whoever wrote the contract. A log that measures 15.6 inches
 * outside bark can be scaled at 15, 14 or 13 inches without anybody being
 * wrong.
 */

/**
 * How the two cross sectional measurements are combined. A log is never round,
 * so the choice is worth real money on a big stick.
 */
export const MEASUREMENT_CONVENTIONS = {
  /** One measurement, taken wherever the scaler is standing. */
  single: {
    id: 'single',
    label: 'single axis',
    combine: (axes) => axes[0],
    axesRequired: 1,
  },
  /** Two measurements at right angles, averaged. The usual rule. */
  average: {
    id: 'average',
    label: 'average of two axes',
    combine: (axes) => (axes[0] + axes[1]) / 2,
    axesRequired: 2,
  },
  /** Longest and shortest, averaged. Used where the log is badly out of round. */
  extremes: {
    id: 'extremes',
    label: 'average of longest and shortest',
    combine: (axes) => (Math.min(...axes) + Math.max(...axes)) / 2,
    axesRequired: 2,
  },
  /** The short axis alone. A buyer's convention, and it is legal in places. */
  shortest: {
    id: 'shortest',
    label: 'shortest axis',
    combine: (axes) => Math.min(...axes),
    axesRequired: 2,
  },
};

/**
 * How a fractional diameter becomes a whole scaling class.
 *
 * Rounding down is nearly universal in the eastern hardwood trade. Nearest
 * inch appears in some western softwood contracts and it moves the average
 * scale by roughly half an inch, which is a few percent of the volume.
 */
export const ROUNDING_RULES = {
  down: { id: 'down', label: 'drop the fraction', apply: (d) => Math.floor(d) },
  nearest: { id: 'nearest', label: 'nearest inch', apply: (d) => Math.round(d) },
  up: { id: 'up', label: 'raise to the next inch', apply: (d) => Math.ceil(d) },
  half: {
    id: 'half',
    label: 'nearest half inch',
    apply: (d) => Math.round(d * 2) / 2,
  },
};

/**
 * Bark thickness is a fraction of the outside bark diameter and it depends on
 * the species. These are working numbers for the eastern hardwoods, expressed
 * as the fraction of outside bark diameter that is bark on both sides
 * together.
 */
const BARK_FRACTION = {
  default: 0.06,
  'white oak': 0.09,
  'red oak': 0.08,
  hickory: 0.07,
  'hard maple': 0.05,
  'soft maple': 0.05,
  'yellow poplar': 0.05,
  ash: 0.06,
  'black cherry': 0.05,
  'black walnut': 0.07,
  basswood: 0.05,
  beech: 0.03,
  'shortleaf pine': 0.11,
  'loblolly pine': 0.11,
};

/** Fraction of outside bark diameter taken up by bark, both sides together. */
export function barkFraction(species) {
  if (species === undefined || species === null) return BARK_FRACTION.default;
  const key = String(species).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(BARK_FRACTION, key)
    ? BARK_FRACTION[key]
    : BARK_FRACTION.default;
}

/** Converts an outside bark measurement to inside bark for a species. */
export function insideBark(outsideBarkIn, species) {
  requirePositive('outsideBarkIn', outsideBarkIn);
  return outsideBarkIn * (1 - barkFraction(species));
}

/**
 * Runs the whole convention. `axes` is one or two outside bark measurements in
 * inches; the result is the whole scaling diameter that goes on the ticket,
 * along with the intermediate numbers so a scale can be audited later.
 */
export function scalingDiameter(axes, options = {}) {
  const {
    convention = 'average',
    rounding = 'down',
    species = undefined,
    alreadyInsideBark = false,
  } = options;

  const rule = MEASUREMENT_CONVENTIONS[convention];
  if (!rule) {
    throw new RangeError(`unknown measurement convention ${convention}`);
  }
  const round = ROUNDING_RULES[rounding];
  if (!round) {
    throw new RangeError(`unknown rounding rule ${rounding}`);
  }

  const list = Array.isArray(axes) ? axes : [axes];
  if (list.length < rule.axesRequired) {
    throw new RangeError(
      `convention ${convention} needs ${rule.axesRequired} measurements, got ${list.length}`
    );
  }
  list.forEach((value, index) => requirePositive(`axes[${index}]`, value));

  const combined = rule.combine(list);
  const inside = alreadyInsideBark ? combined : insideBark(combined, species);
  const scaling = round.apply(inside);

  if (scaling < 1) {
    throw new RangeError(`scaling diameter rounded to ${scaling}, which is not a log`);
  }

  return {
    axes: list.slice(),
    convention: rule.id,
    rounding: round.id,
    combinedOutsideBark: combined,
    insideBark: inside,
    scalingDiameter: scaling,
  };
}

function requirePositive(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero, got ${value}`);
  }
}
