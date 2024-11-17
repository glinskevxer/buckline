/**
 * The market index series.
 *
 * A sliding scale reads a published index, and the index is published weekly
 * on a Friday. A load scaled on a Tuesday reads the index that was in force on
 * that Tuesday, which is the previous Friday's, and not the one published
 * three days later even though that one is now on the desk.
 *
 * Reading forward is the mistake that gets made, because by the time anybody
 * settles the load the later figure exists and looks more current. It is not
 * more current for that load. The whole point of a published index is that
 * both parties could have known it at the time.
 */

import { round2, round4 } from '../num.js';
import { PriceError } from './list.js';

/** Builds a series from dated readings, earliest first. */
export function makeSeries(name, readings) {
  if (!name) {
    throw new PriceError('a series needs a name', { path: 'name' });
  }
  if (!Array.isArray(readings) || readings.length === 0) {
    throw new PriceError('a series needs at least one reading', { path: 'readings' });
  }

  const sorted = [...readings]
    .map((reading, index) => {
      if (!reading.on || !(reading.value > 0)) {
        throw new PriceError(`reading ${index} needs a date and a value`, { path: 'readings' });
      }
      return { on: reading.on, value: reading.value };
    })
    .sort((a, b) => a.on.localeCompare(b.on));

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].on === sorted[i - 1].on) {
      throw new PriceError(`the series has two readings for ${sorted[i].on}`, { path: 'readings' });
    }
  }

  return { name, readings: sorted, from: sorted[0].on, to: sorted.at(-1).on };
}

/**
 * The reading in force on a date: the latest one published on or before it.
 * Never the next one, however close it is.
 */
export function readingOn(series, isoDate) {
  let found = null;
  for (const reading of series.readings) {
    if (reading.on <= isoDate) {
      found = reading;
    } else {
      break;
    }
  }
  if (!found) {
    throw new PriceError(
      `${series.name} has nothing published on or before ${isoDate}, it starts at ${series.from}`,
      { path: 'date' }
    );
  }
  return { ...found, staleDays: dayGap(found.on, isoDate) };
}

/** The value in force on a date. */
export function valueOn(series, isoDate) {
  return readingOn(series, isoDate).value;
}

/**
 * How much the index moved between two dates, as read at the time. The
 * difference between this and reading today's figure twice is the whole
 * argument about backdated settlements.
 */
export function moveBetween(series, fromDate, toDate) {
  const start = readingOn(series, fromDate);
  const end = readingOn(series, toDate);
  return {
    from: start,
    to: end,
    change: round2(end.value - start.value),
    share: round4((end.value - start.value) / start.value),
    direction: end.value === start.value ? 'flat' : end.value > start.value ? 'up' : 'down',
  };
}

/**
 * A rolling average over a window of days, read as of a date. Some contracts
 * slide on an average rather than a spot reading, because a spot reading makes
 * the settlement depend on which day the truck happened to arrive.
 */
export function averageOver(series, isoDate, days) {
  if (!(days > 0)) {
    throw new PriceError('an average needs a window', { path: 'days' });
  }
  const cutoff = shiftDays(isoDate, -days);
  const inWindow = series.readings.filter(
    (reading) => reading.on <= isoDate && reading.on > cutoff
  );
  if (inWindow.length === 0) {
    throw new PriceError(`${series.name} has nothing in the ${days} days to ${isoDate}`, {
      path: 'date',
    });
  }
  const mean = inWindow.reduce((total, reading) => total + reading.value, 0) / inWindow.length;
  return {
    readings: inWindow.length,
    from: inWindow[0].on,
    to: inWindow.at(-1).on,
    average: round2(mean),
  };
}

/** True when the last reading is too old to settle against. */
export function seriesIsStale(series, isoDate, options = {}) {
  const { days = 21 } = options;
  return dayGap(series.to, isoDate) > days;
}

function dayGap(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function shiftDays(isoDate, days) {
  return new Date(Date.parse(isoDate) + days * 86400000).toISOString().slice(0, 10);
}
