import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../src/errors.js';
import { checkScale, scalerDrift } from '../../src/scale/audit.js';

function ticket(lines) {
  return {
    ticketId: 'S-1',
    rule: 'doyle',
    logCount: lines.length,
    lines: lines.map(([logId, net]) => ({ logId, netBoardFeet: net, cull: false })),
  };
}

const original = ticket([
  ['L-1', 200],
  ['L-2', 180],
  ['L-3', 220],
  ['L-4', 160],
  ['L-5', 240],
  ['L-6', 200],
  ['L-7', 190],
  ['L-8', 210],
  ['L-9', 170],
  ['L-10', 230],
]);

function check(entries) {
  return entries.map(([logId, net]) => ({ logId, netBoardFeet: net }));
}

describe('checkScale', () => {
  it('passes a scale that matches within tolerance', () => {
    const result = checkScale(
      original,
      check([
        ['L-1', 202],
        ['L-2', 178],
        ['L-3', 222],
        ['L-4', 158],
        ['L-5', 240],
      ])
    );
    expect(result.verdict).toBe('pass');
    expect(result.loadWithinTolerance).toBe(true);
  });

  it('names the direction of the difference', () => {
    const result = checkScale(
      original,
      check([
        ['L-1', 190],
        ['L-2', 170],
        ['L-3', 210],
        ['L-4', 150],
        ['L-5', 230],
      ])
    );
    expect(result.direction).toBe('check found less');
    expect(result.differenceBoardFeet).toBeLessThan(0);
  });

  it('calls a level check level', () => {
    const result = checkScale(
      original,
      check([
        ['L-1', 200],
        ['L-2', 180],
        ['L-3', 220],
        ['L-4', 160],
        ['L-5', 240],
      ])
    );
    expect(result.direction).toBe('level');
    expect(result.differenceShare).toBe(0);
  });

  it('fails a load outside the load tolerance', () => {
    const result = checkScale(
      original,
      check([
        ['L-1', 170],
        ['L-2', 150],
        ['L-3', 190],
        ['L-4', 130],
        ['L-5', 210],
      ])
    );
    expect(result.verdict).toBe('fail');
  });

  it('asks for a review when the load nets out but individual logs do not', () => {
    const result = checkScale(
      original,
      check([
        ['L-1', 240],
        ['L-2', 140],
        ['L-3', 220],
        ['L-4', 160],
        ['L-5', 240],
      ])
    );
    expect(result.loadWithinTolerance).toBe(true);
    expect(result.logsOutsideTolerance).toEqual(['L-1', 'L-2']);
    expect(result.verdict).toBe('review');
  });

  it('will not fail a scaler off too small a sample', () => {
    const result = checkScale(original, check([['L-1', 100]]));
    expect(result.sampleAdequate).toBe(false);
    expect(result.verdict).toBe('inconclusive');
  });

  it('reports the sample share', () => {
    const result = checkScale(
      original,
      check([
        ['L-1', 200],
        ['L-2', 180],
        ['L-3', 220],
        ['L-4', 160],
        ['L-5', 240],
      ])
    );
    expect(result.sampleShare).toBe(0.5);
  });

  it('refuses a check naming a log that is not on the ticket', () => {
    let caught;
    try {
      checkScale(original, check([['L-99', 200]]));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ScaleError);
    expect(caught.details.missing).toEqual(['L-99']);
  });

  it('refuses an empty check', () => {
    expect(() => checkScale(original, [])).toThrow(ScaleError);
  });

  it('treats a log the original scaled at nothing as a full difference', () => {
    const zeroed = ticket([['L-1', 0]]);
    const result = checkScale(zeroed, check([['L-1', 50]]));
    expect(result.comparisons[0].differenceShare).toBe(1);
  });

  it('calls two zeros level rather than a full difference', () => {
    const zeroed = ticket([['L-1', 0]]);
    const result = checkScale(zeroed, check([['L-1', 0]]));
    expect(result.comparisons[0].differenceShare).toBe(0);
  });

  it('can be given a tighter tolerance', () => {
    const tight = checkScale(
      original,
      check([
        ['L-1', 202],
        ['L-2', 178],
        ['L-3', 222],
        ['L-4', 158],
        ['L-5', 240],
      ]),
      { tolerance: { perLogShare: 0.005 } }
    );
    expect(tight.verdict).toBe('review');
  });
});

describe('scalerDrift', () => {
  const pass = { verdict: 'pass', differenceShare: 0.01 };
  const low = { verdict: 'pass', differenceShare: -0.015 };

  it('averages the shares', () => {
    expect(scalerDrift([pass, pass, pass]).meanShare).toBeCloseTo(0.01, 4);
  });

  it('names a consistent bias', () => {
    const drift = scalerDrift([low, low, low]);
    expect(drift.bias).toBe('check found less');
    expect(drift.consistent).toBe(true);
  });

  it('calls a scaler inconsistent when the spread is wide', () => {
    const drift = scalerDrift([
      { verdict: 'pass', differenceShare: 0.05 },
      { verdict: 'pass', differenceShare: -0.05 },
    ]);
    expect(drift.consistent).toBe(false);
    expect(drift.bias).toBe('level');
  });

  it('ignores inconclusive checks', () => {
    const drift = scalerDrift([pass, { verdict: 'inconclusive', differenceShare: -0.9 }]);
    expect(drift.samples).toBe(1);
  });

  it('reports nothing usable when every check was inconclusive', () => {
    const drift = scalerDrift([{ verdict: 'inconclusive', differenceShare: -0.9 }]);
    expect(drift.bias).toBe('unknown');
    expect(drift.samples).toBe(0);
  });

  it('refuses an empty list', () => {
    expect(() => scalerDrift([])).toThrow(ScaleError);
  });
});
