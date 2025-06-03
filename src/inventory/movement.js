/**
 * Movements.
 *
 * Wood arrives, sits, moves, is sawn and leaves. A yard that only records the
 * first and the last of those cannot answer the question that matters when a
 * package goes missing, which is where it was last seen.
 *
 * A movement is an event and the balance is a fold over the events, not a
 * number kept alongside them. Keeping a running balance and the events both is
 * how a yard ends up with two answers, and the events are always the one that
 * is right.
 */

import { round2, sum } from '../num.js';
import { groupBy } from '../collect.js';
import { DeckError } from './deck.js';

/** What can happen to wood. Each says which way the balance moves. */
export const MOVEMENTS = {
  received: { id: 'received', sign: 1, needs: ['to'] },
  moved: { id: 'moved', sign: 0, needs: ['from', 'to'] },
  sawn: { id: 'sawn', sign: -1, needs: ['from'] },
  shipped: { id: 'shipped', sign: -1, needs: ['from'] },
  adjusted: { id: 'adjusted', sign: 1, needs: ['to', 'reason'] },
  culled: { id: 'culled', sign: -1, needs: ['from', 'reason'] },
};

/** Checks one movement makes sense on its own. */
export function checkMovement(movement) {
  const spec = MOVEMENTS[movement.kind];
  if (!spec) {
    throw new DeckError(`nothing called ${movement.kind} happens to wood here`, { path: 'kind' });
  }
  for (const field of spec.needs) {
    if (!movement[field]) {
      throw new DeckError(`a ${movement.kind} movement needs a ${field}`, { path: field });
    }
  }
  if (!(movement.boardFeet > 0)) {
    throw new DeckError(`a ${movement.kind} movement needs a footage`, { path: 'boardFeet' });
  }
  if (!movement.at) {
    throw new DeckError(`a ${movement.kind} movement needs a time`, { path: 'at' });
  }
  return spec;
}

/**
 * The balance at every location, folded from the events. A move takes footage
 * out of one place and puts it in another, which is why its sign is zero: it
 * changes nothing about how much wood the yard has.
 */
export function balances(movements, asOf = null) {
  const places = new Map();
  const touch = (place, feet) => {
    places.set(place, round2((places.get(place) ?? 0) + feet));
  };

  for (const movement of movements) {
    checkMovement(movement);
    if (asOf && movement.at > asOf) continue;
    const spec = MOVEMENTS[movement.kind];
    if (spec.sign === 0) {
      touch(movement.from, -movement.boardFeet);
      touch(movement.to, movement.boardFeet);
    } else if (spec.sign > 0) {
      touch(movement.to, movement.boardFeet);
    } else {
      touch(movement.from, -movement.boardFeet);
    }
  }

  return [...places.entries()]
    .map(([place, boardFeet]) => ({ place, boardFeet }))
    .sort((a, b) => b.boardFeet - a.boardFeet || a.place.localeCompare(b.place));
}

/** Anywhere the fold has gone negative, which means an event is missing. */
export function negatives(movements, asOf = null) {
  return balances(movements, asOf).filter((row) => row.boardFeet < -1e-6);
}

/** Where one thing was last seen, and what happened to it. */
export function trace(movements, id) {
  if (!id) {
    throw new DeckError('a trace needs something to trace', { path: 'id' });
  }
  const seen = movements
    .filter((movement) => movement.id === id)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  if (seen.length === 0) {
    return { id, found: false, movements: [], lastSeen: null, at: null };
  }
  const last = seen.at(-1);
  const spec = MOVEMENTS[last.kind];
  return {
    id,
    found: true,
    movements: seen,
    lastSeen: spec.sign < 0 ? null : (last.to ?? last.from),
    gone: spec.sign < 0 ? last.kind : null,
    at: last.at,
  };
}

/** What the yard did, by kind and by day. */
export function activity(movements, options = {}) {
  const { from = null, to = null } = options;
  const inWindow = movements.filter(
    (movement) => (!from || movement.at >= from) && (!to || movement.at <= to)
  );
  const grouped = groupBy(inWindow, (movement) => movement.kind);
  return [...grouped.entries()]
    .map(([kind, rows]) => ({
      kind,
      count: rows.length,
      boardFeet: sum(
        rows.map((row) => row.boardFeet),
        2
      ),
    }))
    .sort((a, b) => b.boardFeet - a.boardFeet || a.kind.localeCompare(b.kind));
}
