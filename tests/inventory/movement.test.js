import { describe, expect, it } from 'vitest';
import { DeckError } from '../../src/inventory/deck.js';
import {
  MOVEMENTS,
  activity,
  balances,
  checkMovement,
  negatives,
  trace,
} from '../../src/inventory/movement.js';

const movements = [
  { id: 'U-1', kind: 'received', to: 'shed A', boardFeet: 1000, at: '2025-06-01T09:00:00Z' },
  { id: 'U-2', kind: 'received', to: 'shed A', boardFeet: 800, at: '2025-06-02T09:00:00Z' },
  {
    id: 'U-1',
    kind: 'moved',
    from: 'shed A',
    to: 'shed B',
    boardFeet: 1000,
    at: '2025-06-03T09:00:00Z',
  },
  { id: 'U-2', kind: 'shipped', from: 'shed A', boardFeet: 800, at: '2025-06-05T09:00:00Z' },
];

describe('checkMovement', () => {
  it('accepts a well formed movement', () => {
    expect(checkMovement(movements[0]).id).toBe('received');
  });

  it('refuses a kind nothing does', () => {
    expect(() => checkMovement({ ...movements[0], kind: 'evaporated' })).toThrow(DeckError);
  });

  it('refuses a movement missing the places it needs', () => {
    expect(() => checkMovement({ ...movements[2], to: undefined })).toThrow(DeckError);
    expect(() => checkMovement({ ...movements[3], from: undefined })).toThrow(DeckError);
  });

  it('refuses an adjustment or a cull with no reason', () => {
    expect(() =>
      checkMovement({ id: 'U-1', kind: 'adjusted', to: 'shed A', boardFeet: 10, at: 'x' })
    ).toThrow(DeckError);
  });

  it('refuses a movement with no footage or no time', () => {
    expect(() => checkMovement({ ...movements[0], boardFeet: 0 })).toThrow(DeckError);
    expect(() => checkMovement({ ...movements[0], at: undefined })).toThrow(DeckError);
  });

  it('knows the six things that happen to wood', () => {
    expect(Object.keys(MOVEMENTS)).toHaveLength(6);
  });
});

describe('balances', () => {
  it('folds the events into a balance per place', () => {
    const rows = balances(movements);
    expect(rows.find((row) => row.place === 'shed B').boardFeet).toBe(1000);
    expect(rows.find((row) => row.place === 'shed A').boardFeet).toBe(0);
  });

  it('leaves the yard total unchanged by a move', () => {
    const before = balances(movements.slice(0, 2)).reduce((sum, row) => sum + row.boardFeet, 0);
    const after = balances(movements.slice(0, 3)).reduce((sum, row) => sum + row.boardFeet, 0);
    expect(after).toBe(before);
  });

  it('takes footage out of the yard when it ships', () => {
    const total = balances(movements).reduce((sum, row) => sum + row.boardFeet, 0);
    expect(total).toBe(1000);
  });

  it('reads the balance at a date', () => {
    const rows = balances(movements, '2025-06-02T12:00:00Z');
    expect(rows.find((row) => row.place === 'shed A').boardFeet).toBe(1800);
  });

  it('puts the fullest place first', () => {
    const rows = balances(movements, '2025-06-04T00:00:00Z');
    expect(rows[0].boardFeet).toBeGreaterThanOrEqual(rows.at(-1).boardFeet);
  });
});

describe('negatives', () => {
  it('finds nothing wrong with a complete set of events', () => {
    expect(negatives(movements)).toEqual([]);
  });

  it('finds a place that went negative because an event is missing', () => {
    const missing = [movements[2], movements[3]];
    expect(negatives(missing).map((row) => row.place)).toContain('shed A');
  });
});

describe('trace', () => {
  it('finds where something is now', () => {
    const result = trace(movements, 'U-1');
    expect(result.found).toBe(true);
    expect(result.lastSeen).toBe('shed B');
  });

  it('says what happened to something that has gone', () => {
    const result = trace(movements, 'U-2');
    expect(result.lastSeen).toBeNull();
    expect(result.gone).toBe('shipped');
  });

  it('reports nothing for something it has never seen', () => {
    expect(trace(movements, 'U-9').found).toBe(false);
  });

  it('lists the movements in time order', () => {
    const shuffled = [...movements].reverse();
    expect(trace(shuffled, 'U-1').movements[0].kind).toBe('received');
  });

  it('refuses a trace of nothing', () => {
    expect(() => trace(movements, '')).toThrow(DeckError);
  });
});

describe('activity', () => {
  it('counts what the yard did by kind', () => {
    const rows = activity(movements);
    expect(rows.map((row) => row.kind).sort()).toEqual(['moved', 'received', 'shipped']);
  });

  it('totals the footage moved', () => {
    expect(activity(movements).find((row) => row.kind === 'received').boardFeet).toBe(1800);
  });

  it('honours a window', () => {
    expect(activity(movements, { from: '2025-06-03', to: '2025-06-04' })).toHaveLength(1);
  });

  it('counts nothing in an empty window', () => {
    expect(activity(movements, { from: '2025-07-01' })).toEqual([]);
  });
});
