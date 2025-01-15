/**
 * Trips.
 *
 * A truck that leaves the mill empty, loads at a landing and comes back full
 * has driven the empty half for nothing. A truck that drops sawdust at a
 * poultry house on the way out and comes back with logs has been paid for both
 * halves, and that is the difference between a haul making money and not.
 *
 * So the unit that matters is the trip and not the load. A trip is a sequence
 * of legs, each loaded or empty, and the cost of a load is its share of the
 * whole trip rather than its own mileage. Splitting a trip's cost across its
 * loaded legs by mileage is the convention here; splitting it by revenue is
 * the other convention and it makes the profitable leg carry the deadhead,
 * which is backwards.
 */

import { round1, round2, round4, sum } from '../num.js';
import { SettleError } from '../settle/stumpage.js';

/** Builds a trip out of legs. */
export function makeTrip(spec) {
  const { tripId, truck, driver, legs = [], costPerMile = 2.4, hoursPerLeg = null } = spec;
  if (!tripId) {
    throw new SettleError('a trip needs an identifier', { path: 'tripId' });
  }
  if (legs.length === 0) {
    throw new SettleError('a trip needs at least one leg', { path: 'legs' });
  }
  for (const [index, leg] of legs.entries()) {
    if (!(leg.miles > 0)) {
      throw new SettleError(`leg ${index} has no distance`, { path: 'legs' });
    }
    if (leg.loaded && !leg.loadId) {
      throw new SettleError(`leg ${index} is loaded but names no load`, { path: 'legs' });
    }
  }

  return {
    tripId,
    truck: truck ?? null,
    driver: driver ?? null,
    legs: legs.map((leg) => ({ ...leg, loaded: Boolean(leg.loaded) })),
    costPerMile,
    hoursPerLeg,
  };
}

/** The miles run, split between loaded and empty. */
export function tripMiles(trip) {
  const loaded = sum(
    trip.legs.filter((leg) => leg.loaded).map((leg) => leg.miles),
    1
  );
  const empty = sum(
    trip.legs.filter((leg) => !leg.loaded).map((leg) => leg.miles),
    1
  );
  const total = round1(loaded + empty);
  return {
    loaded,
    empty,
    total,
    loadedShare: total > 0 ? round4(loaded / total) : 0,
    deadheadShare: total > 0 ? round4(empty / total) : 0,
  };
}

/**
 * What the whole trip cost, and each load's share of it. A trip with no loaded
 * legs cost money and earned nothing, and that is reported rather than being a
 * division by zero.
 */
export function tripCost(trip) {
  const miles = tripMiles(trip);
  const total = round2(miles.total * trip.costPerMile);
  const loadedLegs = trip.legs.filter((leg) => leg.loaded);

  if (loadedLegs.length === 0) {
    return { ...miles, totalCost: total, perLoad: [], unallocated: total };
  }

  const perLoad = loadedLegs.map((leg) => ({
    loadId: leg.loadId,
    miles: leg.miles,
    share: round4(leg.miles / miles.loaded),
    cost: round2(total * (leg.miles / miles.loaded)),
  }));

  return {
    ...miles,
    totalCost: total,
    perLoad,
    unallocated: round2(
      total -
        sum(
          perLoad.map((entry) => entry.cost),
          2
        )
    ),
  };
}

/**
 * What a backhaul is worth. A leg that was going to run empty and now carries
 * something earns whatever it is paid, less only the extra miles the detour
 * added. Charging it a share of the base trip is how a mill talks itself out
 * of a backhaul that would have paid.
 */
export function backhaulValue(trip, backhaul) {
  const { revenue, extraMiles = 0, legIndex } = backhaul;
  const leg = trip.legs[legIndex];
  if (!leg) {
    throw new SettleError(`this trip has no leg ${legIndex}`, { path: 'legIndex' });
  }
  if (leg.loaded) {
    throw new SettleError(`leg ${legIndex} is already carrying something`, { path: 'legIndex' });
  }
  const extraCost = round2(extraMiles * trip.costPerMile);
  return {
    legIndex,
    revenue: round2(revenue),
    extraMiles,
    extraCost,
    net: round2(revenue - extraCost),
    worthTaking: revenue > extraCost,
  };
}

/**
 * Trips ranked by what they earned per mile run. This is the only ranking that
 * puts a short trip and a long one on the same footing.
 */
export function rankTrips(trips, revenueByLoad) {
  return trips
    .map((trip) => {
      const cost = tripCost(trip);
      const revenue = sum(
        cost.perLoad.map((entry) => revenueByLoad[entry.loadId] ?? 0),
        2
      );
      return {
        tripId: trip.tripId,
        miles: cost.total,
        loadedShare: cost.loadedShare,
        cost: cost.totalCost,
        revenue,
        margin: round2(revenue - cost.totalCost),
        perMile: cost.total > 0 ? round2((revenue - cost.totalCost) / cost.total) : 0,
      };
    })
    .sort((a, b) => b.perMile - a.perMile || a.tripId.localeCompare(b.tripId));
}
