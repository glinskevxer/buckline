import { describe, expect, it } from 'vitest';
import { byDescending, byOrder, countBy, groupBy, summarize } from '../src/collect.js';

const rows = [
  { species: 'red oak', feet: 100, pieces: 2 },
  { species: 'white oak', feet: 50, pieces: 1 },
  { species: 'red oak', feet: 25, pieces: 1 },
  { species: 'ash', feet: 50, pieces: 3 },
];

describe('groupBy', () => {
  it('buckets by the key', () => {
    const grouped = groupBy(rows, (row) => row.species);
    expect(grouped.get('red oak')).toHaveLength(2);
    expect(grouped.size).toBe(3);
  });

  it('keeps the arrival order inside a bucket', () => {
    const grouped = groupBy(rows, (row) => row.species);
    expect(grouped.get('red oak').map((row) => row.feet)).toEqual([100, 25]);
  });

  it('groups nothing into nothing', () => {
    expect(groupBy([], (row) => row.species).size).toBe(0);
  });
});

describe('countBy', () => {
  it('counts by the key', () => {
    const counts = countBy(rows, (row) => row.species);
    expect(counts.get('red oak')).toBe(2);
    expect(counts.get('ash')).toBe(1);
  });
});

describe('summarize', () => {
  it('totals the named fields and counts the rows', () => {
    const buckets = summarize(rows, (row) => row.species, {
      feet: (row) => row.feet,
      pieces: (row) => row.pieces,
    });
    const oak = buckets.find((bucket) => bucket.key === 'red oak');
    expect(oak).toEqual({ key: 'red oak', count: 2, feet: 125, pieces: 3 });
  });

  it('treats a missing field as zero', () => {
    const buckets = summarize([{ species: 'ash' }], (row) => row.species, {
      feet: (row) => row.feet,
    });
    expect(buckets[0].feet).toBe(0);
  });

  it('returns the buckets in first seen order', () => {
    const buckets = summarize(rows, (row) => row.species, { feet: (row) => row.feet });
    expect(buckets.map((bucket) => bucket.key)).toEqual(['red oak', 'white oak', 'ash']);
  });
});

describe('byOrder', () => {
  it('puts rows in the order given', () => {
    const sorted = [{ key: 'b' }, { key: 'a' }, { key: 'c' }].sort(byOrder(['c', 'a', 'b']));
    expect(sorted.map((row) => row.key)).toEqual(['c', 'a', 'b']);
  });

  it('drops anything not in the order to the end alphabetically', () => {
    const sorted = [{ key: 'z' }, { key: 'a' }, { key: 'm' }].sort(byOrder(['a']));
    expect(sorted.map((row) => row.key)).toEqual(['a', 'm', 'z']);
  });

  it('can be told where the key lives', () => {
    const sorted = [{ grade: 'b' }, { grade: 'a' }].sort(byOrder(['b', 'a'], (row) => row.grade));
    expect(sorted.map((row) => row.grade)).toEqual(['b', 'a']);
  });
});

describe('byDescending', () => {
  it('puts the biggest first', () => {
    const sorted = [
      { key: 'a', n: 1 },
      { key: 'b', n: 3 },
    ].sort(byDescending('n'));
    expect(sorted.map((row) => row.key)).toEqual(['b', 'a']);
  });

  it('breaks a tie on the key so the order is stable across modules', () => {
    const sorted = [
      { key: 'b', n: 1 },
      { key: 'a', n: 1 },
    ].sort(byDescending('n'));
    expect(sorted.map((row) => row.key)).toEqual(['a', 'b']);
  });
});
