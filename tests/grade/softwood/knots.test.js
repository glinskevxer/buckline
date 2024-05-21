import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import {
  KNOT_ZONES,
  STRUCTURAL_GRADES,
  allowedKnotIn,
  knotLimits,
  knotZone,
  readClusters,
  readKnot,
} from '../../../src/grade/softwood/knots.js';

describe('knotZone', () => {
  it('reads a knot touching the near edge as an edge knot', () => {
    expect(knotZone({ fromEdgeIn: 0, sizeIn: 1 }, 3.5)).toBe('edge');
  });

  it('reads a knot touching the far edge as an edge knot', () => {
    expect(knotZone({ fromEdgeIn: 2.5, sizeIn: 1 }, 3.5)).toBe('edge');
  });

  it('reads a knot clear of both edges on the centerline', () => {
    expect(knotZone({ fromEdgeIn: 1, sizeIn: 1 }, 3.5)).toBe('centerline');
  });

  it('reads a narrow face knot in its own zone', () => {
    expect(knotZone({ face: 'narrow', fromEdgeIn: 1, sizeIn: 0.5 }, 3.5)).toBe('narrow face');
  });

  it('uses only the three zones', () => {
    for (const knot of [
      { fromEdgeIn: 0, sizeIn: 1 },
      { fromEdgeIn: 1, sizeIn: 1 },
      { face: 'narrow', sizeIn: 1 },
    ]) {
      expect(KNOT_ZONES).toContain(knotZone(knot, 5.5));
    }
  });
});

describe('allowedKnotIn', () => {
  it('allows more in the middle than at the edge', () => {
    for (const grade of STRUCTURAL_GRADES) {
      expect(allowedKnotIn(grade, 'centerline', 3.5)).toBeGreaterThan(
        allowedKnotIn(grade, 'edge', 3.5)
      );
    }
  });

  it('allows more as the grade drops', () => {
    const edges = STRUCTURAL_GRADES.map((grade) => allowedKnotIn(grade, 'edge', 3.5));
    for (let i = 1; i < edges.length; i += 1) {
      expect(edges[i]).toBeGreaterThan(edges[i - 1]);
    }
  });

  it('allows a bigger knot on a wider piece even at a tighter fraction', () => {
    expect(allowedKnotIn('SS', 'edge', 9.25)).toBeGreaterThan(allowedKnotIn('SS', 'edge', 3.5));
  });

  it('uses a tighter fraction on the wider piece', () => {
    const narrow = allowedKnotIn('SS', 'edge', 3.5) / 3.5;
    const wide = allowedKnotIn('SS', 'edge', 9.25) / 9.25;
    expect(wide).toBeLessThan(narrow);
  });

  it('refuses a grade or a zone nobody defined', () => {
    expect(() => allowedKnotIn('No4', 'edge', 3.5)).toThrow(GradeError);
    expect(() => allowedKnotIn('SS', 'corner', 3.5)).toThrow(GradeError);
  });

  it('names each grade in its own spec', () => {
    for (const grade of STRUCTURAL_GRADES) {
      expect(knotLimits(grade).grade).toBe(grade);
    }
  });
});

describe('readKnot', () => {
  it('passes a small centre knot at select structural', () => {
    const result = readKnot({ fromEdgeIn: 1, sizeIn: 1 }, 'SS', 3.5);
    expect(result.zone).toBe('centerline');
    expect(result.passes).toBe(true);
  });

  it('fails the same knot pushed to the edge', () => {
    const result = readKnot({ fromEdgeIn: 0, sizeIn: 1 }, 'SS', 3.5);
    expect(result.zone).toBe('edge');
    expect(result.passes).toBe(false);
    expect(result.overBy).toBeGreaterThan(0);
  });

  it('passes that edge knot once the grade drops', () => {
    expect(readKnot({ fromEdgeIn: 0, sizeIn: 1 }, 'No1', 3.5).passes).toBe(true);
  });

  it('lets a bigger centre knot through than an edge knot at the same grade', () => {
    expect(readKnot({ fromEdgeIn: 1, sizeIn: 1.15 }, 'SS', 3.5).passes).toBe(true);
    expect(readKnot({ fromEdgeIn: 0, sizeIn: 1.15 }, 'SS', 3.5).passes).toBe(false);
  });

  it('treats a missing size as no knot at all', () => {
    expect(readKnot({ fromEdgeIn: 1 }, 'SS', 3.5).passes).toBe(true);
  });
});

describe('readClusters', () => {
  const near = [
    { fromEdgeIn: 1, sizeIn: 0.6, atFt: 3 },
    { fromEdgeIn: 1, sizeIn: 0.6, atFt: 3.3 },
  ];

  it('ignores knots that are far apart', () => {
    const far = [
      { fromEdgeIn: 1, sizeIn: 0.6, atFt: 3 },
      { fromEdgeIn: 1, sizeIn: 0.6, atFt: 6 },
    ];
    expect(readClusters(far, 'SS', 3.5)).toEqual([]);
  });

  it('groups knots within six inches of each other', () => {
    const clusters = readClusters(near, 'SS', 3.5);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
    expect(clusters[0].totalIn).toBe(1.2);
  });

  it('allows a cluster more than a single knot but not twice as much', () => {
    const cluster = readClusters(near, 'SS', 3.5)[0];
    const single = allowedKnotIn('SS', 'centerline', 3.5);
    expect(cluster.allowedIn).toBeGreaterThan(single);
    expect(cluster.allowedIn).toBeLessThan(single * 2);
  });

  it('reads a cluster with one edge knot in it as an edge cluster', () => {
    const mixed = [
      { fromEdgeIn: 1, sizeIn: 0.5, atFt: 3 },
      { fromEdgeIn: 0, sizeIn: 0.5, atFt: 3.2 },
    ];
    expect(readClusters(mixed, 'SS', 3.5)[0].zone).toBe('edge');
  });

  it('fails a cluster that passes knot by knot', () => {
    const big = [
      { fromEdgeIn: 1, sizeIn: 1.1, atFt: 3 },
      { fromEdgeIn: 1, sizeIn: 1.1, atFt: 3.2 },
    ];
    expect(readKnot(big[0], 'SS', 3.5).passes).toBe(true);
    expect(readClusters(big, 'SS', 3.5)[0].passes).toBe(false);
  });

  it('can be told a different window', () => {
    const spread = [
      { fromEdgeIn: 1, sizeIn: 0.6, atFt: 3 },
      { fromEdgeIn: 1, sizeIn: 0.6, atFt: 3.9 },
    ];
    expect(readClusters(spread, 'SS', 3.5)).toEqual([]);
    expect(readClusters(spread, 'SS', 3.5, { windowIn: 12 })).toHaveLength(1);
  });

  it('does not care what order the knots arrive in', () => {
    const reversed = [...near].reverse();
    expect(readClusters(reversed, 'SS', 3.5)).toEqual(readClusters(near, 'SS', 3.5));
  });
});
