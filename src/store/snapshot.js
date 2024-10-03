/**
 * Snapshots.
 *
 * A projection folds forward from where it left off, which is fast in a
 * running process and useless to a new one: a fresh process starts at sequence
 * zero and has to read the whole journal. On a book with a hundred thousand
 * entries that is a few seconds every time somebody runs a command, which is
 * how a tool stops being used.
 *
 * A snapshot is the projection state written down at a sequence number. A new
 * process loads the snapshot and folds only what came after it. The snapshot
 * is a cache and nothing else: deleting every snapshot on disk changes no
 * answer, only how long it takes to get one. That property is what makes
 * snapshots safe, and it is worth checking rather than assuming, so the tests
 * assert it directly.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BucklineError } from '../errors.js';
import { jsonSafe } from '../cli/render/json.js';

export class SnapshotError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'SNAPSHOT', ...options });
    this.name = 'SnapshotError';
  }
}

/** The format version, so an old snapshot is discarded rather than misread. */
export const SNAPSHOT_FORMAT = 2;

/** Turns a projection into something that can be written down. */
export function serialise(projection) {
  return {
    format: SNAPSHOT_FORMAT,
    name: projection.name,
    lastSeq: projection.lastSeq,
    applied: projection.applied,
    skipped: projection.skipped,
    state: jsonSafe(projection.state),
    stateKind: projection.state instanceof Map ? 'map' : 'plain',
  };
}

/** Puts a serialised state back onto a projection. */
export function restore(projection, snapshot) {
  if (!snapshot || snapshot.format !== SNAPSHOT_FORMAT) {
    throw new SnapshotError('snapshot is in a format this version does not read', {
      path: 'format',
    });
  }
  if (snapshot.name !== projection.name) {
    throw new SnapshotError(`snapshot is for projection ${snapshot.name}, not ${projection.name}`, {
      path: 'name',
    });
  }
  projection.state =
    snapshot.stateKind === 'map' ? new Map(Object.entries(snapshot.state)) : snapshot.state;
  projection.lastSeq = snapshot.lastSeq;
  projection.applied = snapshot.applied;
  projection.skipped = snapshot.skipped;
  return projection;
}

/** Writes a snapshot to disk. */
export function writeSnapshot(path, projection) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(serialise(projection), null, 2)}\n`, 'utf8');
  return path;
}

/**
 * Reads a snapshot back. A missing file, a file that will not parse and a file
 * from an older format all come back as null, because none of them is an
 * error: the projection simply folds from the start instead.
 */
export function readSnapshot(path) {
  if (!existsSync(path)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (!parsed || parsed.format !== SNAPSHOT_FORMAT) return null;
  return parsed;
}

/**
 * Loads a snapshot onto a projection if there is a usable one, then folds
 * whatever the journal has beyond it. Returns how it got there, because a
 * command that is unexpectedly slow needs to be able to find out whether the
 * snapshot was used.
 */
export function hydrate(projection, journal, path) {
  const snapshot = readSnapshot(path);
  if (!snapshot || snapshot.name !== projection.name) {
    projection.refresh(journal);
    return { from: 'journal', foldedFrom: 0, foldedTo: projection.lastSeq };
  }
  if (snapshot.lastSeq > journal.sequence) {
    projection.reset();
    projection.refresh(journal);
    return {
      from: 'journal',
      foldedFrom: 0,
      foldedTo: projection.lastSeq,
      reason: 'snapshot ran ahead of the journal',
    };
  }
  restore(projection, snapshot);
  const from = projection.lastSeq;
  projection.refresh(journal);
  return { from: 'snapshot', foldedFrom: from, foldedTo: projection.lastSeq };
}
