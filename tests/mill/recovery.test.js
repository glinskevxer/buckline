import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { MillError } from '../../src/mill/pattern.js';
import { liveSaw } from '../../src/mill/pattern.js';
import {
  lumberRecoveryFactor,
  overrun,
  overrunByDiameter,
  overrunUnderEveryRule,
  volumeBalance,
} from '../../src/mill/recovery.js';

function log(id, axis, lengthFt = 12) {
  return makeLog({
    id,
    species: 'red oak',
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
  });
}

const small = log('L-1', 13.1);
const big = log('L-2', 26.1);

describe('lumberRecoveryFactor', () => {
  it('reports board feet per cubic foot', () => {
    const result = lumberRecoveryFactor([big], 300);
    expect(result.cubicFeet).toBeGreaterThan(0);
    expect(result.lrf).toBeCloseTo(300 / result.cubicFeet, 2);
  });

  it('rises when the same logs saw more', () => {
    expect(lumberRecoveryFactor([big], 400).lrf).toBeGreaterThan(
      lumberRecoveryFactor([big], 300).lrf
    );
  });

  it('refuses an empty log list', () => {
    expect(() => lumberRecoveryFactor([], 300)).toThrow(MillError);
  });
});

describe('overrun', () => {
  it('finds heavy overrun on a small log under doyle', () => {
    const result = overrun([small], 100, 'doyle');
    expect(result.direction).toBe('over');
    expect(result.overrunShare).toBeGreaterThan(0.3);
  });

  it('finds far less on the same log under international', () => {
    const doyle = overrun([small], 100, 'doyle').overrunShare;
    const international = overrun([small], 100, 'international').overrunShare;
    expect(international).toBeLessThan(doyle);
  });

  it('can go under as well as over', () => {
    const result = overrun([big], 100, 'international');
    expect(result.direction).toBe('under');
    expect(result.overrunBoardFeet).toBeLessThan(0);
  });

  it('refuses a rule the logs scale nothing under', () => {
    const tiny = log('L-9', 6.5);
    expect(() => overrun([tiny], 100, 'scribner')).toThrow(MillError);
  });
});

describe('overrunUnderEveryRule', () => {
  it('gives a different answer per rule for one run', () => {
    const result = overrunUnderEveryRule([small], 100);
    expect(result.rows).toHaveLength(3);
    expect(new Set(result.rows.map((row) => row.overrunShare)).size).toBe(3);
  });

  it('reports the spread, which is the point of the report', () => {
    expect(overrunUnderEveryRule([small], 100).spread).toBeGreaterThan(0.1);
  });

  it('puts the most flattering rule first', () => {
    const rows = overrunUnderEveryRule([small], 100).rows;
    expect(rows[0].overrunShare).toBeGreaterThanOrEqual(rows.at(-1).overrunShare);
  });

  it('drops a rule that cannot scale the logs at all', () => {
    const tiny = log('L-9', 6.5);
    const result = overrunUnderEveryRule([tiny], 50);
    expect(result.rows.map((row) => row.rule)).not.toContain('scribner');
  });
});

describe('overrunByDiameter', () => {
  const entries = [
    { log: small, boardFeetSawn: 100 },
    { log: big, boardFeetSawn: 500 },
    { log: log('L-3', 13.1), boardFeetSawn: 110 },
  ];

  it('groups by scaling diameter, smallest first', () => {
    const rows = overrunByDiameter(entries, 'doyle');
    expect(rows.map((row) => row.diameterIn)).toEqual([12, 24]);
    expect(rows[0].logCount).toBe(2);
  });

  it('shows doyle overrunning hard on the small logs and less on the big', () => {
    const rows = overrunByDiameter(entries, 'doyle');
    expect(rows[0].overrunShare).toBeGreaterThan(rows[1].overrunShare);
  });

  it('flattens out under international', () => {
    const doyle = overrunByDiameter(entries, 'doyle');
    const international = overrunByDiameter(entries, 'international');
    const doyleSpread = doyle[0].overrunShare - doyle[1].overrunShare;
    const intSpread = international[0].overrunShare - international[1].overrunShare;
    expect(intSpread).toBeLessThan(doyleSpread);
  });
});

describe('volumeBalance', () => {
  const sawResult = liveSaw(big);

  it('accounts for the whole log', () => {
    const balance = volumeBalance([big], sawResult);
    const parts =
      balance.lumberBoardFeet +
      balance.sawdustBoardFeet +
      balance.trimBoardFeet +
      balance.slabAndEdgingBoardFeet;
    expect(parts).toBeCloseTo(balance.logBoardFeetEquivalent, 1);
  });

  it('reports the lumber share', () => {
    const balance = volumeBalance([big], sawResult);
    expect(balance.lumberShare).toBeGreaterThan(0.3);
    expect(balance.lumberShare).toBeLessThan(1);
  });

  it('makes more sawdust on a wider kerf', () => {
    const wide = volumeBalance([big], liveSaw(big, { kerfIn: 0.25 }), { sawdustShare: 0.2 });
    const thin = volumeBalance([big], liveSaw(big), { sawdustShare: 0.1 });
    expect(wide.sawdustBoardFeet).toBeGreaterThan(thin.sawdustBoardFeet);
    expect(wide.lumberBoardFeet).toBeLessThan(thin.lumberBoardFeet);
  });

  it('never reports negative slab', () => {
    const balance = volumeBalance([big], { boardFeet: 100000 });
    expect(balance.slabAndEdgingBoardFeet).toBe(0);
  });
});
