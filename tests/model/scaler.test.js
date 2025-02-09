import { describe, expect, it } from 'vitest';
import {
  CERTIFICATE_STATES,
  ScalerError,
  admissible,
  daysToExpiry,
  describeScaler,
  makeScaler,
  passRate,
  renewalsDue,
  reviewChecks,
} from '../../src/model/scaler.js';

const spec = {
  id: 'SC-1',
  name: 'D. Rakes',
  endorsements: ['doyle', 'international'],
  certifiedFrom: '2024-01-01',
  certifiedTo: '2025-06-30',
};

const scaler = makeScaler(spec);

describe('makeScaler', () => {
  it('sorts the endorsements', () => {
    expect(makeScaler({ ...spec, endorsements: ['scribner', 'doyle'] }).endorsements).toEqual([
      'doyle',
      'scribner',
    ]);
  });

  it('refuses a scaler with no identity', () => {
    expect(() => makeScaler({ ...spec, id: '' })).toThrow(ScalerError);
    expect(() => makeScaler({ ...spec, name: '' })).toThrow(ScalerError);
  });

  it('refuses a scaler endorsed on nothing', () => {
    expect(() => makeScaler({ ...spec, endorsements: [] })).toThrow(ScalerError);
  });

  it('refuses an endorsement on a rule nobody scales under', () => {
    expect(() => makeScaler({ ...spec, endorsements: ['cubic'] })).toThrow(ScalerError);
  });

  it('refuses a certificate with no dates or backwards dates', () => {
    expect(() => makeScaler({ ...spec, certifiedTo: undefined })).toThrow(ScalerError);
    expect(() => makeScaler({ ...spec, certifiedTo: '2023-01-01' })).toThrow(ScalerError);
  });

  it('refuses a suspension with no reason', () => {
    expect(() => makeScaler({ ...spec, state: 'suspended' })).toThrow(ScalerError);
  });

  it('refuses a state nobody defined', () => {
    expect(() => makeScaler({ ...spec, state: 'on holiday' })).toThrow(ScalerError);
    expect(CERTIFICATE_STATES).toEqual(['current', 'suspended', 'withdrawn']);
  });
});

describe('admissible', () => {
  it('admits a certified scaler on an endorsed rule', () => {
    expect(admissible(scaler, 'doyle', '2024-06-01').admissible).toBe(true);
  });

  it('refuses a rule the scaler is not endorsed on', () => {
    const result = admissible(scaler, 'scribner', '2024-06-01');
    expect(result.admissible).toBe(false);
    expect(result.reasons.join(' ')).toContain('not on scribner');
  });

  it('refuses a lapsed certificate', () => {
    expect(admissible(scaler, 'doyle', '2025-12-01').reasons.join(' ')).toContain('lapsed');
  });

  it('refuses a date before the certificate started', () => {
    expect(admissible(scaler, 'doyle', '2023-06-01').reasons.join(' ')).toContain('not certified');
  });

  it('refuses a suspended scaler and says why', () => {
    const suspended = makeScaler({
      ...spec,
      state: 'suspended',
      suspendedReason: 'two failed check scales',
    });
    expect(admissible(suspended, 'doyle', '2024-06-01').reasons.join(' ')).toContain(
      'two failed check scales'
    );
  });

  it('refuses a withdrawn certificate', () => {
    const gone = makeScaler({ ...spec, state: 'withdrawn' });
    expect(admissible(gone, 'doyle', '2024-06-01').admissible).toBe(false);
  });

  it('gives every reason rather than the first', () => {
    const gone = makeScaler({ ...spec, state: 'withdrawn' });
    expect(admissible(gone, 'scribner', '2026-01-01').reasons.length).toBeGreaterThan(2);
  });
});

describe('daysToExpiry and renewalsDue', () => {
  it('counts the days left', () => {
    expect(daysToExpiry(scaler, '2025-06-01')).toBe(29);
  });

  it('counts negative once it has lapsed', () => {
    expect(daysToExpiry(scaler, '2025-08-01')).toBeLessThan(0);
  });

  it('returns nothing for an unreadable date', () => {
    expect(daysToExpiry(scaler, 'soon')).toBeNull();
  });

  it('lists whoever needs renewing, soonest first', () => {
    const other = makeScaler({
      ...spec,
      id: 'SC-2',
      name: 'C. Beazley',
      certifiedTo: '2025-05-01',
    });
    const rows = renewalsDue([scaler, other], '2025-04-15', { withinDays: 90 });
    expect(rows.map((row) => row.id)).toEqual(['SC-2', 'SC-1']);
  });

  it('leaves out anybody with plenty of time', () => {
    expect(renewalsDue([scaler], '2024-06-01')).toEqual([]);
  });

  it('marks the ones that have already lapsed', () => {
    expect(renewalsDue([scaler], '2025-08-01')[0].lapsed).toBe(true);
  });
});

describe('reviewChecks', () => {
  const pass = { verdict: 'pass', differenceShare: 0.01 };
  const fail = { verdict: 'fail', differenceShare: 0.04 };

  it('leaves a scaler alone after a clean run', () => {
    const result = reviewChecks(scaler, [pass, pass, pass]);
    expect(result.changed).toBe(false);
    expect(result.scaler.state).toBe('current');
  });

  it('leaves a scaler alone after one failed check', () => {
    expect(reviewChecks(scaler, [pass, fail]).changed).toBe(false);
  });

  it('suspends a scaler after two', () => {
    const result = reviewChecks(scaler, [fail, pass, fail]);
    expect(result.changed).toBe(true);
    expect(result.scaler.state).toBe('suspended');
    expect(result.scaler.suspendedReason).toContain('2 failed');
  });

  it('suspends a scaler on one badly wrong check', () => {
    const result = reviewChecks(scaler, [{ verdict: 'review', differenceShare: -0.2 }]);
    expect(result.changed).toBe(true);
    expect(result.reasons.join(' ')).toContain('out by');
  });

  it('never edits the scaler it was given', () => {
    reviewChecks(scaler, [fail, fail]);
    expect(scaler.state).toBe('current');
  });

  it('takes a stricter policy', () => {
    expect(reviewChecks(scaler, [fail], { failsAllowed: 0 }).changed).toBe(true);
  });
});

describe('describeScaler and passRate', () => {
  it('writes a board line', () => {
    const line = describeScaler(scaler, '2025-06-01');
    expect(line).toContain('D. Rakes');
    expect(line).toContain('doyle/international');
    expect(line).toContain('29 days left');
  });

  it('says lapsed rather than a negative number', () => {
    expect(describeScaler(scaler, '2025-08-01')).toContain('lapsed');
  });

  it('works out a pass rate', () => {
    expect(passRate([{ verdict: 'pass' }, { verdict: 'fail' }])).toBe(0.5);
  });

  it('reports nothing when there are no checks', () => {
    expect(passRate([])).toBeNull();
  });
});
