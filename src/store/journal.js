/**
 * The journal.
 *
 * Everything the yard does is written as an entry on the end of a file and
 * nothing is ever edited in place. A scale that was wrong is corrected by
 * writing the correction, not by changing the scale, because the settlement
 * clerk has to be able to show a buyer what was on the ticket in March and
 * what changed since.
 *
 * The file is one JSON object per line. That format was chosen because it can
 * be read by anything, it can be appended to without reading it first, and a
 * line that gets truncated by a power cut damages exactly one entry rather
 * than the whole file.
 *
 * The sync is per command, not per entry. A machine that dies partway through
 * writing five entries should lose all five, because a command that half
 * happened is worse than one that did not happen.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { BucklineError } from '../errors.js';

export class JournalError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'JOURNAL', ...options });
    this.name = 'JournalError';
  }
}

export class Journal {
  constructor(path, options = {}) {
    this.path = path;
    this.sync = options.sync !== false;
    this.sequence = 0;
    this.entries = [];
    this.load();
  }

  /** Reads the file back into memory. A missing file is an empty journal. */
  load() {
    this.entries = [];
    this.sequence = 0;
    if (!existsSync(this.path)) return;

    const text = readFileSync(this.path, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed === '') return;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        if (index === lines.length - 1 || lines.slice(index + 1).every((l) => l.trim() === '')) {
          return;
        }
        throw new JournalError(`line ${index + 1} of ${this.path} is not readable`, {
          path: this.path,
          cause: error,
        });
      }
      if (typeof parsed.seq !== 'number') {
        throw new JournalError(`line ${index + 1} of ${this.path} has no sequence number`, {
          path: this.path,
        });
      }
      if (parsed.seq !== this.sequence + 1) {
        throw new JournalError(
          `sequence jumped from ${this.sequence} to ${parsed.seq} at line ${index + 1}`,
          { path: this.path }
        );
      }
      this.sequence = parsed.seq;
      this.entries.push(parsed);
    });
  }

  /**
   * Appends one command's worth of entries and syncs once at the end.
   * Returns the entries as written, with their sequence numbers.
   */
  append(records, options = {}) {
    const { at = new Date().toISOString(), actor = null } = options;
    if (!Array.isArray(records) || records.length === 0) {
      throw new JournalError('append wants at least one record', { path: 'records' });
    }
    for (const record of records) {
      if (typeof record.kind !== 'string' || record.kind.trim() === '') {
        throw new JournalError('every journal record needs a kind', { path: 'records' });
      }
    }

    const written = records.map((record, index) => ({
      seq: this.sequence + index + 1,
      at,
      actor,
      ...record,
    }));

    mkdirSync(dirname(this.path), { recursive: true });
    const fd = openSync(this.path, 'a');
    try {
      writeSync(fd, written.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
      if (this.sync) fsyncSync(fd);
    } finally {
      closeSync(fd);
    }

    this.sequence += written.length;
    this.entries.push(...written);
    return written;
  }

  /** Every entry, oldest first. */
  all() {
    return this.entries.slice();
  }

  /** Entries after a sequence number, for an incremental read. */
  since(seq) {
    return this.entries.filter((entry) => entry.seq > seq);
  }

  /** Entries of one kind, oldest first. */
  ofKind(kind) {
    return this.entries.filter((entry) => entry.kind === kind);
  }

  get length() {
    return this.entries.length;
  }
}

/** Opens a journal at a path. */
export function openJournal(path, options = {}) {
  return new Journal(path, options);
}
