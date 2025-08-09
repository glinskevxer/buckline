import { describe, expect, it } from 'vitest';
import {
  checkDefects,
  checkGrades,
  checkRules,
  checkScheduleCoverage,
  checkSchedules,
  checkSpecies,
  checkStructural,
  checkYardTables,
  selfCheck,
} from '../src/selfcheck.js';

describe('every table checks out', () => {
  it('the log rules', () => {
    const result = checkRules();
    expect(result.problems).toEqual([]);
    expect(result.looked).toBe(3);
  });

  it('the species register', () => {
    const result = checkSpecies();
    expect(result.problems).toEqual([]);
    expect(result.looked).toBeGreaterThan(10);
  });

  it('the defect catalogue', () => {
    expect(checkDefects().problems).toEqual([]);
  });

  it('the grade prices', () => {
    expect(checkGrades().problems).toEqual([]);
  });

  it('the kiln schedules', () => {
    expect(checkSchedules().problems).toEqual([]);
  });

  it('every species and thickness picks a schedule', () => {
    const result = checkScheduleCoverage();
    expect(result.problems).toEqual([]);
    expect(result.looked).toBeGreaterThan(60);
  });
});

describe('selfCheck', () => {
  const result = selfCheck();

  it('runs every check', () => {
    expect(result.checks.map((check) => check.check)).toEqual([
      'log rules',
      'species register',
      'defect catalogue',
      'grade prices',
      'kiln schedules',
      'schedule coverage',
      'structural knot limits',
      'yard tables',
    ]);
  });

  it('says how much it looked at', () => {
    expect(result.looked).toBeGreaterThan(80);
  });

  it('comes back clean', () => {
    expect(result.clean).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('gives every check a count of what it looked at', () => {
    for (const check of result.checks) {
      expect(check.looked).toBeGreaterThan(0);
    }
  });
});

describe('the newer tables check out too', () => {
  it('the structural knot limits', () => {
    const result = checkStructural();
    expect(result.problems).toEqual([]);
    expect(result.looked).toBeGreaterThan(10);
  });

  it('the yard tables', () => {
    const result = checkYardTables();
    expect(result.problems).toEqual([]);
    expect(result.looked).toBeGreaterThan(10);
  });

  it('are part of the whole check', () => {
    expect(selfCheck().checks.map((check) => check.check)).toContain('structural knot limits');
    expect(selfCheck().checks.map((check) => check.check)).toContain('yard tables');
  });

  it('leave the whole check clean', () => {
    expect(selfCheck().clean).toBe(true);
  });

  it('look at more than the earlier checks did on their own', () => {
    expect(selfCheck().looked).toBeGreaterThan(100);
  });
});
