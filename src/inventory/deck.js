/**
 * The log deck.
 *
 * Logs waiting to be sawn. The deck is not a queue, whatever the yard says: a
 * mill saws what it needs for the order it is running, so the same deck is
 * read in a different order every day. What it does need is an honest answer
 * to "what is out there", broken out the way the sawyer asks for it, and an
 * age on every stick.
 *
 * Age is the number that matters and it is the one nobody tracks. A log put on
 * the deck in June and sawn in August is not the log that was scaled. It has
 * lost water out of the ends, taken stain in the sapwood and split back from
 * both faces, and none of that is on the ticket.
 */

import { round1, round2, sum } from '../num.js';
import { summarize } from '../collect.js';
import { BucklineError } from '../errors.js';

export class DeckError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'DECK', ...options });
    this.name = 'DeckError';
  }
}

/** Days between two dates, or null when either is missing. */
export function daysBetween(from, to) {
  if (!from || !to) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  return Number.isNaN(days) ? null : round1(days);
}

/** Puts a scaled log onto the deck. */
export function deckEntry(log, arrivedOn, netBoardFeet) {
  if (!arrivedOn) {
    throw new DeckError(`log ${log.id} has no arrival date`, { path: 'arrivedOn' });
  }
  if (!(netBoardFeet >= 0)) {
    throw new DeckError(`log ${log.id} has no scale on it`, { path: 'netBoardFeet' });
  }
  return {
    logId: log.id,
    species: log.species,
    speciesGroup: log.speciesGroup,
    diameterIn: log.scalingDiameterIn,
    lengthFt: log.nominalLengthFt,
    arrivedOn,
    netBoardFeet: round2(netBoardFeet),
    sawnOn: null,
  };
}

/** The whole deck as of a date, oldest first. */
export function onDeck(entries, asOf) {
  return entries
    .filter((entry) => entry.arrivedOn <= asOf && (!entry.sawnOn || entry.sawnOn > asOf))
    .map((entry) => ({ ...entry, ageDays: daysBetween(entry.arrivedOn, asOf) }))
    .sort((a, b) => b.ageDays - a.ageDays || a.logId.localeCompare(b.logId));
}

/** What is out there, by whichever key the sawyer asked for. */
export function deckSummary(entries, asOf, keyOf) {
  const current = onDeck(entries, asOf);
  return summarize(current, keyOf, {
    netBoardFeet: (entry) => entry.netBoardFeet,
    ageDays: (entry) => entry.ageDays,
  })
    .map((bucket) => ({
      key: bucket.key,
      logs: bucket.count,
      netBoardFeet: round2(bucket.netBoardFeet),
      averageAgeDays: round1(bucket.ageDays / bucket.count),
    }))
    .sort((a, b) => b.netBoardFeet - a.netBoardFeet || String(a.key).localeCompare(String(b.key)));
}

/**
 * The oldest wood on the deck. This is the report a mill should run every
 * Monday and does not, and the first time it is run it always finds something
 * from last season nobody remembered was there.
 */
export function oldest(entries, asOf, options = {}) {
  const { olderThanDays = 60, limit = 20 } = options;
  return onDeck(entries, asOf)
    .filter((entry) => entry.ageDays >= olderThanDays)
    .slice(0, limit);
}

/** Total board feet standing on the deck. */
export function deckVolume(entries, asOf) {
  return sum(
    onDeck(entries, asOf).map((entry) => entry.netBoardFeet),
    2
  );
}

/**
 * How long the deck would last at a stated cut rate, in days. A mill running
 * eight days of inventory in November is about to have a quiet January.
 */
export function daysOfInventory(entries, asOf, boardFeetPerDay) {
  if (!(boardFeetPerDay > 0)) {
    throw new DeckError('a cut rate has to be positive', { path: 'boardFeetPerDay' });
  }
  return round1(deckVolume(entries, asOf) / boardFeetPerDay);
}

/** Marks logs as sawn, returning a new list rather than editing in place. */
export function markSawn(entries, logIds, sawnOn) {
  const wanted = new Set(logIds);
  const found = new Set();
  const next = entries.map((entry) => {
    if (!wanted.has(entry.logId)) return entry;
    found.add(entry.logId);
    return { ...entry, sawnOn };
  });
  const missing = [...wanted].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new DeckError(`these logs are not on the deck: ${missing.join(', ')}`, {
      path: 'logIds',
      details: { missing },
    });
  }
  return next;
}
