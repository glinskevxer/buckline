import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal } from '../../src/store/journal.js';
import {
  Projection,
  ProjectionError,
  countingProjection,
  keyedProjection,
} from '../../src/store/projection.js';

let dir;
let journal;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-'));
  journal = openJournal(join(dir, 'journal.jsonl'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Projection', () => {
  it('folds the entries it has handlers for', () => {
    const projection = new Projection('tally', {
      'log.scaled': (state, entry) => state.set(entry.logId, entry.netBoardFeet),
    });
    journal.append([
      { kind: 'log.scaled', logId: 'L-1', netBoardFeet: 144 },
      { kind: 'log.scaled', logId: 'L-2', netBoardFeet: 200 },
    ]);
    projection.refresh(journal);
    expect(projection.state.get('L-1')).toBe(144);
    expect(projection.applied).toBe(2);
  });

  it('skips entry kinds it does not know', () => {
    const projection = new Projection('tally', { 'log.scaled': (state) => state });
    journal.append([{ kind: 'log.scaled', logId: 'L-1' }, { kind: 'load.arrived' }]);
    projection.refresh(journal);
    expect(projection.applied).toBe(1);
    expect(projection.skipped).toBe(1);
  });

  it('only reads what is new on a second refresh', () => {
    let calls = 0;
    const projection = new Projection('counter', {
      'log.scaled': (state) => {
        calls += 1;
        return state;
      },
    });
    journal.append([{ kind: 'log.scaled' }, { kind: 'log.scaled' }]);
    projection.refresh(journal);
    projection.refresh(journal);
    expect(calls).toBe(2);
  });

  it('does not go quadratic as the journal grows', () => {
    let calls = 0;
    const projection = new Projection('counter', {
      'log.scaled': (state) => {
        calls += 1;
        return state;
      },
    });
    // Written without the per command sync. This test is about how many times
    // the fold runs, not about how fast a disk is, and two hundred fsyncs on a
    // busy machine is slow enough to time the test out and say nothing.
    const fast = openJournal(join(dir, 'fast.jsonl'), { sync: false });
    for (let i = 0; i < 200; i += 1) {
      fast.append([{ kind: 'log.scaled' }]);
      projection.refresh(fast);
    }
    expect(calls).toBe(200);
  });

  it('tracks how far through the journal it has got', () => {
    const projection = new Projection('tally', { 'log.scaled': (state) => state });
    journal.append([{ kind: 'log.scaled' }, { kind: 'log.scaled' }]);
    projection.refresh(journal);
    expect(projection.status()).toMatchObject({ name: 'tally', lastSeq: 2, applied: 2 });
  });

  it('refuses to see the same entry twice', () => {
    const projection = new Projection('tally', { a: (state) => state });
    projection.applyEntry({ seq: 3, kind: 'a' });
    expect(() => projection.applyEntry({ seq: 3, kind: 'a' })).toThrow(ProjectionError);
    expect(() => projection.applyEntry({ seq: 1, kind: 'a' })).toThrow(ProjectionError);
  });

  it('starts over on reset', () => {
    const projection = new Projection('tally', {
      'log.scaled': (state, entry) => state.set(entry.logId, true),
    });
    journal.append([{ kind: 'log.scaled', logId: 'L-1' }]);
    projection.refresh(journal).reset();
    expect(projection.state.size).toBe(0);
    expect(projection.lastSeq).toBe(0);
    projection.refresh(journal);
    expect(projection.state.size).toBe(1);
  });

  it('takes an initial state factory', () => {
    const projection = new Projection('total', { a: (state) => state + 1 }, { initial: () => 0 });
    projection.applyEntry({ seq: 1, kind: 'a' });
    expect(projection.state).toBe(1);
  });

  it('needs a name and a handler map', () => {
    expect(() => new Projection('', {})).toThrow(ProjectionError);
    expect(() => new Projection('a', null)).toThrow(ProjectionError);
  });
});

describe('keyedProjection', () => {
  it('keeps the latest record per key', () => {
    const projection = keyedProjection('tracts', ['tract.saved']);
    journal.append([
      { kind: 'tract.saved', id: 'T-7', record: { name: 'first' } },
      { kind: 'tract.saved', id: 'T-7', record: { name: 'second' } },
    ]);
    projection.refresh(journal);
    expect(projection.state.get('T-7').name).toBe('second');
    expect(projection.state.size).toBe(1);
  });

  it('removes a key when the record is null', () => {
    const projection = keyedProjection('tracts', ['tract.saved', 'tract.removed']);
    journal.append([
      { kind: 'tract.saved', id: 'T-7', record: { name: 'first' } },
      { kind: 'tract.removed', id: 'T-7', record: null },
    ]);
    projection.refresh(journal);
    expect(projection.state.has('T-7')).toBe(false);
  });

  it('can be told where the key lives', () => {
    const projection = keyedProjection('loads', ['load.arrived'], { keyOf: (e) => e.loadId });
    journal.append([{ kind: 'load.arrived', loadId: 'LD-1', record: { truck: 'a' } }]);
    projection.refresh(journal);
    expect(projection.state.has('LD-1')).toBe(true);
  });

  it('refuses an entry with no key', () => {
    const projection = keyedProjection('tracts', ['tract.saved']);
    journal.append([{ kind: 'tract.saved', record: {} }]);
    expect(() => projection.refresh(journal)).toThrow(ProjectionError);
  });
});

describe('countingProjection', () => {
  it('counts by the key it is given', () => {
    const projection = countingProjection('by species', ['log.scaled'], (e) => e.species);
    journal.append([
      { kind: 'log.scaled', species: 'red oak' },
      { kind: 'log.scaled', species: 'red oak' },
      { kind: 'log.scaled', species: 'white oak' },
    ]);
    projection.refresh(journal);
    expect(projection.state.get('red oak')).toBe(2);
    expect(projection.state.get('white oak')).toBe(1);
  });
});
