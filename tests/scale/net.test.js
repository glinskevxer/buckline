import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { netScale } from '../../src/scale/net.js';

const clean = makeLog({
  id: 'L-1',
  species: 'red oak',
  axesIn: [17.4, 17.4],
  measuredLengthFt: 16.25,
});

function withDefects(defects, extra = {}) {
  return makeLog({
    id: 'L-1',
    species: 'red oak',
    axesIn: [17.4, 17.4],
    measuredLengthFt: 16.25,
    defects,
    ...extra,
  });
}

describe('a clean log', () => {
  it('nets its gross', () => {
    const result = netScale(clean, 'doyle');
    expect(result.grossBoardFeet).toBe(144);
    expect(result.netBoardFeet).toBe(144);
    expect(result.deductions).toEqual([]);
    expect(result.cull).toBe(false);
  });
});

describe('sound knots', () => {
  it('cost nothing', () => {
    const log = withDefects([{ type: 'sound knot', widthIn: 3, depthIn: 3, lengthFt: 1 }]);
    expect(netScale(log, 'doyle').netBoardFeet).toBe(144);
  });
});

describe('sweep', () => {
  it('comes off as a share of gross', () => {
    const log = withDefects([{ type: 'sweep', depthIn: 6, lengthFt: 16 }]);
    const result = netScale(log, 'doyle');
    expect(result.deductions[0].method).toBe('percentage');
    expect(result.deductions[0].deductionBoardFeet).toBeCloseTo(18, 1);
  });

  it('costs nothing when it is inside the allowance', () => {
    const log = withDefects([{ type: 'sweep', depthIn: 3, lengthFt: 16 }]);
    expect(netScale(log, 'doyle').netBoardFeet).toBe(144);
  });

  it('costs more under a contract with no allowance', () => {
    const log = withDefects([{ type: 'sweep', depthIn: 6, lengthFt: 16 }]);
    const generous = netScale(log, 'doyle').netBoardFeet;
    const harsh = netScale(log, 'doyle', { sweepAllowance: 'none' }).netBoardFeet;
    expect(harsh).toBeLessThan(generous);
  });
});

describe('sweep and crook together', () => {
  it('charges the worse of the two rather than both', () => {
    const both = withDefects([
      { type: 'sweep', depthIn: 6, lengthFt: 16 },
      { type: 'crook', depthIn: 1 },
    ]);
    const sweepOnly = withDefects([{ type: 'sweep', depthIn: 6, lengthFt: 16 }]);
    const result = netScale(both, 'doyle');
    expect(result.deductions).toHaveLength(1);
    expect(result.netBoardFeet).toBe(netScale(sweepOnly, 'doyle').netBoardFeet);
  });

  it('takes the crook when the crook is worse', () => {
    const log = withDefects([
      { type: 'sweep', depthIn: 4.5, lengthFt: 16 },
      { type: 'crook', depthIn: 4 },
    ]);
    expect(netScale(log, 'doyle').deductions[0].taken).toBe('crook');
  });
});

describe('the rule changes the deduction', () => {
  const log = withDefects([{ type: 'heart rot', widthIn: 6, depthIn: 6, lengthFt: 8 }]);

  it('squares it out under doyle', () => {
    expect(netScale(log, 'doyle').deductions[0].method).toBe('squared');
  });

  it('takes it on the length under international', () => {
    expect(netScale(log, 'international').deductions[0].method).toBe('length');
  });

  it('takes it on the diameter under scribner', () => {
    expect(netScale(log, 'scribner').deductions[0].method).toBe('diameter');
  });

  it('gives three different net figures for the same stick', () => {
    const shares = ['doyle', 'international', 'scribner'].map((rule) => {
      const result = netScale(log, rule);
      return result.scaledNetBoardFeet / result.grossBoardFeet;
    });
    expect(new Set(shares.map((s) => Math.round(s * 100))).size).toBe(3);
  });
});

describe('a contract override moves the answer', () => {
  it('changes the method and the number', () => {
    const log = withDefects([{ type: 'heart rot', widthIn: 6, depthIn: 6, lengthFt: 8 }]);
    const plain = netScale(log, 'doyle');
    const pinned = netScale(log, 'doyle', { overrides: { 'heart rot': 'length' } });
    expect(pinned.deductions[0].method).toBe('length');
    expect(pinned.scaledNetBoardFeet).not.toBe(plain.scaledNetBoardFeet);
  });
});

describe('culling', () => {
  it('zeroes a log whose net falls under half its gross', () => {
    const log = withDefects([{ type: 'heart rot', widthIn: 12, depthIn: 12, lengthFt: 12 }]);
    const result = netScale(log, 'doyle');
    expect(result.cull).toBe(true);
    expect(result.netBoardFeet).toBe(0);
    expect(result.scaledNetBoardFeet).toBeGreaterThan(0);
    expect(result.cullReason).toContain('cull line');
  });

  it('keeps the scaled figure so the reason can be audited', () => {
    const log = withDefects([{ type: 'heart rot', widthIn: 12, depthIn: 12, lengthFt: 12 }]);
    expect(netScale(log, 'doyle').scaledNetBoardFeet).toBeLessThan(72);
  });

  it('can be told to accept a lower cull line', () => {
    const log = withDefects([{ type: 'heart rot', widthIn: 12, depthIn: 12, lengthFt: 12 }]);
    expect(netScale(log, 'doyle', { cullShare: 0.2 }).cull).toBe(false);
  });

  it('culls a stick that is too short to bother with', () => {
    const short = makeLog({
      id: 'L-9',
      species: 'red oak',
      axesIn: [17.4, 17.4],
      measuredLengthFt: 5,
    });
    const result = netScale(short, 'doyle');
    expect(result.cull).toBe(true);
    expect(result.grossBoardFeet).toBe(0);
  });

  it('culls on the board foot floor even when the share is fine', () => {
    const tiny = makeLog({
      id: 'L-8',
      species: 'red oak',
      axesIn: [7.4, 7.4],
      measuredLengthFt: 8.25,
    });
    const result = netScale(tiny, 'doyle');
    expect(result.grossBoardFeet).toBeLessThan(20);
    expect(result.cull).toBe(true);
    expect(result.cullReason).toContain('floor');
  });
});

describe('deduction never exceeds the log', () => {
  it('stops at zero however many faults are recorded', () => {
    const log = withDefects([
      { type: 'heart rot', widthIn: 14, depthIn: 14, lengthFt: 16 },
      { type: 'catface', widthIn: 10, depthIn: 8, lengthFt: 8 },
      { type: 'hole', widthIn: 6, depthIn: 6, lengthFt: 4 },
    ]);
    const result = netScale(log, 'doyle');
    expect(result.scaledNetBoardFeet).toBe(0);
    expect(result.deductions.every((d) => d.deductionBoardFeet >= 0)).toBe(true);
  });
});
