import { describe, expect, it } from 'vitest';
import { TallyError } from '../../src/tally/unit.js';
import { againstTarget, byGrade, byThickness, recovery } from '../../src/tally/summary.js';

const tally = [
  { grade: 'FAS', quarters: 4, boardFeet: 100 },
  { grade: 'FAS', quarters: 4, boardFeet: 100 },
  { grade: '1C', quarters: 4, boardFeet: 50 },
  { grade: '1C', quarters: 8, boardFeet: 50 },
  { grade: '1C', quarters: 4, boardFeet: 50 },
  { grade: '2AC', quarters: 4, boardFeet: 50 },
  { grade: null, quarters: 4, boardFeet: 100 },
];

describe('byGrade', () => {
  it('totals footage and pieces per grade', () => {
    const rows = byGrade(tally);
    const fas = rows.find((row) => row.grade === 'FAS');
    expect(fas).toMatchObject({ pieces: 2, boardFeet: 200 });
  });

  it('puts an ungraded board in its own bucket', () => {
    expect(byGrade(tally).find((row) => row.grade === 'ungraded').boardFeet).toBe(100);
  });

  it('reports the footage share and the piece share separately', () => {
    const fas = byGrade(tally).find((row) => row.grade === 'FAS');
    expect(fas.footageShare).toBeCloseTo(200 / 500, 4);
    expect(fas.pieceShare).toBeCloseTo(2 / 7, 4);
  });

  it('sorts by footage when no grade order is given', () => {
    const rows = byGrade(tally);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].boardFeet).toBeLessThanOrEqual(rows[i - 1].boardFeet);
    }
  });

  it('sorts by the grade order when one is given', () => {
    const rows = byGrade(tally, { order: ['FAS', '1C', '2AC'] });
    expect(rows.map((row) => row.grade)).toEqual(['FAS', '1C', '2AC', 'ungraded']);
  });

  it('handles an empty tally', () => {
    expect(byGrade([])).toEqual([]);
  });
});

describe('recovery', () => {
  it('reports footage and piece recovery, which disagree', () => {
    const result = recovery(tally, ['FAS']);
    expect(result.footageRecovery).toBeCloseTo(0.4, 4);
    expect(result.pieceRecovery).toBeCloseTo(2 / 7, 4);
    expect(result.footageRecovery).not.toBeCloseTo(result.pieceRecovery, 3);
  });

  it('counts several grades as on grade', () => {
    const result = recovery(tally, ['FAS', '1C']);
    expect(result.boardFeet).toBe(350);
    expect(result.pieces).toBe(5);
  });

  it('carries the totals so the share can be checked', () => {
    const result = recovery(tally, ['FAS']);
    expect(result.totalBoardFeet).toBe(500);
    expect(result.totalPieces).toBe(7);
  });

  it('reports zero on an empty tally rather than dividing by nothing', () => {
    const result = recovery([], ['FAS']);
    expect(result.footageRecovery).toBe(0);
    expect(result.pieceRecovery).toBe(0);
  });

  it('refuses to guess which grades count', () => {
    expect(() => recovery(tally, [])).toThrow(TallyError);
    expect(() => recovery(tally, 'FAS')).toThrow(TallyError);
  });
});

describe('byThickness', () => {
  it('splits by quarters, thinnest first', () => {
    const rows = byThickness(tally);
    expect(rows.map((row) => row.quarters)).toEqual([4, 8]);
    expect(rows[1].boardFeet).toBe(50);
  });

  it('totals to the whole tally', () => {
    const total = byThickness(tally).reduce((sum, row) => sum + row.boardFeet, 0);
    expect(total).toBe(500);
  });
});

describe('againstTarget', () => {
  const target = { FAS: 0.3, '1C': 0.4, '2AC': 0.2 };

  it('reports the gap per grade', () => {
    const result = againstTarget(tally, target);
    const fas = result.rows.find((row) => row.grade === 'FAS');
    expect(fas.actualShare).toBeCloseTo(0.4, 4);
    expect(fas.gap).toBeCloseTo(0.1, 4);
    expect(fas.short).toBe(false);
  });

  it('marks the grades that came in short', () => {
    const result = againstTarget(tally, target);
    expect(result.rows.find((row) => row.grade === '1C').short).toBe(true);
  });

  it('names the worst shortfall', () => {
    expect(againstTarget(tally, target).worstShort.grade).toBe('1C');
  });

  it('reports nothing short when everything beat the target', () => {
    const easy = { FAS: 0.1, '1C': 0.1 };
    expect(againstTarget(tally, easy).worstShort).toBeNull();
  });

  it('treats a grade that produced nothing as zero rather than missing', () => {
    const result = againstTarget(tally, { '3AC': 0.1 });
    expect(result.rows[0].actualShare).toBe(0);
    expect(result.rows[0].short).toBe(true);
  });

  it('totals the target so a mix that does not add up shows itself', () => {
    expect(againstTarget(tally, target).totalExpected).toBe(0.9);
  });
});
