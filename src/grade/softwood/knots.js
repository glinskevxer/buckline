/**
 * Knots in structural softwood.
 *
 * A structural grade does not care what a knot looks like. It cares how much
 * of the cross section the knot removes and where it removes it from, because
 * a piece in bending fails at the edge of the wide face and a knot there costs
 * far more strength than the same knot in the middle.
 *
 * So the limit is a fraction of the width, and which fraction applies depends
 * on three things at once: the grade, the width of the piece, and where across
 * the face the knot sits. A knot that touches the edge is read as an edge knot
 * however far it reaches in, which is why a big centre knot can pass where a
 * smaller one touching the edge does not.
 */

import { GradeError } from '../../errors.js';
import { round3 } from '../../num.js';

/** The zones a knot can sit in, and which limit each one is read against. */
export const KNOT_ZONES = ['edge', 'centerline', 'narrow face'];

/**
 * Limits as a fraction of the nominal width of the piece. Wide pieces get a
 * slightly tighter fraction than narrow ones at the same grade, because the
 * absolute size of the knot matters as well as the proportion.
 */
const LIMITS = {
  SS: {
    grade: 'SS',
    label: 'select structural',
    edge: (widthIn) => (widthIn <= 4 ? 0.25 : 0.22),
    centerline: (widthIn) => (widthIn <= 4 ? 0.33 : 0.3),
    'narrow face': () => 0.25,
    clusterFactor: 1.5,
  },
  No1: {
    grade: 'No1',
    label: 'number one structural',
    edge: (widthIn) => (widthIn <= 4 ? 0.33 : 0.3),
    centerline: (widthIn) => (widthIn <= 4 ? 0.44 : 0.4),
    'narrow face': () => 0.33,
    clusterFactor: 1.5,
  },
  No2: {
    grade: 'No2',
    label: 'number two structural',
    edge: (widthIn) => (widthIn <= 4 ? 0.44 : 0.4),
    centerline: (widthIn) => (widthIn <= 4 ? 0.56 : 0.5),
    'narrow face': () => 0.44,
    clusterFactor: 1.75,
  },
  No3: {
    grade: 'No3',
    label: 'number three structural',
    edge: () => 0.6,
    centerline: () => 0.7,
    'narrow face': () => 0.6,
    clusterFactor: 2,
  },
};

/** The grades in strength order, best first. */
export const STRUCTURAL_GRADES = ['SS', 'No1', 'No2', 'No3'];

export function knotLimits(grade) {
  const spec = LIMITS[grade];
  if (!spec) {
    throw new GradeError(`no structural grade called ${grade}`, { path: 'grade' });
  }
  return spec;
}

/**
 * Which zone a knot is read in. A knot touching either edge of the wide face
 * is an edge knot no matter how far in it reaches. Everything else on the wide
 * face is read on the centerline.
 */
export function knotZone(knot, widthIn) {
  if (knot.face === 'narrow') return 'narrow face';
  const from = knot.fromEdgeIn ?? 0;
  const to = from + (knot.sizeIn ?? 0);
  if (from <= 1e-9 || to >= widthIn - 1e-9) return 'edge';
  return 'centerline';
}

/** The largest knot of that zone the grade allows on that width, in inches. */
export function allowedKnotIn(grade, zone, widthIn) {
  const spec = knotLimits(grade);
  const fraction = spec[zone];
  if (!fraction) {
    throw new GradeError(`no knot limit for zone ${zone}`, { path: 'zone' });
  }
  return round3(fraction(widthIn) * widthIn);
}

/** Reads one knot against one grade. */
export function readKnot(knot, grade, widthIn) {
  const zone = knotZone(knot, widthIn);
  const allowed = allowedKnotIn(grade, zone, widthIn);
  const size = knot.sizeIn ?? 0;
  return {
    zone,
    sizeIn: size,
    allowedIn: allowed,
    passes: size <= allowed + 1e-9,
    overBy: size > allowed ? round3(size - allowed) : 0,
  };
}

/**
 * Knots close together act as one. Any knots whose centres fall within six
 * inches of each other are summed and read against the limit multiplied by the
 * grade's cluster factor.
 */
export function readClusters(knots, grade, widthIn, options = {}) {
  const { windowIn = 6 } = options;
  const spec = knotLimits(grade);
  const sorted = [...knots].sort((a, b) => (a.atFt ?? 0) - (b.atFt ?? 0));
  const clusters = [];

  for (const knot of sorted) {
    const at = (knot.atFt ?? 0) * 12;
    const last = clusters.at(-1);
    if (last && at - last.lastAtIn <= windowIn + 1e-9) {
      last.knots.push(knot);
      last.lastAtIn = at;
    } else {
      clusters.push({ knots: [knot], lastAtIn: at });
    }
  }

  return clusters
    .filter((cluster) => cluster.knots.length > 1)
    .map((cluster) => {
      const zone = cluster.knots.some((knot) => knotZone(knot, widthIn) === 'edge')
        ? 'edge'
        : knotZone(cluster.knots[0], widthIn);
      const total = round3(cluster.knots.reduce((sum, knot) => sum + (knot.sizeIn ?? 0), 0));
      const allowed = round3(allowedKnotIn(grade, zone, widthIn) * spec.clusterFactor);
      return {
        zone,
        count: cluster.knots.length,
        totalIn: total,
        allowedIn: allowed,
        passes: total <= allowed + 1e-9,
      };
    });
}
