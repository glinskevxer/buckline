/**
 * A small deterministic generator.
 *
 * These tests state properties rather than examples, so they need a lot of
 * inputs. A library would do it, and one more dependency to test a program
 * with one runtime dependency is a poor trade. What is needed here is a
 * repeatable stream of plausible logs, and thirty lines does that.
 *
 * Everything is seeded. A property that fails has to fail again on the next
 * run or it is worthless, and a random generator that is not seeded produces
 * exactly the bug report nobody can act on.
 */

/** A small deterministic pseudo random source. */
export function rng(seed = 1) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** An integer in a range, both ends included. */
export function intBetween(next, low, high) {
  return low + Math.floor(next() * (high - low + 1));
}

/** A number in a range, rounded to a number of places. */
export function numberBetween(next, low, high, places = 2) {
  const factor = 10 ** places;
  return Math.round((low + next() * (high - low)) * factor) / factor;
}

/** One of a list. */
export function oneOf(next, values) {
  return values[intBetween(next, 0, values.length - 1)];
}

export const SPECIES = [
  'red oak',
  'white oak',
  'hard maple',
  'soft maple',
  'yellow poplar',
  'black cherry',
  'ash',
  'hickory',
  'beech',
  'basswood',
];

export const DEFECTS = ['catface', 'hole', 'unsound knot', 'heart rot', 'seam', 'sap rot'];

/** A plausible raw log ready for makeLog. */
export function someLog(next, index) {
  const axis = numberBetween(next, 7, 34, 1);
  const defects = [];
  const count = intBetween(next, 0, 3);
  for (let i = 0; i < count; i += 1) {
    defects.push({
      type: oneOf(next, DEFECTS),
      faceIndex: intBetween(next, 0, 3),
      startFt: numberBetween(next, 0, 8, 1),
      lengthFt: numberBetween(next, 0.5, 4, 1),
      widthIn: numberBetween(next, 1, 8, 1),
      depthIn: numberBetween(next, 0.5, 5, 1),
    });
  }
  return {
    id: `P-${index}`,
    species: oneOf(next, SPECIES),
    position: oneOf(next, ['butt', 'second', 'upper']),
    axesIn: [axis, numberBetween(next, axis * 0.9, axis * 1.1, 1)],
    measuredLengthFt: numberBetween(next, 6, 17, 2),
    defects,
  };
}

/** A plausible raw board ready for makeBoard. */
export function someBoard(next, index) {
  const widthIn = intBetween(next, 3, 14);
  const lengthFt = intBetween(next, 4, 16);
  const defects = [];
  const count = intBetween(next, 0, 4);
  for (let i = 0; i < count; i += 1) {
    const startFt = numberBetween(next, 0, Math.max(0.5, lengthFt - 1), 1);
    defects.push({
      type: 'knot',
      face: intBetween(next, 0, 1),
      startFt,
      lengthFt: numberBetween(next, 0.2, 2, 1),
      fromEdgeIn: numberBetween(next, 0, Math.max(0.5, widthIn - 1), 1),
      widthIn: numberBetween(next, 0.5, 3, 1),
    });
  }
  return {
    id: `B-${index}`,
    species: oneOf(next, SPECIES),
    thicknessIn: oneOf(next, [1, 1.25, 1.5, 2]),
    widthIn,
    lengthFt,
    defects,
  };
}

/** Runs a check over a seeded stream and reports the first failure with its input. */
export function forEachSample(seed, count, make, check) {
  const next = rng(seed);
  for (let index = 0; index < count; index += 1) {
    const sample = make(next, index);
    try {
      check(sample, index);
    } catch (error) {
      error.message = `${error.message}\n  sample ${index}: ${JSON.stringify(sample)}`;
      throw error;
    }
  }
}
