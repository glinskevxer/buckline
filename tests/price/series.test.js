import { describe, expect, it } from 'vitest';
import { PriceError } from '../../src/price/list.js';
import {
  averageOver,
  makeSeries,
  moveBetween,
  readingOn,
  seriesIsStale,
  valueOn,
} from '../../src/price/series.js';

const series = makeSeries('hardwood index', [
  { on: '2024-10-04', value: 104 },
  { on: '2024-10-11', value: 108 },
  { on: '2024-10-18', value: 112 },
  { on: '2024-10-25', value: 109 },
]);

describe('makeSeries', () => {
  it('sorts the readings and records the range', () => {
    const out = makeSeries('x', [
      { on: '2024-02-01', value: 2 },
      { on: '2024-01-01', value: 1 },
    ]);
    expect(out.from).toBe('2024-01-01');
    expect(out.to).toBe('2024-02-01');
  });

  it('refuses a series with no name or no readings', () => {
    expect(() => makeSeries('', [{ on: '2024-01-01', value: 1 }])).toThrow(PriceError);
    expect(() => makeSeries('x', [])).toThrow(PriceError);
  });

  it('refuses a reading with no date or no value', () => {
    expect(() => makeSeries('x', [{ value: 1 }])).toThrow(PriceError);
    expect(() => makeSeries('x', [{ on: '2024-01-01' }])).toThrow(PriceError);
  });

  it('refuses two readings for the same day', () => {
    expect(() =>
      makeSeries('x', [
        { on: '2024-01-01', value: 1 },
        { on: '2024-01-01', value: 2 },
      ])
    ).toThrow(PriceError);
  });
});

describe('readingOn', () => {
  it('takes the reading published on the day', () => {
    expect(readingOn(series, '2024-10-11').value).toBe(108);
  });

  it('takes the last one published before the day', () => {
    expect(readingOn(series, '2024-10-15').value).toBe(108);
  });

  it('never reads forward to a figure published later', () => {
    expect(readingOn(series, '2024-10-17').value).not.toBe(112);
  });

  it('says how stale the reading was', () => {
    expect(readingOn(series, '2024-10-15').staleDays).toBe(4);
    expect(readingOn(series, '2024-10-11').staleDays).toBe(0);
  });

  it('reads the last figure for any later date', () => {
    expect(valueOn(series, '2025-01-01')).toBe(109);
  });

  it('refuses a date before the series starts', () => {
    expect(() => readingOn(series, '2024-09-01')).toThrow(PriceError);
  });
});

describe('moveBetween', () => {
  it('reads both ends as they stood at the time', () => {
    const move = moveBetween(series, '2024-10-05', '2024-10-19');
    expect(move.from.value).toBe(104);
    expect(move.to.value).toBe(112);
    expect(move.change).toBe(8);
    expect(move.direction).toBe('up');
  });

  it('reports a fall', () => {
    expect(moveBetween(series, '2024-10-18', '2024-10-25').direction).toBe('down');
  });

  it('reports a flat week', () => {
    expect(moveBetween(series, '2024-10-11', '2024-10-13').direction).toBe('flat');
  });

  it('reports the move as a share', () => {
    expect(moveBetween(series, '2024-10-04', '2024-10-18').share).toBeCloseTo(8 / 104, 4);
  });
});

describe('averageOver', () => {
  it('averages the readings inside the window', () => {
    const result = averageOver(series, '2024-10-25', 21);
    expect(result.readings).toBe(3);
    expect(result.average).toBeCloseTo((108 + 112 + 109) / 3, 2);
  });

  it('takes a longer window in', () => {
    expect(averageOver(series, '2024-10-25', 60).readings).toBe(4);
  });

  it('never reads forward', () => {
    expect(averageOver(series, '2024-10-12', 60).to).toBe('2024-10-11');
  });

  it('refuses a window with nothing in it', () => {
    expect(() => averageOver(series, '2025-06-01', 7)).toThrow(PriceError);
  });

  it('refuses a window of no days', () => {
    expect(() => averageOver(series, '2024-10-25', 0)).toThrow(PriceError);
  });
});

describe('seriesIsStale', () => {
  it('is fresh a week after the last reading', () => {
    expect(seriesIsStale(series, '2024-11-01')).toBe(false);
  });

  it('is stale a couple of months later', () => {
    expect(seriesIsStale(series, '2024-12-25')).toBe(true);
  });

  it('takes a tighter window', () => {
    expect(seriesIsStale(series, '2024-11-01', { days: 3 })).toBe(true);
  });
});
