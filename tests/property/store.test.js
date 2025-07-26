import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal } from '../../src/store/journal.js';
import { Projection, keyedProjection } from '../../src/store/projection.js';
import { hydrate, serialise, restore, writeSnapshot } from '../../src/store/snapshot.js';
import { migrate, migrateAll, versionOf } from '../../src/store/migrate.js';
import { byDay, find, history } from '../../src/store/query.js';
import { intBetween, oneOf, rng } from './generators.js';

const KINDS = ['tract.saved', 'load.received', 'load.scaled', 'note.written'];

function someEntries(seed, count) {
  const next = rng(seed);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const day = String(intBetween(next, 1, 28)).padStart(2, '0');
    out.push({
      kind: oneOf(next, KINDS),
      id: `T-${intBetween(next, 1, 12)}`,
      loadId: `LD-${intBetween(next, 1, 40)}`,
      at: `2025-07-${day}T09:00:00Z`,
      actor: oneOf(next, ['dr', 'cb', 'mw']),
    });
  }
  return out;
}

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-prop-store-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function journalWith(entries, name = 'journal.jsonl') {
  const journal = openJournal(join(dir, name), { sync: false });
  journal.append(entries);
  return journal;
}

describe('the journal', () => {
  it('reads back exactly what was written, in order', () => {
    for (const seed of [401, 409, 419]) {
      const entries = someEntries(seed, 200);
      const written = journalWith(entries, `j-${seed}.jsonl`);
      const reopened = openJournal(join(dir, `j-${seed}.jsonl`), { sync: false });
      expect(reopened.length).toBe(entries.length);
      expect(reopened.all().map((entry) => entry.kind)).toEqual(written.all().map((e) => e.kind));
    }
  });

  it('numbers every entry once from one', () => {
    const journal = journalWith(someEntries(421, 300));
    journal.all().forEach((entry, index) => expect(entry.seq).toBe(index + 1));
  });

  it('stamps a readable version on everything it writes', () => {
    const journal = journalWith(someEntries(431, 100));
    for (const entry of journal.all()) {
      expect(versionOf(entry)).toBeGreaterThan(0);
    }
  });

  it('never loses an entry across an append', () => {
    const journal = journalWith(someEntries(433, 50));
    for (let i = 0; i < 20; i += 1) {
      const before = journal.length;
      journal.append(someEntries(1000 + i, 3));
      expect(journal.length).toBe(before + 3);
    }
  });
});

describe('projections', () => {
  it('reach the same answer however many times they are refreshed', () => {
    const journal = journalWith(someEntries(439, 200));
    const once = keyedProjection('tracts', ['tract.saved']).refresh(journal);
    const many = keyedProjection('tracts', ['tract.saved']);
    for (let i = 0; i < 5; i += 1) many.refresh(journal);
    expect([...many.state.entries()]).toEqual([...once.state.entries()]);
  });

  it('never apply an entry twice', () => {
    const journal = journalWith(someEntries(443, 200));
    let calls = 0;
    const projection = new Projection('counter', {
      'tract.saved': (state) => {
        calls += 1;
        return state;
      },
    });
    for (let i = 0; i < 5; i += 1) projection.refresh(journal);
    expect(calls).toBe(find(journal, { kind: 'tract.saved' }).length);
  });

  it('reach the same answer through a snapshot as without one', () => {
    const journal = journalWith(someEntries(449, 150));
    const path = join(dir, 'snap.json');
    const first = keyedProjection('tracts', ['tract.saved']).refresh(journal);
    writeSnapshot(path, first);
    journal.append(someEntries(457, 40));

    const viaSnapshot = keyedProjection('tracts', ['tract.saved']);
    hydrate(viaSnapshot, journal, path);
    const fromScratch = keyedProjection('tracts', ['tract.saved']).refresh(journal);
    expect([...viaSnapshot.state.entries()].sort()).toEqual(
      [...fromScratch.state.entries()].sort()
    );
  });

  it('round trip through a snapshot unchanged', () => {
    const journal = journalWith(someEntries(461, 120));
    const first = keyedProjection('tracts', ['tract.saved']).refresh(journal);
    const second = restore(keyedProjection('tracts', ['tract.saved']), serialise(first));
    expect(second.lastSeq).toBe(first.lastSeq);
    expect([...second.state.keys()].sort()).toEqual([...first.state.keys()].sort());
  });
});

describe('migrations', () => {
  it('never move an entry backwards', () => {
    const entries = someEntries(463, 100).map((entry, index) => ({
      ...entry,
      seq: index + 1,
      version: (index % 3) + 1,
    }));
    for (const entry of entries) {
      expect(versionOf(migrate(entry))).toBeGreaterThanOrEqual(versionOf(entry));
    }
  });

  it('are idempotent once an entry is current', () => {
    const entries = someEntries(467, 100).map((entry, index) => ({ ...entry, seq: index + 1 }));
    const once = migrateAll(entries);
    expect(migrateAll(once)).toEqual(once);
  });

  it('never lose the sequence number', () => {
    const entries = someEntries(479, 80).map((entry, index) => ({ ...entry, seq: index + 1 }));
    expect(migrateAll(entries).map((entry) => entry.seq)).toEqual(entries.map((e) => e.seq));
  });
});

describe('queries', () => {
  it('never return an entry that does not match', () => {
    const journal = journalWith(someEntries(487, 200));
    for (const kind of KINDS) {
      for (const entry of find(journal, { kind })) {
        expect(entry.kind).toBe(kind);
      }
    }
  });

  it('partition the journal across the kinds', () => {
    const journal = journalWith(someEntries(491, 200));
    const counted = KINDS.reduce((total, kind) => total + find(journal, { kind }).length, 0);
    expect(counted).toBe(journal.length);
  });

  it('never trace an entry that does not carry the identifier', () => {
    const journal = journalWith(someEntries(499, 150));
    for (const entry of history(journal, 'LD-7')) {
      expect([entry.id, entry.loadId]).toContain('LD-7');
    }
  });

  it('count every entry across the days', () => {
    const journal = journalWith(someEntries(503, 200));
    const counted = byDay(journal).reduce((total, row) => total + row.count, 0);
    expect(counted).toBe(journal.length);
  });
});
