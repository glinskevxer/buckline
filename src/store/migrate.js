/**
 * Migrating the journal.
 *
 * The journal is append only, so an old entry can never be edited. What
 * changes is how an entry is read, and that is what a migration is here: a
 * function that takes an entry written under an old shape and returns what it
 * would have been written as today.
 *
 * Migrations run on the way out of the file and not on the way in, so nothing
 * on disk is ever touched. That is slower on every read and it is the only
 * arrangement that can be undone: a migration that turns out to be wrong is
 * fixed by editing the migration, and a migration that had rewritten the file
 * would have destroyed the evidence.
 *
 * A version is stamped on each entry as it is written. An entry with no
 * version is version one, because the first version predates anybody thinking
 * about this.
 */

import { BucklineError } from '../errors.js';

export class MigrationError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'MIGRATION', ...options });
    this.name = 'MigrationError';
  }
}

/** The shape entries are written in today. */
export const CURRENT_VERSION = 3;

/**
 * The migrations, keyed by the version they upgrade from. Each one takes an
 * entry and returns the next version of it, and each one has to be able to run
 * on any entry kind: an entry it does not care about comes back unchanged.
 */
const MIGRATIONS = {
  1: (entry) => {
    // Version two put the actor on every entry. Entries written before that
    // were all made by the scale house terminal, which had no login.
    if (entry.actor !== undefined) return { ...entry, version: 2 };
    return { ...entry, actor: 'scale house', version: 2 };
  },
  2: (entry) => {
    // Version three renamed the ticket field on a scale entry. It was called
    // `scale` and it held a whole ticket, which nobody could tell from the
    // number the name implied.
    if (entry.kind !== 'load.scaled') return { ...entry, version: 3 };
    const { scale, ...rest } = entry;
    return { ...rest, ticket: entry.ticket ?? scale, version: 3 };
  },
};

/** The version an entry was written under. */
export function versionOf(entry) {
  const version = entry.version ?? 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new MigrationError(`entry ${entry.seq} carries a version of ${entry.version}`, {
      path: 'version',
    });
  }
  return version;
}

/** Brings one entry up to the current shape. */
export function migrate(entry, options = {}) {
  const { to = CURRENT_VERSION } = options;
  let current = entry;
  let version = versionOf(entry);

  if (version > to) {
    throw new MigrationError(
      `entry ${entry.seq} was written under version ${version} and this program reads ${to}`,
      { path: 'version', details: { entry: entry.seq, version } }
    );
  }

  while (version < to) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new MigrationError(`no migration from version ${version}`, { path: 'version' });
    }
    current = step(current);
    const next = versionOf(current);
    if (next <= version) {
      throw new MigrationError(`the migration from ${version} did not move the version on`, {
        path: 'version',
      });
    }
    version = next;
  }
  return current;
}

/** Brings a whole journal up to the current shape, in order. */
export function migrateAll(entries, options = {}) {
  return entries.map((entry) => migrate(entry, options));
}

/**
 * What is in a journal, by the version it was written under. This is the
 * report that says whether a migration is still earning its keep or whether
 * the last old entry aged out years ago.
 */
export function versionCensus(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const version = versionOf(entry);
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([version, count]) => ({ version, count, current: version === CURRENT_VERSION }))
    .sort((a, b) => a.version - b.version);
}

/** Stamps the current version on an entry being written. */
export function stamp(record) {
  return { ...record, version: CURRENT_VERSION };
}
