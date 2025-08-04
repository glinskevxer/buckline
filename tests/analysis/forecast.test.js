import { describe, expect, it } from 'vitest';
import {
  ForecastError,
  cruiseError,
  loadsRemaining,
  progress,
  remaining,
  valueRemaining,
} from '../../src/analysis/forecast.js';

const loads = [
  { netMbf: 12.4, landownerNet: 3100 },
  { netMbf: 11.8, landownerNet: 2900 },
  { netMbf: 13.1, landownerNet: 3400 },
];

describe('progress', () => {
  it('reports the share cut and what is left', () => {
    const result = progress(100, 37.3);
    expect(result.share).toBeCloseTo(0.373, 4);
    expect(result.remainingMbf).toBe(62.7);
    expect(result.overcut).toBe(false);
  });

  it('marks a sale that has cut past its cruise', () => {
    const result = progress(30, 40);
    expect(result.overcut).toBe(true);
    expect(result.remainingMbf).toBe(0);
  });

  it('refuses a forecast with no cruise or a negative cut', () => {
    expect(() => progress(0, 10)).toThrow(ForecastError);
    expect(() => progress(100, -1)).toThrow(ForecastError);
  });
});

describe('cruiseError', () => {
  it('will not be read off a block that is still running', () => {
    const result = cruiseError(40, 46);
    expect(result.known).toBe(false);
    expect(result.reason).toContain('finished');
  });

  it('reads off a finished block', () => {
    const result = cruiseError(40, 46, { blockFinished: true });
    expect(result.known).toBe(true);
    expect(result.ratio).toBe(1.15);
    expect(result.direction).toBe('cruise was light');
  });

  it('reads a heavy cruise the other way', () => {
    expect(cruiseError(40, 34, { blockFinished: true }).direction).toBe('cruise was heavy');
  });

  it('calls a cruise inside two percent close', () => {
    expect(cruiseError(40, 40.4, { blockFinished: true }).direction).toBe('close');
  });

  it('refuses a cruise error with no cruise volume', () => {
    expect(() => cruiseError(0, 10, { blockFinished: true })).toThrow(ForecastError);
  });
});

describe('remaining', () => {
  it('takes the cruise as written when there is no error to read', () => {
    const result = remaining(100, loads);
    expect(result.adjustedRemainingMbf).toBe(result.remainingMbf);
    expect(result.basis).toContain('as written');
  });

  it('scales what is left by a known cruise error', () => {
    const error = cruiseError(40, 46, { blockFinished: true });
    const result = remaining(100, loads, { cruiseError: error });
    expect(result.adjustedRemainingMbf).toBeGreaterThan(result.remainingMbf);
    expect(result.adjustedBy).toBe(1.15);
    expect(result.basis).toContain('finished block');
  });

  it('scales it down for a heavy cruise', () => {
    const error = cruiseError(40, 34, { blockFinished: true });
    expect(remaining(100, loads, { cruiseError: error }).adjustedRemainingMbf).toBeLessThan(
      remaining(100, loads).remainingMbf
    );
  });

  it('counts the loads it read', () => {
    expect(remaining(100, loads).loads).toBe(3);
  });
});

describe('valueRemaining', () => {
  it('works out what the rest should pay at the rate so far', () => {
    const result = valueRemaining(100, loads);
    expect(result.paidSoFar).toBe(9400);
    expect(result.perMbf).toBeGreaterThan(200);
    expect(result.expected).toBeGreaterThan(0);
  });

  it('says the basis is a ratio and not a trend', () => {
    expect(valueRemaining(100, loads).basis).toContain('this sale has paid');
  });

  it('says so when nothing has been cut yet', () => {
    const result = valueRemaining(100, []);
    expect(result.expected).toBeNull();
    expect(result.basis).toBe('nothing cut yet');
  });
});

describe('loadsRemaining', () => {
  it('rounds a part load up, because it still needs a truck', () => {
    const result = loadsRemaining(100, loads);
    expect(Number.isInteger(result.loadsLeft)).toBe(true);
    expect(result.averageLoadMbf).toBeCloseTo(12.4, 1);
  });

  it('scales with the cruise error', () => {
    const error = cruiseError(40, 60, { blockFinished: true });
    expect(loadsRemaining(100, loads, { cruiseError: error }).loadsLeft).toBeGreaterThan(
      loadsRemaining(100, loads).loadsLeft
    );
  });

  it('averages the same load size whatever the cruise error says', () => {
    const error = cruiseError(40, 60, { blockFinished: true });
    expect(loadsRemaining(100, loads, { cruiseError: error }).averageLoadMbf).toBe(
      loadsRemaining(100, loads).averageLoadMbf
    );
  });

  it('says so when there are no loads to average', () => {
    expect(loadsRemaining(100, []).reason).toContain('no loads');
  });

  it('says so when the loads carried nothing', () => {
    expect(loadsRemaining(100, [{ netMbf: 0 }]).reason).toContain('carried nothing');
  });
});
