/**
 * Discounts and rebates.
 *
 * A mill sells the same lumber at four different prices to four customers and
 * every one of them thinks they are on the list. Three things move the price
 * off the list and they behave differently, which is why they cannot be one
 * number.
 *
 * A discount comes off the invoice now and the customer sees it. A rebate is
 * paid at the end of a period against volume they have not bought yet, so it
 * is a liability the moment the first load ships and it does not appear on any
 * invoice. A freight allowance is neither: it is the mill paying part of the
 * haul, and whether it is a price cut or a cost depends on who booked the
 * truck.
 *
 * Bands are read on the volume in the period rather than on the load, and they
 * are not marginal: crossing a band reprices everything, which is what makes a
 * customer order one more package at the end of a quarter.
 */

import { round2, round4 } from '../num.js';
import { PriceError } from './list.js';

/** Builds a discount schedule for a customer. */
export function makeSchedule(spec) {
  const { customer, bands = [], rebateBands = [], freightAllowancePerMbf = 0 } = spec;
  if (!customer) {
    throw new PriceError('a discount schedule needs a customer', { path: 'customer' });
  }
  // Sorted before they are checked, not after. A caller writing a schedule out
  // by hand puts the bands in whatever order they think of them, and refusing
  // that is refusing the wrong thing: two bands at the same volume is the
  // mistake worth catching.
  const sortedBands = [...bands].sort((a, b) => a.fromMbf - b.fromMbf);
  const sortedRebates = [...rebateBands].sort((a, b) => a.fromMbf - b.fromMbf);

  for (const list of [sortedBands, sortedRebates]) {
    let previous = -1;
    for (const band of list) {
      if (!(band.fromMbf >= 0)) {
        throw new PriceError('every band needs a volume it starts at', { path: 'bands' });
      }
      if (band.fromMbf <= previous) {
        throw new PriceError(`two bands both start at ${band.fromMbf}`, { path: 'bands' });
      }
      if (!(band.share >= 0) || band.share > 0.5) {
        throw new PriceError(`a band share of ${band.share} is not a discount`, { path: 'bands' });
      }
      previous = band.fromMbf;
    }
  }
  if (freightAllowancePerMbf < 0) {
    throw new PriceError('a freight allowance cannot be negative', {
      path: 'freightAllowancePerMbf',
    });
  }

  return {
    customer,
    bands: sortedBands,
    rebateBands: sortedRebates,
    freightAllowancePerMbf,
  };
}

/** The band a volume falls in, or null below the first one. */
export function bandFor(bands, mbf) {
  let found = null;
  for (const band of bands) {
    if (mbf >= band.fromMbf) found = band;
  }
  return found;
}

/**
 * The invoice price for a load, given how much the customer has taken in the
 * period so far. The band is read on the period volume including this load,
 * because a load that crosses a band gets the better price itself.
 */
export function invoicePrice(schedule, listPerMbf, mbf, options = {}) {
  const { periodMbf = 0 } = options;
  if (!(listPerMbf > 0)) {
    throw new PriceError('a discount needs a list price to come off', { path: 'listPerMbf' });
  }
  const volume = periodMbf + mbf;
  const band = bandFor(schedule.bands, volume);
  const share = band ? band.share : 0;

  return {
    customer: schedule.customer,
    listPerMbf,
    periodMbf: round4(volume),
    band: band ? band.fromMbf : null,
    discountShare: share,
    discountPerMbf: round2(listPerMbf * share),
    netPerMbf: round2(listPerMbf * (1 - share)),
    freightAllowancePerMbf: schedule.freightAllowancePerMbf,
    invoicePerMbf: round2(listPerMbf * (1 - share) - schedule.freightAllowancePerMbf),
    value: round2(mbf * (listPerMbf * (1 - share) - schedule.freightAllowancePerMbf)),
  };
}

/**
 * The rebate owed on a period. It is worked out on the whole period at the
 * band the period reached, and it is a liability from the first load rather
 * than a discount on the last.
 */
export function rebateOwed(schedule, periodMbf, averagePerMbf) {
  const band = bandFor(schedule.rebateBands, periodMbf);
  if (!band) {
    return { band: null, share: 0, owed: 0, reachedBy: null };
  }
  const next = schedule.rebateBands.find((entry) => entry.fromMbf > periodMbf) ?? null;
  return {
    band: band.fromMbf,
    share: band.share,
    owed: round2(periodMbf * averagePerMbf * band.share),
    nextBandAt: next ? next.fromMbf : null,
    moreForNextBand: next ? round4(next.fromMbf - periodMbf) : null,
    reachedBy: periodMbf,
  };
}

/**
 * What one more package is worth to a customer sitting under a band. This is
 * the number a sales desk should have and almost never does, and it is often
 * larger than the package itself.
 */
export function worthOfCrossing(schedule, listPerMbf, periodMbf, extraMbf, averagePerMbf) {
  const before = rebateOwed(schedule, periodMbf, averagePerMbf).owed;
  const after = rebateOwed(schedule, periodMbf + extraMbf, averagePerMbf).owed;
  const priceBefore = invoicePrice(schedule, listPerMbf, extraMbf, { periodMbf }).invoicePerMbf;
  const priceAfter = invoicePrice(schedule, listPerMbf, extraMbf, {
    periodMbf: periodMbf + extraMbf,
  }).invoicePerMbf;

  return {
    extraMbf,
    rebateGain: round2(after - before),
    priceGainPerMbf: round2(priceBefore - priceAfter),
    crossesRebateBand: after > before,
    worthPerMbf: extraMbf > 0 ? round2((after - before) / extraMbf) : 0,
  };
}

/** The full picture for a period: what was invoiced and what is owed. */
export function periodPosition(schedule, loads, listPerMbf) {
  let periodMbf = 0;
  const invoices = loads.map((mbf) => {
    const invoice = invoicePrice(schedule, listPerMbf, mbf, { periodMbf });
    periodMbf += mbf;
    return invoice;
  });
  const invoiced = round2(invoices.reduce((total, invoice) => total + invoice.value, 0));
  const average = periodMbf > 0 ? invoiced / periodMbf : 0;

  return {
    customer: schedule.customer,
    loads: invoices.length,
    periodMbf: round4(periodMbf),
    invoiced,
    averagePerMbf: round2(average),
    rebate: rebateOwed(schedule, periodMbf, average),
    invoices,
  };
}
