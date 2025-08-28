/**
 * The release checks, run as tests as well as in the shell script.
 *
 * The script is what CI runs and it is also the thing nobody runs locally.
 * These are the same checks in the test suite, so a version drift fails on the
 * developer's machine rather than in the build.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RELEASE, VERSION } from '../src/version.js';
import { CURRENT_VERSION } from '../src/store/migrate.js';
import { SNAPSHOT_FORMAT } from '../src/store/snapshot.js';
import * as surface from '../src/index.js';
import { selfCheck } from '../src/selfcheck.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('the version', () => {
  it('agrees between the package and the program', () => {
    expect(pkg.version).toBe(VERSION);
  });

  it('agrees with what the command line reports', () => {
    const reported = execFileSync('node', [join(root, 'bin', 'buckline.js'), '--version'], {
      encoding: 'utf8',
    }).trim();
    expect(reported).toBe(pkg.version);
  });
});

describe('the release notes', () => {
  it('claim the journal format the journal writes', () => {
    expect(RELEASE.journalFormat).toBe(CURRENT_VERSION);
  });

  it('claim the snapshot format the snapshot writes', () => {
    expect(RELEASE.snapshotFormat).toBe(SNAPSHOT_FORMAT);
  });

  it('name every exit code the command line uses', () => {
    expect(Object.keys(RELEASE.exitCodes).sort()).toEqual(['0', '2', '3', '4', '5']);
  });

  it('carry the version they are about', () => {
    expect(RELEASE.version).toBe(VERSION);
  });
});

describe('the package', () => {
  it('declares a bin and points it at a real file', () => {
    expect(pkg.bin.buckline).toBe('bin/buckline.js');
    expect(readFileSync(join(root, pkg.bin.buckline), 'utf8')).toContain('#!/usr/bin/env node');
  });

  it('ships the bin and the source', () => {
    expect(pkg.files).toContain('bin');
    expect(pkg.files).toContain('src');
  });

  it('declares an entry point that resolves', () => {
    expect(pkg.exports['.']).toBe('./src/index.js');
    expect(pkg.main).toBe('src/index.js');
  });

  it('has one runtime dependency', () => {
    expect(Object.keys(pkg.dependencies)).toEqual(['commander']);
  });

  it('pins every dependency exactly', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, range] of Object.entries(all)) {
      expect(range, `${name} is not pinned`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

describe('the public surface', () => {
  it('exports nothing undefined', () => {
    const missing = Object.entries(surface).filter(([, value]) => value === undefined);
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it('exports a lot of names', () => {
    expect(Object.keys(surface).length).toBeGreaterThan(200);
  });
});

describe('the tables', () => {
  it('check out against each other', () => {
    const result = selfCheck();
    expect(result.problems).toEqual([]);
  });
});
