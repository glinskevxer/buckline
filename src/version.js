/**
 * The version, in one place.
 *
 * It was declared in the command line module and again in package.json, and
 * they drifted: a smoke test asserted a version that the last commit had
 * bumped past, and the local run that passed had been made before the bump.
 *
 * They still cannot be one literal, because package.json is data a package
 * manager reads and this is code a bundler reads, and importing json from an
 * ES module needs an import attribute that not every tool understands yet.
 * What they can be is one line in one file with a check that they agree, which
 * is what the release check and the release test both do.
 */

/** The version this build reports. Keep it equal to package.json. */
export const VERSION = '1.0.0';

/** What the version means, so a reader does not have to guess. */
export const RELEASE = {
  version: VERSION,
  name: 'buckline',
  /** The journal format this build writes. Older entries are migrated on read. */
  journalFormat: 3,
  /** The snapshot format this build writes. An older one is discarded. */
  snapshotFormat: 2,
  /** The command line contract: what an exit code means. */
  exitCodes: {
    0: 'the command worked',
    2: 'a usage mistake',
    3: 'bad data',
    4: 'a file that is not there',
    5: 'anything else',
  },
};

/** Splits a version into its parts, for a comparison that is not string order. */
export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Compares two versions. Negative when the first is older. */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    throw new TypeError(`cannot compare ${left} with ${right}`);
  }
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Whether a journal written by another build can be read by this one. A
 * journal from a newer format cannot, and saying so is better than reading it
 * wrong, which is what a version field is for.
 */
export function canRead(journalFormat) {
  if (!Number.isInteger(journalFormat) || journalFormat < 1) {
    return { readable: false, reason: `${journalFormat} is not a journal format` };
  }
  if (journalFormat > RELEASE.journalFormat) {
    return {
      readable: false,
      reason: `that book is format ${journalFormat} and this build reads ${RELEASE.journalFormat}`,
    };
  }
  return { readable: true, reason: null };
}
