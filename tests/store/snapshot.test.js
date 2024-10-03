import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal } from '../../src/store/journal.js';
import { keyedProjection } from '../../src/store/projection.js';
import {
  SNAPSHOT_FORMAT,
  SnapshotError,
  hydrate,
  readSnapshot,
  restore,
  serialise,
  writeSnapshot,
} from '../../src/store/snapshot.js';

let dir;
let journal;
let path;

function tracts() {
  return keyedProjection('tracts', ['tract.saved']);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-snap-'));
  journal = openJournal(join(dir, 'journal.jsonl'));
  path = join(dir, 'snapshots', 'tracts.json');
  journal.append([
    { kind: 'tract.saved', id: 'T-1', record: { name: 'one' } },
    { kind: 'tract.saved', id: 'T-2', record: { name: 'two' } },
  ]);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('serialise and restore', () => {
  it('round trips a keyed projection', () => {
    const first = tracts().refresh(journal);
    const second = restore(tracts(), serialise(first));
    expect(second.state.get('T-1')).toEqual({ name: 'one' });
    expect(second.lastSeq).toBe(first.lastSeq);
  });

  it('refuses a snapshot for another projection', () => {
    const snapshot = serialise(tracts().refresh(journal));
    expect(() => restore(keyedProjection('loads', ['x']), snapshot)).toThrow(SnapshotError);
  });

  it('refuses a snapshot from another format', () => {
    const snapshot = { ...serialise(tracts().refresh(journal)), format: 1 };
    expect(() => restore(tracts(), snapshot)).toThrow(SnapshotError);
  });

  it('records the format it was written in', () => {
    expect(serialise(tracts()).format).toBe(SNAPSHOT_FORMAT);
  });
});

describe('writeSnapshot and readSnapshot', () => {
  it('writes and reads back', () => {
    writeSnapshot(path, tracts().refresh(journal));
    expect(readSnapshot(path).lastSeq).toBe(2);
  });

  it('makes the directory', () => {
    expect(writeSnapshot(path, tracts())).toBe(path);
  });

  it('reads nothing from a missing file', () => {
    expect(readSnapshot(join(dir, 'nope.json'))).toBeNull();
  });

  it('reads nothing from a file that will not parse', () => {
    writeFileSync(join(dir, 'bad.json'), '{');
    expect(readSnapshot(join(dir, 'bad.json'))).toBeNull();
  });

  it('reads nothing from an older format', () => {
    writeFileSync(join(dir, 'old.json'), JSON.stringify({ format: 1, name: 'tracts' }));
    expect(readSnapshot(join(dir, 'old.json'))).toBeNull();
  });
});

describe('hydrate', () => {
  it('folds the whole journal when there is no snapshot', () => {
    const projection = tracts();
    const how = hydrate(projection, journal, path);
    expect(how.from).toBe('journal');
    expect(projection.state.size).toBe(2);
  });

  it('folds only what came after the snapshot', () => {
    writeSnapshot(path, tracts().refresh(journal));
    journal.append([{ kind: 'tract.saved', id: 'T-3', record: { name: 'three' } }]);

    const projection = tracts();
    const how = hydrate(projection, journal, path);
    expect(how.from).toBe('snapshot');
    expect(how.foldedFrom).toBe(2);
    expect(how.foldedTo).toBe(3);
    expect(projection.state.size).toBe(3);
  });

  it('reaches the same answer with a snapshot as without one', () => {
    writeSnapshot(path, tracts().refresh(journal));
    journal.append([{ kind: 'tract.saved', id: 'T-1', record: { name: 'one again' } }]);

    const withSnapshot = tracts();
    hydrate(withSnapshot, journal, path);
    const withoutSnapshot = tracts().refresh(journal);

    expect([...withSnapshot.state.entries()].sort()).toEqual(
      [...withoutSnapshot.state.entries()].sort()
    );
  });

  it('is a cache, so deleting it changes no answer', () => {
    writeSnapshot(path, tracts().refresh(journal));
    const cached = tracts();
    hydrate(cached, journal, path);
    rmSync(path);
    const fresh = tracts();
    hydrate(fresh, journal, path);
    expect(fresh.state).toEqual(cached.state);
  });

  it('starts over when the snapshot ran ahead of the journal', () => {
    const ahead = tracts().refresh(journal);
    ahead.lastSeq = 99;
    writeSnapshot(path, ahead);

    const projection = tracts();
    const how = hydrate(projection, journal, path);
    expect(how.from).toBe('journal');
    expect(how.reason).toContain('ran ahead');
    expect(projection.state.size).toBe(2);
  });

  it('ignores a snapshot written for a different projection', () => {
    writeSnapshot(path, keyedProjection('loads', ['load.received']).refresh(journal));
    const projection = tracts();
    expect(hydrate(projection, journal, path).from).toBe('journal');
  });
});
