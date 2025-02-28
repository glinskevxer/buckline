import { describe, expect, it } from 'vitest';
import {
  CURRENT_VERSION,
  MigrationError,
  migrate,
  migrateAll,
  stamp,
  versionCensus,
  versionOf,
} from '../../src/store/migrate.js';

const oldest = { seq: 1, kind: 'tract.saved', id: 'T-7', record: { name: 'one' } };
const second = {
  seq: 2,
  version: 2,
  kind: 'load.scaled',
  loadId: 'LD-1',
  scale: { netBoardFeet: 400 },
};
const current = { seq: 3, version: CURRENT_VERSION, kind: 'load.received', loadId: 'LD-2' };

describe('versionOf', () => {
  it('reads an unversioned entry as version one', () => {
    expect(versionOf(oldest)).toBe(1);
  });

  it('reads the version an entry carries', () => {
    expect(versionOf(second)).toBe(2);
  });

  it('refuses a version that is not a whole number above zero', () => {
    expect(() => versionOf({ seq: 1, version: 0 })).toThrow(MigrationError);
    expect(() => versionOf({ seq: 1, version: 1.5 })).toThrow(MigrationError);
  });
});

describe('migrate', () => {
  it('brings the oldest shape all the way up', () => {
    const result = migrate(oldest);
    expect(result.version).toBe(CURRENT_VERSION);
  });

  it('fills the actor that version two introduced', () => {
    expect(migrate(oldest).actor).toBe('scale house');
  });

  it('keeps an actor that was already there', () => {
    expect(migrate({ ...oldest, actor: 'dr' }).actor).toBe('dr');
  });

  it('renames the ticket field that version three renamed', () => {
    const result = migrate(second);
    expect(result.ticket).toEqual({ netBoardFeet: 400 });
    expect(result.scale).toBeUndefined();
  });

  it('leaves an entry of another kind alone through that migration', () => {
    const other = { seq: 2, version: 2, kind: 'tract.saved', id: 'T-7' };
    expect(migrate(other).id).toBe('T-7');
  });

  it('leaves a current entry unchanged apart from being the same object shape', () => {
    expect(migrate(current)).toEqual(current);
  });

  it('never edits the entry it was given', () => {
    const copy = { ...second };
    migrate(second);
    expect(second).toEqual(copy);
  });

  it('refuses an entry from a version this program does not know', () => {
    let caught;
    try {
      migrate({ seq: 9, version: 99, kind: 'x' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MigrationError);
    expect(caught.details.version).toBe(99);
  });

  it('can be asked to stop partway', () => {
    expect(migrate(oldest, { to: 2 }).version).toBe(2);
  });
});

describe('migrateAll', () => {
  it('brings a whole journal up in order', () => {
    const result = migrateAll([oldest, second, current]);
    expect(result.map((entry) => entry.seq)).toEqual([1, 2, 3]);
    expect(result.every((entry) => entry.version === CURRENT_VERSION)).toBe(true);
  });

  it('migrates nothing out of nothing', () => {
    expect(migrateAll([])).toEqual([]);
  });
});

describe('versionCensus', () => {
  it('counts the journal by the version it was written under', () => {
    const rows = versionCensus([oldest, oldest, second, current]);
    expect(rows).toEqual([
      { version: 1, count: 2, current: false },
      { version: 2, count: 1, current: false },
      { version: 3, count: 1, current: true },
    ]);
  });

  it('says which version is the current one', () => {
    expect(versionCensus([current])[0].current).toBe(true);
  });

  it('counts nothing in an empty journal', () => {
    expect(versionCensus([])).toEqual([]);
  });
});

describe('stamp', () => {
  it('puts the current version on an entry being written', () => {
    expect(stamp({ kind: 'tract.saved' }).version).toBe(CURRENT_VERSION);
  });

  it('overwrites a stale version rather than trusting it', () => {
    expect(stamp({ kind: 'x', version: 1 }).version).toBe(CURRENT_VERSION);
  });
});
