/**
 * Asking the journal a question.
 *
 * The projections answer the questions the program asks every time. This
 * answers the ones somebody asks once: what happened to load nineteen, what
 * did this scaler write last March, which tracts were touched between two
 * dates.
 *
 * It reads the whole journal every time and it is not sorry. A one off
 * question runs once and the alternative is an index that has to be kept
 * right, which is a permanent cost paid for an occasional saving. When a
 * question turns out to be asked every day it becomes a projection.
 */

import { BucklineError } from '../errors.js';
import { groupBy, summarize } from '../collect.js';

export class QueryError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'QUERY', ...options });
    this.name = 'QueryError';
  }
}

/** Builds a filter from a plain description. Every field is optional. */
export function where(spec = {}) {
  const { kind = null, kinds = null, actor = null, from = null, to = null, match = null } = spec;
  const wanted = kinds ?? (kind ? [kind] : null);

  if (from && to && to < from) {
    throw new QueryError('a window cannot end before it starts', { path: 'to' });
  }
  if (match !== null && (typeof match !== 'object' || Array.isArray(match))) {
    throw new QueryError('a match is a set of field names and values', { path: 'match' });
  }

  return (entry) => {
    if (wanted && !wanted.includes(entry.kind)) return false;
    if (actor && entry.actor !== actor) return false;
    if (from && (entry.at ?? '') < from) return false;
    if (to && (entry.at ?? '') > to) return false;
    if (match) {
      for (const [field, value] of Object.entries(match)) {
        if (entry[field] !== value) return false;
      }
    }
    return true;
  };
}

/** Every entry matching a filter, oldest first. */
export function find(journal, spec = {}) {
  return journal.all().filter(where(spec));
}

/** The first and last matching entry, or nulls. */
export function firstAndLast(journal, spec = {}) {
  const found = find(journal, spec);
  return { first: found[0] ?? null, last: found.at(-1) ?? null, count: found.length };
}

/**
 * Everything that ever happened to one thing, in order. The field the
 * identifier lives under differs by entry kind, so the caller names the fields
 * to look in rather than the program guessing.
 */
export function history(journal, id, fields = ['id', 'loadId', 'tractId', 'logId']) {
  if (!id) {
    throw new QueryError('a history needs something to trace', { path: 'id' });
  }
  return journal.all().filter((entry) => fields.some((field) => entry[field] === id));
}

/** What kinds of entry the journal holds, commonest first. */
export function kindCensus(journal) {
  return summarize(journal.all(), (entry) => entry.kind, { seq: () => 0 })
    .map((bucket) => ({ kind: bucket.key, count: bucket.count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

/** Who wrote what, for a period audit. */
export function byActor(journal, spec = {}) {
  const entries = find(journal, spec);
  const grouped = groupBy(entries, (entry) => entry.actor ?? 'unrecorded');
  return [...grouped.entries()]
    .map(([actor, rows]) => ({
      actor,
      count: rows.length,
      kinds: [...new Set(rows.map((row) => row.kind))].sort(),
      first: rows[0].at ?? null,
      last: rows.at(-1).at ?? null,
    }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor));
}

/**
 * The journal as a day by day count. This is the report that shows a yard was
 * shut for a fortnight in July, which is the sort of thing nobody remembers
 * and everybody argues about later.
 */
export function byDay(journal, spec = {}) {
  const entries = find(journal, spec).filter((entry) => typeof entry.at === 'string');
  return summarize(entries, (entry) => entry.at.slice(0, 10), { seq: () => 0 })
    .map((bucket) => ({ day: bucket.key, count: bucket.count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
