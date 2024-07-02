import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../src/errors.js';
import { makeLog } from '../../src/model/log.js';
import { grossScale, grossScaleAll } from '../../src/scale/gross.js';

const base = {
  id: 'L-1',
  species: 'red oak',
  axesIn: [17.4, 17.4],
  measuredLengthFt: 16.25,
};

const log = makeLog(base);

describe('whole log rules', () => {
  it('scales doyle straight off the diameter and length', () => {
    const result = grossScale(log, 'doyle');
    expect(log.scalingDiameterIn).toBe(16);
    expect(result.boardFeet).toBe(144);
    expect(result.segments).toBeNull();
  });

  it('scales scribner off the table', () => {
    expect(grossScale(log, 'scribner').boardFeet).toBe(160);
  });

  it('says the taper was not used', () => {
    expect(grossScale(log, 'doyle').taperSource).toBe('not used');
  });

  it('keeps the unrounded figure alongside the ticket figure', () => {
    const result = grossScale(log, 'doyle');
    expect(result.unrounded).toBeCloseTo(144, 3);
  });
});

describe('segment rules', () => {
  it('breaks a sixteen footer into four segments', () => {
    const result = grossScale(log, 'international');
    expect(result.segments).toHaveLength(4);
  });

  it('falls back to the assumed taper when the butt was not measured', () => {
    const result = grossScale(log, 'international');
    expect(result.taperSource).toBe('assumed');
    expect(result.taperUsed).toBeCloseTo(0.125, 4);
  });

  it('uses the log taper when the scaler measured the butt', () => {
    const measured = makeLog({ ...base, largeEndIn: 19 });
    const result = grossScale(measured, 'international');
    expect(result.taperSource).toBe('measured');
    expect(result.taperUsed).toBeGreaterThan(0.125);
  });

  it('finds more wood in a fast tapered log than the assumption allows', () => {
    const measured = makeLog({ ...base, largeEndIn: 22 });
    expect(grossScale(measured, 'international').boardFeet).toBeGreaterThan(
      grossScale(log, 'international').boardFeet
    );
  });

  it('can be told to ignore the measured taper', () => {
    const measured = makeLog({ ...base, largeEndIn: 22 });
    const ignored = grossScale(measured, 'international', { useMeasuredTaper: false });
    expect(ignored.boardFeet).toBe(grossScale(log, 'international').boardFeet);
  });

  it('leaves the tape on the butt making no difference under doyle', () => {
    const measured = makeLog({ ...base, largeEndIn: 22 });
    expect(grossScale(measured, 'doyle').boardFeet).toBe(grossScale(log, 'doyle').boardFeet);
  });

  it('rounds the segment total the way the rule rounds', () => {
    expect(grossScale(log, 'international').boardFeet % 5).toBe(0);
  });
});

describe('logs the rule will not take', () => {
  it('returns zero and a reason for a stick that is too short', () => {
    const short = makeLog({ ...base, measuredLengthFt: 6 });
    const result = grossScale(short, 'doyle');
    expect(result.boardFeet).toBe(0);
    expect(result.reason).toContain('length class');
  });

  it('returns zero and a reason for a stick under the rule floor', () => {
    const small = makeLog({ ...base, axesIn: [5.5, 5.5] });
    const result = grossScale(small, 'scribner');
    expect(result.boardFeet).toBe(0);
    expect(result.reason).toContain('inch floor');
  });

  it('lets international take a log scribner will not', () => {
    const small = makeLog({ ...base, axesIn: [5.5, 5.5] });
    expect(grossScale(small, 'international').boardFeet).toBeGreaterThan(0);
    expect(grossScale(small, 'scribner').boardFeet).toBe(0);
  });
});

describe('grossScaleAll', () => {
  const logs = [
    log,
    makeLog({ ...base, id: 'L-2', axesIn: [21.8, 21.8] }),
    makeLog({ ...base, id: 'L-3', measuredLengthFt: 6 }),
  ];

  it('totals the load', () => {
    const result = grossScaleAll(logs, 'doyle');
    expect(result.totalBoardFeet).toBe(144 + 256);
  });

  it('counts what scaled and what did not', () => {
    const result = grossScaleAll(logs, 'doyle');
    expect(result.scaledCount).toBe(2);
    expect(result.rejectedCount).toBe(1);
  });

  it('keeps the log id on every entry', () => {
    expect(grossScaleAll(logs, 'doyle').entries.map((e) => e.logId)).toEqual(['L-1', 'L-2', 'L-3']);
  });

  it('refuses anything that is not a list', () => {
    expect(() => grossScaleAll(log, 'doyle')).toThrow(ScaleError);
  });
});
