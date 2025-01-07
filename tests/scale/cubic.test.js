import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../src/errors.js';
import { makeLog } from '../../src/model/log.js';
import {
  BOARD_FEET_PER_CUBIC_FOOT,
  areaSqFt,
  cubicScale,
  cubicToBoardFeet,
  huber,
  measuredRecovery,
  smalian,
  smalianBias,
} from '../../src/scale/cubic.js';

describe('areaSqFt', () => {
  it('measures a twelve inch circle at about three quarters of a square foot', () => {
    expect(areaSqFt(12)).toBeCloseTo(0.7854, 4);
  });

  it('quadruples when the diameter doubles', () => {
    expect(areaSqFt(24)).toBeCloseTo(areaSqFt(12) * 4, 6);
  });

  it('refuses a diameter of nothing', () => {
    expect(() => areaSqFt(0)).toThrow(ScaleError);
  });
});

describe('smalian', () => {
  it('measures a cylinder as its area times its length', () => {
    expect(smalian(16, 16, 12)).toBeCloseTo(areaSqFt(16) * 12, 3);
  });

  it('grows with taper', () => {
    expect(smalian(16, 20, 12)).toBeGreaterThan(smalian(16, 16, 12));
  });

  it('refuses a log measured smaller at the butt', () => {
    expect(() => smalian(20, 16, 12)).toThrow(ScaleError);
  });

  it('refuses a log with no length', () => {
    expect(() => smalian(16, 20, 0)).toThrow(ScaleError);
  });
});

describe('huber', () => {
  it('measures the middle', () => {
    expect(huber(18, 12)).toBeCloseTo(areaSqFt(18) * 12, 3);
  });
});

describe('smalianBias', () => {
  it('is nothing on a cylinder', () => {
    expect(smalianBias(16, 16, 12).overstatement).toBe(0);
  });

  it('overstates a tapered log', () => {
    expect(smalianBias(16, 24, 12).overstatement).toBeGreaterThan(0);
  });

  it('grows with the square of the taper', () => {
    const small = smalianBias(16, 18, 12).overstatement;
    const large = smalianBias(16, 20, 12).overstatement;
    expect(large / small).toBeGreaterThan(3);
  });

  it('does not depend on the length except in proportion', () => {
    expect(smalianBias(16, 24, 24).share).toBeCloseTo(smalianBias(16, 24, 12).share, 6);
  });
});

describe('cubicToBoardFeet', () => {
  it('converts at the recovery it is given', () => {
    expect(cubicToBoardFeet(100, 6.5)).toBe(650);
  });

  it('refuses to guess a recovery', () => {
    expect(() => cubicToBoardFeet(100, 0)).toThrow(ScaleError);
    expect(() => cubicToBoardFeet(100, undefined)).toThrow(ScaleError);
  });

  it('refuses a recovery no mill could reach', () => {
    expect(() => cubicToBoardFeet(100, 13)).toThrow(ScaleError);
  });

  it('allows the theoretical maximum exactly', () => {
    expect(cubicToBoardFeet(100, BOARD_FEET_PER_CUBIC_FOOT)).toBe(1200);
  });
});

describe('measuredRecovery', () => {
  it('divides the tally by the cubic scale', () => {
    const result = measuredRecovery(100, 620);
    expect(result.boardFeetPerCubicFoot).toBe(6.2);
    expect(result.shareOfTheoretical).toBeCloseTo(6.2 / 12, 4);
  });

  it('refuses a cubic scale of nothing', () => {
    expect(() => measuredRecovery(0, 620)).toThrow(ScaleError);
  });
});

describe('cubicScale', () => {
  const base = {
    id: 'L-1',
    species: 'red oak',
    axesIn: [17.4, 17.4],
    measuredLengthFt: 16.25,
  };

  it('uses the measured butt when there is one', () => {
    const log = makeLog({ ...base, largeEndIn: 20 });
    const result = cubicScale(log);
    expect(result.taperSource).toBe('measured');
    expect(result.largeEndIn).toBe(20);
  });

  it('assumes a taper when there is not', () => {
    const result = cubicScale(makeLog(base));
    expect(result.taperSource).toBe('assumed');
    expect(result.largeEndIn).toBeGreaterThan(result.smallEndIn);
  });

  it('finds more wood in a fast tapered log', () => {
    const fast = cubicScale(makeLog({ ...base, largeEndIn: 24 }));
    const slow = cubicScale(makeLog({ ...base, largeEndIn: 18 }));
    expect(fast.cubicFeet).toBeGreaterThan(slow.cubicFeet);
  });

  it('measures inside bark, not on the tape reading', () => {
    const result = cubicScale(makeLog(base));
    expect(result.smallEndIn).toBeLessThan(17.4);
  });

  it('finds nothing in a stick under the shortest class', () => {
    const short = makeLog({ ...base, measuredLengthFt: 5 });
    expect(cubicScale(short).cubicFeet).toBe(0);
  });

  it('leaves the board foot equivalent unfilled, because it needs a mill figure', () => {
    expect(cubicScale(makeLog(base)).boardFootEquivalent).toBeNull();
  });
});
