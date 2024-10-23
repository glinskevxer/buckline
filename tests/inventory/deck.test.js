import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import {
  DeckError,
  daysBetween,
  daysOfInventory,
  deckEntry,
  deckSummary,
  deckVolume,
  markSawn,
  oldest,
  onDeck,
} from '../../src/inventory/deck.js';

function log(id, species, axis) {
  return makeLog({ id, species, axesIn: [axis, axis], measuredLengthFt: 12.25 });
}

const entries = [
  deckEntry(log('L-1', 'red oak', 17.4), '2024-06-01', 200),
  deckEntry(log('L-2', 'red oak', 21.8), '2024-09-15', 320),
  deckEntry(log('L-3', 'white oak', 15.2), '2024-10-01', 140),
  deckEntry(log('L-4', 'white oak', 21.8), '2024-10-10', 300),
];

const asOf = '2024-10-20';

describe('daysBetween', () => {
  it('counts the days', () => {
    expect(daysBetween('2024-10-01', '2024-10-20')).toBe(19);
  });

  it('returns nothing when a date is missing or unreadable', () => {
    expect(daysBetween(null, '2024-10-20')).toBeNull();
    expect(daysBetween('not a date', '2024-10-20')).toBeNull();
  });
});

describe('deckEntry', () => {
  it('carries the species and the size off the log', () => {
    const entry = deckEntry(log('L-9', 'red oak', 17.4), '2024-10-01', 200);
    expect(entry.species).toBe('red oak');
    expect(entry.diameterIn).toBe(16);
    expect(entry.sawnOn).toBeNull();
  });

  it('refuses a log with no arrival date or no scale', () => {
    expect(() => deckEntry(log('L-9', 'red oak', 17.4), null, 200)).toThrow(DeckError);
    expect(() => deckEntry(log('L-9', 'red oak', 17.4), '2024-10-01')).toThrow(DeckError);
  });
});

describe('onDeck', () => {
  it('puts the oldest stick first', () => {
    expect(onDeck(entries, asOf)[0].logId).toBe('L-1');
  });

  it('ages every stick to the date asked for', () => {
    expect(onDeck(entries, asOf).find((entry) => entry.logId === 'L-3').ageDays).toBe(19);
  });

  it('leaves out wood that had not arrived yet', () => {
    expect(onDeck(entries, '2024-09-20').map((entry) => entry.logId)).toEqual(['L-1', 'L-2']);
  });

  it('leaves out wood that was already sawn', () => {
    const after = markSawn(entries, ['L-1'], '2024-10-05');
    expect(onDeck(after, asOf).map((entry) => entry.logId)).not.toContain('L-1');
  });

  it('still shows wood sawn after the date asked for', () => {
    const after = markSawn(entries, ['L-1'], '2024-11-01');
    expect(onDeck(after, asOf).map((entry) => entry.logId)).toContain('L-1');
  });
});

describe('deckSummary', () => {
  it('totals by whatever key it is given', () => {
    const rows = deckSummary(entries, asOf, (entry) => entry.species);
    expect(rows.map((row) => row.key).sort()).toEqual(['red oak', 'white oak']);
  });

  it('puts the biggest bucket first', () => {
    const rows = deckSummary(entries, asOf, (entry) => entry.species);
    expect(rows[0].netBoardFeet).toBeGreaterThanOrEqual(rows.at(-1).netBoardFeet);
  });

  it('averages the age inside a bucket', () => {
    const rows = deckSummary(entries, asOf, (entry) => entry.species);
    const oak = rows.find((row) => row.key === 'red oak');
    expect(oak.averageAgeDays).toBeGreaterThan(50);
  });

  it('can be asked for a different breakdown entirely', () => {
    const rows = deckSummary(entries, asOf, (entry) => String(entry.diameterIn));
    expect(rows.length).toBeGreaterThan(1);
  });
});

describe('oldest', () => {
  it('finds the wood that has been there too long', () => {
    expect(oldest(entries, asOf).map((entry) => entry.logId)).toEqual(['L-1']);
  });

  it('takes a different threshold', () => {
    expect(oldest(entries, asOf, { olderThanDays: 10 })).toHaveLength(4);
  });

  it('caps the list', () => {
    expect(oldest(entries, asOf, { olderThanDays: 0, limit: 2 })).toHaveLength(2);
  });
});

describe('deckVolume and daysOfInventory', () => {
  it('totals what is standing', () => {
    expect(deckVolume(entries, asOf)).toBe(960);
  });

  it('works out how long it would last', () => {
    expect(daysOfInventory(entries, asOf, 120)).toBe(8);
  });

  it('refuses a cut rate of nothing', () => {
    expect(() => daysOfInventory(entries, asOf, 0)).toThrow(DeckError);
  });
});

describe('markSawn', () => {
  it('marks the logs without touching the original list', () => {
    const after = markSawn(entries, ['L-1', 'L-2'], '2024-10-15');
    expect(after.filter((entry) => entry.sawnOn)).toHaveLength(2);
    expect(entries.every((entry) => entry.sawnOn === null)).toBe(true);
  });

  it('complains about a log that is not on the deck', () => {
    let caught;
    try {
      markSawn(entries, ['L-99'], '2024-10-15');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DeckError);
    expect(caught.details.missing).toEqual(['L-99']);
  });
});
