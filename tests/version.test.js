import { describe, expect, it } from 'vitest';
import { RELEASE, VERSION, canRead, compareVersions, parseVersion } from '../src/version.js';

describe('parseVersion', () => {
  it('splits a version into its parts', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('reads nothing out of something that is not a version', () => {
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('v1.2.3')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  it('reads the version this build reports', () => {
    expect(parseVersion(VERSION)).not.toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('1.0.9', '1.0.10')).toBeLessThan(0);
  });

  it('does not order by string, which would get ten wrong', () => {
    expect('1.10.0' > '1.2.0').toBe(false);
    expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0);
  });

  it('calls a version equal to itself', () => {
    expect(compareVersions(VERSION, VERSION)).toBe(0);
  });

  it('refuses to compare something that is not a version', () => {
    expect(() => compareVersions('1.0.0', 'latest')).toThrow(TypeError);
  });
});

describe('canRead', () => {
  it('reads the format this build writes', () => {
    expect(canRead(RELEASE.journalFormat).readable).toBe(true);
  });

  it('reads an older format', () => {
    expect(canRead(1).readable).toBe(true);
  });

  it('refuses a newer one rather than reading it wrong', () => {
    const result = canRead(RELEASE.journalFormat + 1);
    expect(result.readable).toBe(false);
    expect(result.reason).toContain('this build reads');
  });

  it('refuses something that is not a format at all', () => {
    expect(canRead(0).readable).toBe(false);
    expect(canRead(1.5).readable).toBe(false);
    expect(canRead('three').readable).toBe(false);
  });
});

describe('the release notes', () => {
  it('are at one point zero', () => {
    expect(VERSION).toBe('1.0.0');
  });

  it('name the program', () => {
    expect(RELEASE.name).toBe('buckline');
  });

  it('say what each exit code means', () => {
    expect(RELEASE.exitCodes[4]).toContain('not there');
  });
});
