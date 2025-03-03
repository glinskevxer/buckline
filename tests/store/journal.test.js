import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CURRENT_VERSION } from '../../src/store/migrate.js';
import { Journal, JournalError, openJournal } from '../../src/store/journal.js';

let dir;
let path;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-'));
  path = join(dir, 'nested', 'journal.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('append', () => {
  it('creates the file and the directory under it', () => {
    const journal = openJournal(path);
    journal.append([{ kind: 'tract.opened', tractId: 'T-7' }]);
    expect(readFileSync(path, 'utf8')).toContain('tract.opened');
  });

  it('numbers entries from one', () => {
    const journal = openJournal(path);
    const written = journal.append([{ kind: 'a' }, { kind: 'b' }]);
    expect(written.map((entry) => entry.seq)).toEqual([1, 2]);
  });

  it('carries on numbering across calls', () => {
    const journal = openJournal(path);
    journal.append([{ kind: 'a' }]);
    expect(journal.append([{ kind: 'b' }])[0].seq).toBe(2);
  });

  it('stamps a time and an actor', () => {
    const journal = openJournal(path);
    const written = journal.append([{ kind: 'a' }], { at: '2024-04-01T09:00:00Z', actor: 'dr' });
    expect(written[0].at).toBe('2024-04-01T09:00:00Z');
    expect(written[0].actor).toBe('dr');
  });

  it('writes one line per entry', () => {
    const journal = openJournal(path);
    journal.append([{ kind: 'a' }, { kind: 'b' }, { kind: 'c' }]);
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
  });

  it('refuses an empty append', () => {
    const journal = openJournal(path);
    expect(() => journal.append([])).toThrow(JournalError);
  });

  it('refuses a record with no kind', () => {
    const journal = openJournal(path);
    expect(() => journal.append([{ tractId: 'T-7' }])).toThrow(JournalError);
    expect(() => journal.append([{ kind: '  ' }])).toThrow(JournalError);
  });

  it('writes nothing when one record in the batch is bad', () => {
    const journal = openJournal(path);
    expect(() => journal.append([{ kind: 'a' }, { noKind: true }])).toThrow(JournalError);
    expect(journal.length).toBe(0);
  });
});

describe('load', () => {
  it('reads back what was written', () => {
    const first = openJournal(path);
    first.append([
      { kind: 'tract.opened', tractId: 'T-7' },
      { kind: 'load.arrived', loadId: 'LD-1' },
    ]);

    const second = openJournal(path);
    expect(second.length).toBe(2);
    expect(second.all()[1].loadId).toBe('LD-1');
    expect(second.sequence).toBe(2);
  });

  it('treats a missing file as an empty journal', () => {
    expect(openJournal(path).length).toBe(0);
  });

  it('ignores a trailing partial line from a power cut', () => {
    const journal = openJournal(path);
    journal.append([{ kind: 'a' }]);
    appendFileSync(path, '{"seq":2,"kind":"b"');
    expect(openJournal(path).length).toBe(1);
  });

  it('refuses a file with a hole in the middle of it', () => {
    const journal = openJournal(path);
    journal.append([{ kind: 'a' }]);
    appendFileSync(path, 'not json at all\n{"seq":2,"kind":"b"}\n');
    expect(() => openJournal(path)).toThrow(JournalError);
  });

  it('refuses a sequence that jumps', () => {
    writeFileSync(path.replace('nested/', ''), '');
    const flat = join(dir, 'flat.jsonl');
    writeFileSync(flat, '{"seq":1,"kind":"a"}\n{"seq":5,"kind":"b"}\n');
    expect(() => openJournal(flat)).toThrow(JournalError);
  });

  it('refuses an entry with no sequence number', () => {
    const flat = join(dir, 'flat.jsonl');
    writeFileSync(flat, '{"kind":"a"}\n');
    expect(() => openJournal(flat)).toThrow(JournalError);
  });

  it('skips blank lines', () => {
    const flat = join(dir, 'flat.jsonl');
    writeFileSync(flat, '{"seq":1,"kind":"a"}\n\n{"seq":2,"kind":"b"}\n\n');
    expect(openJournal(flat).length).toBe(2);
  });
});

describe('reading', () => {
  it('returns a copy of the entries', () => {
    const journal = openJournal(path);
    journal.append([{ kind: 'a' }]);
    journal.all().pop();
    expect(journal.length).toBe(1);
  });

  it('reads only what is new since a sequence number', () => {
    const journal = openJournal(path);
    journal.append([{ kind: 'a' }, { kind: 'b' }, { kind: 'c' }]);
    expect(journal.since(1).map((entry) => entry.kind)).toEqual(['b', 'c']);
    expect(journal.since(3)).toEqual([]);
  });

  it('filters by kind', () => {
    const journal = openJournal(path);
    journal.append([{ kind: 'a' }, { kind: 'b' }, { kind: 'a' }]);
    expect(journal.ofKind('a')).toHaveLength(2);
  });

  it('is a Journal', () => {
    expect(openJournal(path)).toBeInstanceOf(Journal);
  });
});

describe('versions', () => {
  it('stamps the current version on everything it writes', () => {
    const journal = openJournal(path);
    expect(journal.append([{ kind: 'a' }])[0].version).toBe(CURRENT_VERSION);
  });

  it('lets a record set its own version, which the migration tests need', () => {
    const journal = openJournal(path);
    expect(journal.append([{ kind: 'a', version: 2 }])[0].version).toBe(2);
  });

  it('migrates an old entry on the way out of the file', () => {
    const flat = join(dir, 'old.jsonl');
    writeFileSync(flat, '{"seq":1,"kind":"tract.saved","id":"T-7"}\n');
    const journal = openJournal(flat);
    expect(journal.all()[0].version).toBe(CURRENT_VERSION);
    expect(journal.all()[0].actor).toBe('scale house');
  });

  it('leaves the file itself alone', () => {
    const flat = join(dir, 'old.jsonl');
    const original = '{"seq":1,"kind":"tract.saved","id":"T-7"}\n';
    writeFileSync(flat, original);
    openJournal(flat);
    expect(readFileSync(flat, 'utf8')).toBe(original);
  });

  it('can be told not to migrate at all', () => {
    const flat = join(dir, 'old.jsonl');
    writeFileSync(flat, '{"seq":1,"kind":"tract.saved","id":"T-7"}\n');
    expect(openJournal(flat, { migrate: false }).all()[0].actor).toBeUndefined();
  });

  it('counts what the file holds by version', () => {
    const flat = join(dir, 'mixed.jsonl');
    writeFileSync(
      flat,
      '{"seq":1,"kind":"tract.saved","id":"T-7"}\n{"seq":2,"version":3,"kind":"tract.saved","id":"T-8"}\n'
    );
    expect(openJournal(flat).census()).toEqual([
      { version: 1, count: 1, current: false },
      { version: 3, count: 1, current: true },
    ]);
  });
});
