/**
 * A load test that measures work rather than time.
 *
 * A test that asserts something took under a second passes on a quiet machine
 * and fails in a busy build, and the failure says nothing about the program.
 * These count how many times the fold runs and how many entries a reopen has
 * to read, which is the thing that actually went wrong when this was slow.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal } from '../../src/store/journal.js';
import { Projection, keyedProjection } from '../../src/store/projection.js';
import { hydrate, writeSnapshot } from '../../src/store/snapshot.js';
import { byDay, find, history, kindCensus } from '../../src/store/query.js';

const ENTRIES = 4000;

let dir;
let path;
let journal;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-load-'));
  path = join(dir, 'journal.jsonl');
  journal = openJournal(path, { sync: false });

  const batch = [];
  for (let i = 0; i < ENTRIES; i += 1) {
    const day = String((i % 28) + 1).padStart(2, '0');
    batch.push({
      kind: i % 3 === 0 ? 'tract.saved' : 'load.received',
      id: `T-${i % 40}`,
      loadId: `LD-${i}`,
      at: `2025-04-${day}T09:00:00Z`,
      actor: i % 2 === 0 ? 'dr' : 'cb',
    });
  }
  journal.append(batch);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('a journal with a few thousand entries', () => {
  it('reads back everything that was written', () => {
    expect(openJournal(path, { sync: false }).length).toBe(ENTRIES);
  });

  it('folds each entry into a projection exactly once', () => {
    let calls = 0;
    const projection = new Projection('counter', {
      'tract.saved': (state) => {
        calls += 1;
        return state;
      },
      'load.received': (state) => {
        calls += 1;
        return state;
      },
    });
    projection.refresh(journal);
    projection.refresh(journal);
    projection.refresh(journal);
    expect(calls).toBe(ENTRIES);
  });

  it('folds nothing at all on a refresh with no new entries', () => {
    const projection = keyedProjection('tracts', ['tract.saved']);
    projection.refresh(journal);
    const applied = projection.applied;
    projection.refresh(journal);
    expect(projection.applied).toBe(applied);
  });

  it('reads only what is new after a snapshot', () => {
    const snapshotPath = join(dir, 'tracts.json');
    const first = keyedProjection('tracts', ['tract.saved']).refresh(journal);
    writeSnapshot(snapshotPath, first);

    journal.append([{ kind: 'tract.saved', id: 'T-new' }]);

    const second = keyedProjection('tracts', ['tract.saved']);
    const how = hydrate(second, journal, snapshotPath);
    expect(how.from).toBe('snapshot');
    expect(how.foldedTo - how.foldedFrom).toBe(1);
    expect(second.state.has('T-new')).toBe(true);
  });

  it('keeps one record per key however many entries touched it', () => {
    const projection = keyedProjection('tracts', ['tract.saved']).refresh(journal);
    expect(projection.state.size).toBe(40);
  });

  it('answers a query over the whole journal', () => {
    expect(find(journal, { kind: 'tract.saved' })).toHaveLength(Math.ceil(ENTRIES / 3));
    expect(find(journal, { actor: 'dr' })).toHaveLength(ENTRIES / 2);
  });

  it('traces one load through a journal of thousands', () => {
    expect(history(journal, 'LD-17')).toHaveLength(1);
  });

  it('counts the kinds and the days', () => {
    expect(kindCensus(journal).reduce((sum, row) => sum + row.count, 0)).toBe(ENTRIES);
    expect(byDay(journal)).toHaveLength(28);
  });

  it('numbers every entry once and in order', () => {
    const entries = journal.all();
    for (let i = 0; i < entries.length; i += 1) {
      expect(entries[i].seq).toBe(i + 1);
    }
  });

  it('reopens and folds to the same answer as the running process', () => {
    const running = keyedProjection('tracts', ['tract.saved']).refresh(journal);
    const reopened = keyedProjection('tracts', ['tract.saved']).refresh(
      openJournal(path, { sync: false })
    );
    expect([...reopened.state.keys()].sort()).toEqual([...running.state.keys()].sort());
  });
});
