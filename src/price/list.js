/**
 * Price lists.
 *
 * A price is quoted per thousand board feet against a species, a grade and a
 * thickness, and the list is never complete. Nobody publishes a price for
 * every combination the mill can produce, so a lookup has to fall back, and
 * the order it falls back in is a commercial decision rather than a
 * convenience.
 *
 * The order here is exact match, then the same species and grade at any
 * thickness, then the species base price with a grade multiplier. It never
 * falls back across species, because red oak and hard maple are not
 * substitutes at any price and a settlement built on that substitution would
 * be wrong in a way nobody would notice until the cheque bounced.
 *
 * Lists carry effective dates. A load is priced on the list that was in force
 * when it was scaled, not on today's, which is the whole reason the scale date
 * is on the ticket.
 */

import { BucklineError } from '../errors.js';
import { normalizeSpecies } from '../model/species.js';
import { round2 } from '../num.js';

export class PriceError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'PRICE', ...options });
    this.name = 'PriceError';
  }
}

/** Grade multipliers used when only a species base price is known. */
export const GRADE_MULTIPLIER = {
  FAS: 1,
  F1F: 0.9,
  SEL: 0.78,
  '1C': 0.55,
  '2AC': 0.32,
  '3AC': 0.18,
  veneer: 2.4,
  SS: 0.7,
  No1: 0.6,
  No2: 0.5,
  No3: 0.35,
  pulpwood: 0.05,
};

/**
 * Builds a price list. `rows` are exact quotes; `base` is a per species price
 * that the grade multiplier is applied to when no quote matches.
 */
export function makePriceList(spec) {
  const { id, effectiveFrom, effectiveTo = null, market = 'green', rows = [], base = {} } = spec;
  if (!id) {
    throw new PriceError('a price list needs an identifier', { path: 'id' });
  }
  if (!effectiveFrom) {
    throw new PriceError('a price list needs an effective date', { path: 'effectiveFrom' });
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new PriceError('a price list cannot end before it starts', { path: 'effectiveTo' });
  }

  const quotes = new Map();
  for (const row of rows) {
    if (!(row.perMbf > 0)) {
      throw new PriceError(`quote for ${row.species} ${row.grade} has no price`, { path: 'rows' });
    }
    quotes.set(quoteKey(row.species, row.grade, row.quarters ?? null), row.perMbf);
  }

  const baseBySpecies = new Map();
  for (const [species, perMbf] of Object.entries(base)) {
    if (!(perMbf > 0)) {
      throw new PriceError(`base price for ${species} is not a price`, { path: 'base' });
    }
    baseBySpecies.set(normalizeSpecies(species), perMbf);
  }

  return { id, effectiveFrom, effectiveTo, market, quotes, baseBySpecies };
}

function quoteKey(species, grade, quarters) {
  return `${normalizeSpecies(species)}|${grade}|${quarters ?? 'any'}`;
}

/** True when the list was in force on a date. */
export function inForceOn(list, isoDate) {
  if (isoDate < list.effectiveFrom) return false;
  if (list.effectiveTo && isoDate > list.effectiveTo) return false;
  return true;
}

/** Picks the list that was in force on a date, latest effective first. */
export function listOn(lists, isoDate) {
  const candidates = lists
    .filter((list) => inForceOn(list, isoDate))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  if (candidates.length === 0) {
    throw new PriceError(`no price list was in force on ${isoDate}`, { path: 'date' });
  }
  return candidates[0];
}

/**
 * The price per thousand board feet, with the route it was found by. A caller
 * that needs to defend a settlement needs to know whether the number came off
 * a quote or a multiplier.
 */
export function priceFor(list, species, grade, options = {}) {
  const { quarters = null } = options;
  const key = normalizeSpecies(species);

  const exact = list.quotes.get(quoteKey(key, grade, quarters));
  if (exact !== undefined) {
    return { perMbf: exact, route: 'quoted at this thickness', species: key, grade };
  }

  const anyThickness = list.quotes.get(quoteKey(key, grade, null));
  if (anyThickness !== undefined) {
    return { perMbf: anyThickness, route: 'quoted at any thickness', species: key, grade };
  }

  const base = list.baseBySpecies.get(key);
  if (base !== undefined) {
    const multiplier = GRADE_MULTIPLIER[grade];
    if (multiplier === undefined) {
      throw new PriceError(`no grade multiplier for ${grade}`, { path: 'grade' });
    }
    return {
      perMbf: round2(base * multiplier),
      route: `species base times the ${grade} multiplier`,
      species: key,
      grade,
    };
  }

  throw new PriceError(`no price for ${key} at ${grade} on list ${list.id}`, { path: 'price' });
}

/** The value of a quantity of board feet at a price. */
export function valueOf(boardFeet, perMbf) {
  if (boardFeet < 0) {
    throw new PriceError('board feet must not be negative', { path: 'boardFeet' });
  }
  return round2((boardFeet / 1000) * perMbf);
}
