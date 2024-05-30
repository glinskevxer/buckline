/**
 * Building units.
 *
 * A unit is a strapped package of lumber that leaves the yard as one item. It
 * has to be one grade, one thickness and one length, because a customer buying
 * eight quarter FAS red oak in twelve foot lengths will not accept a package
 * with anything else in it. Within those constraints the yard wants packages
 * as close to a target footage as it can get, and it wants as few short
 * packages as possible, because a half package ties up a strap and a forklift
 * trip for half the money.
 *
 * Boards that cannot fill a package go to the odds pile and are held until
 * enough of that combination turns up. That is a real cost and the summary
 * reports it rather than hiding it in a rounding.
 */

import { BucklineError } from '../errors.js';
import { round2 } from '../num.js';

export class TallyError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'TALLY', ...options });
    this.name = 'TallyError';
  }
}

/** The key that decides which package a board can go in. */
export function unitKey(entry) {
  return `${entry.grade}|${entry.quarters}|${entry.lengthFt}`;
}

/** Reads a unit key back into its parts. */
export function parseUnitKey(key) {
  const [grade, quarters, lengthFt] = key.split('|');
  return { grade, quarters: Number(quarters), lengthFt: Number(lengthFt) };
}

/**
 * Sorts a tally into packages.
 *
 * `entries` are graded boards: anything with `grade`, `quarters`, `lengthFt`
 * and `boardFeet` on it. Boards with no grade never go in a package.
 */
export function buildUnits(entries, options = {}) {
  const { targetBoardFeet = 1000, minimumBoardFeet = 600 } = options;
  if (targetBoardFeet <= 0) {
    throw new TallyError('a unit target has to be a positive footage', { path: 'targetBoardFeet' });
  }
  if (minimumBoardFeet > targetBoardFeet) {
    throw new TallyError('the minimum cannot be over the target', { path: 'minimumBoardFeet' });
  }

  const groups = new Map();
  const ungraded = [];
  for (const entry of entries) {
    if (!entry.grade) {
      ungraded.push(entry);
      continue;
    }
    const key = unitKey(entry);
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }

  const units = [];
  const odds = [];

  for (const [key, bucket] of [...groups.entries()].sort()) {
    const parts = parseUnitKey(key);
    let current = newUnit(units.length + 1, parts);

    for (const entry of bucket.sort((a, b) => b.boardFeet - a.boardFeet)) {
      if (current.boardFeet + entry.boardFeet > targetBoardFeet && current.boards.length > 0) {
        closeUnit(units, odds, current, minimumBoardFeet);
        current = newUnit(units.length + 1, parts);
      }
      current.boards.push(entry);
      current.boardFeet = round2(current.boardFeet + entry.boardFeet);
    }
    closeUnit(units, odds, current, minimumBoardFeet);
  }

  return {
    units,
    odds,
    ungraded,
    unitBoardFeet: round2(units.reduce((total, unit) => total + unit.boardFeet, 0)),
    oddsBoardFeet: round2(odds.reduce((total, entry) => total + entry.boardFeet, 0)),
    ungradedBoardFeet: round2(ungraded.reduce((total, entry) => total + entry.boardFeet, 0)),
  };
}

function newUnit(number, parts) {
  return {
    unitId: `U-${String(number).padStart(4, '0')}`,
    grade: parts.grade,
    quarters: parts.quarters,
    lengthFt: parts.lengthFt,
    boards: [],
    boardFeet: 0,
  };
}

function closeUnit(units, odds, unit, minimumBoardFeet) {
  if (unit.boards.length === 0) return;
  if (unit.boardFeet < minimumBoardFeet) {
    odds.push(...unit.boards);
    return;
  }
  unit.pieceCount = unit.boards.length;
  units.push(unit);
}

/** How full the packages came out, which is the number the yard watches. */
export function packingEfficiency(result, targetBoardFeet = 1000) {
  if (result.units.length === 0) return 0;
  const capacity = result.units.length * targetBoardFeet;
  return round2(result.unitBoardFeet / capacity);
}

/** A one line description of a package for the strap tag. */
export function describeUnit(unit) {
  return `${unit.unitId} ${unit.grade} ${unit.quarters}/4 ${unit.lengthFt}ft ${unit.boardFeet}bf ${unit.pieceCount}pc`;
}
