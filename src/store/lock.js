/**
 * One writer at a time.
 *
 * Two processes appending to the same journal will interleave lines and the
 * sequence numbers will collide, and the damage is not obvious until somebody
 * reopens the book weeks later and it refuses to load. A yard runs one scale
 * office and two or three terminals, so this happens.
 *
 * The lock is a file created with the exclusive flag, which is atomic on every
 * filesystem worth using. It holds the pid and a timestamp so a lock left by a
 * crashed process can be recognised and cleared rather than blocking the yard
 * until somebody works out what to delete.
 *
 * A stale lock is cleared on age, not on whether the pid is alive. Checking
 * the pid looks better and is wrong: pids are reused, and a lock file written
 * by a process on another machine sharing the same drive has a pid that means
 * nothing here.
 */

import {
  openSync,
  closeSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeSync,
  mkdirSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { BucklineError } from '../errors.js';

export class LockError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'LOCK', ...options });
    this.name = 'LockError';
  }
}

/** How long a lock is honoured before it is treated as abandoned. */
export const DEFAULT_STALE_MS = 5 * 60 * 1000;

/** Reads a lock file, or null when there is not one. */
export function readLock(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { unreadable: true };
  }
}

/** True when a lock is old enough to ignore. */
export function isStale(lock, options = {}) {
  const { staleMs = DEFAULT_STALE_MS, now = Date.now() } = options;
  if (!lock) return false;
  if (lock.unreadable) return true;
  if (typeof lock.takenAt !== 'number') return true;
  return now - lock.takenAt > staleMs;
}

/**
 * Takes the lock. Throws when somebody else holds a lock that is not stale;
 * clears and retakes one that is.
 */
export function acquire(path, options = {}) {
  const { owner = `pid ${process.pid}`, now = Date.now(), staleMs = DEFAULT_STALE_MS } = options;
  mkdirSync(dirname(path), { recursive: true });

  const existing = readLock(path);
  if (existing && !isStale(existing, { staleMs, now })) {
    throw new LockError(`the book is locked by ${existing.owner ?? 'somebody'}`, {
      path,
      details: existing,
    });
  }
  if (existing) {
    unlinkSync(path);
  }

  let fd;
  try {
    fd = openSync(path, 'wx');
  } catch (error) {
    throw new LockError('another process took the lock at the same moment', {
      path,
      cause: error,
    });
  }
  try {
    writeSync(fd, JSON.stringify({ owner, takenAt: now, clearedStale: Boolean(existing) }));
  } finally {
    closeSync(fd);
  }

  return {
    path,
    owner,
    takenAt: now,
    clearedStale: Boolean(existing),
    release: () => release(path, owner),
  };
}

/**
 * Gives the lock back. Releasing a lock somebody else now holds is refused
 * rather than ignored, because it means two processes both thought they had
 * it and that is worth stopping for.
 */
export function release(path, owner) {
  const existing = readLock(path);
  if (!existing) return false;
  if (owner !== undefined && existing.owner !== owner) {
    throw new LockError(`the lock is held by ${existing.owner}, not ${owner}`, { path });
  }
  unlinkSync(path);
  return true;
}

/** Runs a function with the lock held, and gives it back whatever happens. */
export function withLock(path, work, options = {}) {
  const held = acquire(path, options);
  try {
    return work(held);
  } finally {
    release(path, held.owner);
  }
}
