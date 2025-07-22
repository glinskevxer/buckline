/**
 * Limits.
 *
 * Two things in this program are quadratic in the size of their input: the
 * cutting search over cut positions on a board face, and the bucking search
 * over cut positions on a stem. Both are fine on real wood and both will sit
 * there forever on a file with ten thousand defects in it, which is what a
 * broken export produces.
 *
 * The answer is not to make them faster. A board does not have ten thousand
 * defects, and a file that says it does is wrong. The answer is to refuse it
 * and say so, which turns a hang into a message.
 *
 * Every limit here is far above anything real. They exist to catch a file that
 * is wrong, never to constrain a file that is right.
 */

import { BucklineError } from './errors.js';

export class LimitError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'LIMIT', ...options });
    this.name = 'LimitError';
  }
}

/**
 * What the program will take. A scaler cannot write a hundred defects on one
 * log in a working day and a truck does not carry two hundred logs, so
 * anything past these came out of a machine that got something wrong.
 */
export const LIMITS = {
  logsPerLoad: 300,
  defectsPerLog: 100,
  defectsPerBoard: 200,
  boardsPerTally: 20000,
  cutPositionsPerStem: 400,
  profilePointsPerStem: 100,
  entriesPerAppend: 5000,
  recordsPerFile: 200000,
};

/** Refuses a count over a limit, naming what was counted and what the cap is. */
export function checkLimit(name, count, options = {}) {
  const cap = options.cap ?? LIMITS[name];
  if (cap === undefined) {
    throw new LimitError(`there is no limit called ${name}`, { path: 'limit' });
  }
  if (count > cap) {
    throw new LimitError(`${count} is past the ${name} limit of ${cap}`, {
      path: name,
      details: { count, cap },
      hint: 'this is far above anything real, so the file is probably wrong',
    });
  }
  return count;
}

/** True when a count is inside a limit. */
export function withinLimit(name, count, options = {}) {
  try {
    checkLimit(name, count, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks a whole record against the limits that apply to it. Used at the edge,
 * where a file becomes a record, so nothing further in has to think about it.
 */
export function checkLoad(raw) {
  const logs = Array.isArray(raw?.logs) ? raw.logs : [];
  checkLimit('logsPerLoad', logs.length);
  for (const [index, log] of logs.entries()) {
    const defects = Array.isArray(log?.defects) ? log.defects : [];
    try {
      checkLimit('defectsPerLog', defects.length);
    } catch (error) {
      throw new LimitError(`log ${index}: ${error.message}`, {
        path: `logs[${index}].defects`,
        details: error.details,
      });
    }
  }
  return raw;
}

/** Checks a board before the cutting search runs over it. */
export function checkBoard(raw) {
  const defects = Array.isArray(raw?.defects) ? raw.defects : [];
  checkLimit('defectsPerBoard', defects.length);
  return raw;
}

/** Checks a stem before the bucking search runs over it. */
export function checkStem(raw) {
  const profile = Array.isArray(raw?.profile) ? raw.profile : [];
  checkLimit('profilePointsPerStem', profile.length);
  return raw;
}

/** Checks the position list a search is about to go quadratic over. */
export function checkPositions(positions, options = {}) {
  checkLimit('cutPositionsPerStem', positions.length, options);
  return positions;
}

/** Checks a file of records at the edge. */
export function checkFile(records) {
  if (Array.isArray(records)) {
    checkLimit('recordsPerFile', records.length);
  }
  return records;
}
