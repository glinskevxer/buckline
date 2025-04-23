import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal } from '../../src/store/journal.js';
import {
  QueryError,
  byActor,
  byDay,
  find,
  firstAndLast,
  history,
  kindCensus,
  where,
} from '../../src/store/query.js';

let dir;
let journal;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-query-'));
  journal = openJournal(join(dir, 'journal.jsonl'), { sync: false });
  journal.append([{ kind: 'tract.saved', id: 'T-7' }], { at: '2025-04-01T09:00:00Z', actor: 'dr' });
  journal.append([{ kind: 'load.received', loadId: 'LD-1', tractId: 'T-7' }], {
    at: '2025-04-02T09:00:00Z',
    actor: 'cb',
  });
  journal.append([{ kind: 'load.scaled', loadId: 'LD-1', ticket: {} }], {
    at: '2025-04-02T15:00:00Z',
    actor: 'dr',
  });
  journal.append([{ kind: 'load.received', loadId: 'LD-2', tractId: 'T-7' }], {
    at: '2025-04-20T09:00:00Z',
    actor: 'cb',
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('where', () => {
  it('matches everything when nothing is asked for', () => {
    expect(find(journal)).toHaveLength(4);
  });

  it('matches one kind', () => {
    expect(find(journal, { kind: 'load.received' })).toHaveLength(2);
  });

  it('matches several kinds', () => {
    expect(find(journal, { kinds: ['load.received', 'load.scaled'] })).toHaveLength(3);
  });

  it('matches an actor', () => {
    expect(find(journal, { actor: 'dr' })).toHaveLength(2);
  });

  it('matches a window', () => {
    expect(find(journal, { from: '2025-04-02', to: '2025-04-03' })).toHaveLength(2);
  });

  it('matches on a field', () => {
    expect(find(journal, { match: { loadId: 'LD-1' } })).toHaveLength(2);
  });

  it('matches on several fields at once', () => {
    expect(find(journal, { match: { loadId: 'LD-1', kind: 'load.scaled' } })).toHaveLength(1);
  });

  it('refuses a window that ends before it starts', () => {
    expect(() => where({ from: '2025-05-01', to: '2025-04-01' })).toThrow(QueryError);
  });

  it('refuses a match that is not a set of fields', () => {
    expect(() => where({ match: 'LD-1' })).toThrow(QueryError);
    expect(() => where({ match: ['LD-1'] })).toThrow(QueryError);
  });

  it('returns entries in the order they were written', () => {
    expect(find(journal).map((entry) => entry.seq)).toEqual([1, 2, 3, 4]);
  });
});

describe('firstAndLast', () => {
  it('finds both ends of a filter', () => {
    const result = firstAndLast(journal, { kind: 'load.received' });
    expect(result.first.loadId).toBe('LD-1');
    expect(result.last.loadId).toBe('LD-2');
    expect(result.count).toBe(2);
  });

  it('reports nulls when nothing matched', () => {
    const result = firstAndLast(journal, { kind: 'nothing.happened' });
    expect(result.first).toBeNull();
    expect(result.count).toBe(0);
  });
});

describe('history', () => {
  it('traces everything that happened to a load', () => {
    expect(history(journal, 'LD-1').map((entry) => entry.kind)).toEqual([
      'load.received',
      'load.scaled',
    ]);
  });

  it('traces a tract across the fields it appears under', () => {
    expect(history(journal, 'T-7')).toHaveLength(3);
  });

  it('can be told which fields to look in', () => {
    expect(history(journal, 'T-7', ['id'])).toHaveLength(1);
  });

  it('refuses a trace of nothing', () => {
    expect(() => history(journal, '')).toThrow(QueryError);
  });
});

describe('kindCensus', () => {
  it('counts by kind, commonest first', () => {
    expect(kindCensus(journal)[0]).toEqual({ kind: 'load.received', count: 2 });
  });

  it('counts every kind', () => {
    expect(kindCensus(journal).reduce((sum, row) => sum + row.count, 0)).toBe(4);
  });
});

describe('byActor', () => {
  it('groups what each actor wrote', () => {
    const rows = byActor(journal);
    expect(rows.map((row) => row.actor).sort()).toEqual(['cb', 'dr']);
    expect(rows[0].count).toBe(2);
  });

  it('lists the kinds an actor wrote', () => {
    const dr = byActor(journal).find((row) => row.actor === 'dr');
    expect(dr.kinds).toEqual(['load.scaled', 'tract.saved']);
  });

  it('carries the first and last time each was seen', () => {
    const cb = byActor(journal).find((row) => row.actor === 'cb');
    expect(cb.first).toBe('2025-04-02T09:00:00Z');
    expect(cb.last).toBe('2025-04-20T09:00:00Z');
  });

  it('groups anything with no actor under one heading', () => {
    journal.append([{ kind: 'tract.saved', id: 'T-8' }], { at: '2025-04-21T09:00:00Z' });
    expect(byActor(journal).map((row) => row.actor)).toContain('unrecorded');
  });

  it('honours a filter', () => {
    expect(byActor(journal, { kind: 'load.received' })).toHaveLength(1);
  });
});

describe('byDay', () => {
  it('counts a row per day the yard did anything', () => {
    const rows = byDay(journal);
    expect(rows.map((row) => row.day)).toEqual(['2025-04-01', '2025-04-02', '2025-04-20']);
  });

  it('counts two entries on the busy day', () => {
    expect(byDay(journal).find((row) => row.day === '2025-04-02').count).toBe(2);
  });

  it('shows the gap where the yard was shut', () => {
    const days = byDay(journal).map((row) => row.day);
    expect(days).not.toContain('2025-04-10');
  });

  it('honours a filter', () => {
    expect(byDay(journal, { actor: 'cb' })).toHaveLength(2);
  });
});
