/**
 * Projections.
 *
 * A projection is the current answer to one question, folded out of the
 * journal. The only rule that matters here is that a projection is brought up
 * to date by reading the entries it has not seen, never by replaying the whole
 * journal again.
 *
 * That sounds obvious and the first version did it the other way round. Every
 * read rebuilt from entry one, so writing the n-th entry cost n-1 replays and
 * ten thousand entries took minutes. A fold over a sequence extended by one
 * entry is the old fold plus that entry, which is the whole point of writing
 * it as a fold.
 */

import { BucklineError } from '../errors.js';

export class ProjectionError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'PROJECTION', ...options });
    this.name = 'ProjectionError';
  }
}

export class Projection {
  /**
   * `handlers` maps an entry kind to a reducer. A kind with no handler is
   * skipped, so a projection only has to know about the entries it cares
   * about and new entry kinds do not break old projections.
   */
  constructor(name, handlers, options = {}) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ProjectionError('a projection needs a name');
    }
    if (!handlers || typeof handlers !== 'object') {
      throw new ProjectionError(`projection ${name} needs a handler map`);
    }
    this.name = name;
    this.handlers = handlers;
    this.initial = options.initial ?? (() => new Map());
    this.state = this.initial();
    this.lastSeq = 0;
    this.applied = 0;
    this.skipped = 0;
  }

  /** Applies every entry the projection has not seen yet. */
  refresh(journal) {
    const pending = journal.since(this.lastSeq);
    for (const entry of pending) {
      this.applyEntry(entry);
    }
    return this;
  }

  applyEntry(entry) {
    if (entry.seq <= this.lastSeq) {
      throw new ProjectionError(
        `projection ${this.name} has already seen sequence ${entry.seq}`,
        { path: this.name }
      );
    }
    const handler = this.handlers[entry.kind];
    if (handler) {
      const next = handler(this.state, entry);
      if (next !== undefined) this.state = next;
      this.applied += 1;
    } else {
      this.skipped += 1;
    }
    this.lastSeq = entry.seq;
    return this;
  }

  /** Throws the fold away and starts again from nothing. */
  reset() {
    this.state = this.initial();
    this.lastSeq = 0;
    this.applied = 0;
    this.skipped = 0;
    return this;
  }

  /** How much of the journal this projection has folded in. */
  status() {
    return {
      name: this.name,
      lastSeq: this.lastSeq,
      applied: this.applied,
      skipped: this.skipped,
      kinds: Object.keys(this.handlers).sort(),
    };
  }
}

/** A projection that keeps one record per id in a Map. */
export function keyedProjection(name, kinds, options = {}) {
  // Not `valueOf`. That name is inherited from Object.prototype, so the
  // default never fires and every call lands on Object.prototype.valueOf.
  const { keyOf = (entry) => entry.id, recordOf = (entry) => entry.record } = options;
  const handlers = {};
  for (const kind of kinds) {
    handlers[kind] = (state, entry) => {
      const key = keyOf(entry);
      if (key === undefined || key === null) {
        throw new ProjectionError(`entry ${entry.seq} of kind ${kind} has no key`, { path: name });
      }
      const value = recordOf(entry);
      if (value === null) {
        state.delete(key);
      } else {
        state.set(key, value);
      }
      return state;
    };
  }
  return new Projection(name, handlers);
}

/** A projection that counts entries by a key. */
export function countingProjection(name, kinds, keyOf) {
  const handlers = {};
  for (const kind of kinds) {
    handlers[kind] = (state, entry) => {
      const key = keyOf(entry);
      state.set(key, (state.get(key) ?? 0) + 1);
      return state;
    };
  }
  return new Projection(name, handlers);
}
