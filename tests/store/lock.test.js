import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_STALE_MS,
  LockError,
  acquire,
  isStale,
  readLock,
  release,
  withLock,
} from '../../src/store/lock.js';

let dir;
let path;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-lock-'));
  path = join(dir, 'locks', 'yard.lock');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('acquire', () => {
  it('takes a lock nobody holds', () => {
    const held = acquire(path, { owner: 'a' });
    expect(held.owner).toBe('a');
    expect(existsSync(path)).toBe(true);
  });

  it('makes the directory', () => {
    acquire(path);
    expect(readLock(path)).toBeTruthy();
  });

  it('refuses a lock somebody else holds', () => {
    acquire(path, { owner: 'a' });
    let caught;
    try {
      acquire(path, { owner: 'b' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LockError);
    expect(caught.message).toContain('a');
  });

  it('clears a stale lock and says it did', () => {
    acquire(path, { owner: 'a', now: 0 });
    const held = acquire(path, { owner: 'b', now: DEFAULT_STALE_MS + 1 });
    expect(held.owner).toBe('b');
    expect(held.clearedStale).toBe(true);
  });

  it('does not clear a lock that is still fresh', () => {
    acquire(path, { owner: 'a', now: 0 });
    expect(() => acquire(path, { owner: 'b', now: 1000 })).toThrow(LockError);
  });

  it('clears an unreadable lock file', () => {
    writeFileSync(path.replace('locks/yard.lock', 'flat.lock'), 'not json');
    const flat = join(dir, 'flat.lock');
    expect(acquire(flat, { owner: 'a' }).clearedStale).toBe(true);
  });

  it('takes a shorter stale window when told', () => {
    acquire(path, { owner: 'a', now: 0 });
    expect(acquire(path, { owner: 'b', now: 60, staleMs: 50 }).owner).toBe('b');
  });
});

describe('isStale', () => {
  it('calls nothing stale', () => {
    expect(isStale(null)).toBe(false);
  });

  it('calls an unreadable lock stale', () => {
    expect(isStale({ unreadable: true })).toBe(true);
  });

  it('calls a lock with no timestamp stale', () => {
    expect(isStale({ owner: 'a' })).toBe(true);
  });

  it('reads the age against the window', () => {
    expect(isStale({ takenAt: 0 }, { now: 100, staleMs: 50 })).toBe(true);
    expect(isStale({ takenAt: 0 }, { now: 40, staleMs: 50 })).toBe(false);
  });
});

describe('release', () => {
  it('gives the lock back', () => {
    const held = acquire(path, { owner: 'a' });
    expect(held.release()).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  it('does nothing when there is no lock', () => {
    expect(release(path, 'a')).toBe(false);
  });

  it('refuses to release somebody else lock', () => {
    acquire(path, { owner: 'a' });
    expect(() => release(path, 'b')).toThrow(LockError);
  });

  it('releases without checking when no owner is named', () => {
    acquire(path, { owner: 'a' });
    expect(release(path)).toBe(true);
  });
});

describe('withLock', () => {
  it('runs the work and gives the lock back', () => {
    const answer = withLock(path, () => 42, { owner: 'a' });
    expect(answer).toBe(42);
    expect(existsSync(path)).toBe(false);
  });

  it('gives the lock back even when the work throws', () => {
    expect(() =>
      withLock(path, () => {
        throw new Error('nope');
      })
    ).toThrow('nope');
    expect(existsSync(path)).toBe(false);
  });

  it('lets the next caller in afterwards', () => {
    withLock(path, () => null, { owner: 'a' });
    expect(withLock(path, () => 'ok', { owner: 'b' })).toBe('ok');
  });

  it('refuses to run while somebody else holds it', () => {
    acquire(path, { owner: 'a' });
    expect(() => withLock(path, () => 'ok', { owner: 'b' })).toThrow(LockError);
  });
});
