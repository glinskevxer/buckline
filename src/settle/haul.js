/**
 * Hauling.
 *
 * Trucking is quoted three different ways and a yard of any size deals with
 * all three at once. Short hauls are quoted per load, because the cost is the
 * trip and not the wood. Long hauls are quoted per thousand board feet,
 * because the truck is full either way and the wood is what is being moved.
 * Weight based hauls are quoted per ton, which is the honest basis and the one
 * nobody uses for hardwood because green weight varies with species and
 * season.
 *
 * The basis is a property of the zone and the carrier together, not of the
 * load, so the same truckload is billed differently depending on where it went
 * and who moved it. Fuel surcharge sits on top of the base rate only, never on
 * the surcharged total, and only above the threshold in the agreement.
 */

import { round2, round4 } from '../num.js';
import { SettleError } from './stumpage.js';

/** The three bases a haul can be quoted on. */
export const HAUL_BASES = ['per load', 'per mbf', 'per ton'];

/** Builds a haul rate card. */
export function makeRateCard(spec) {
  const { carrier, zones = [], fuel = null, minimumPerLoad = 0 } = spec;
  if (!carrier) {
    throw new SettleError('a rate card needs a carrier', { path: 'carrier' });
  }
  if (zones.length === 0) {
    throw new SettleError('a rate card needs at least one zone', { path: 'zones' });
  }

  const byZone = new Map();
  for (const zone of zones) {
    if (!HAUL_BASES.includes(zone.basis)) {
      throw new SettleError(`zone ${zone.id} is quoted on an unknown basis ${zone.basis}`, {
        path: 'zones',
      });
    }
    if (!(zone.rate > 0)) {
      throw new SettleError(`zone ${zone.id} has no rate`, { path: 'zones' });
    }
    if (
      zone.maxMiles !== undefined &&
      zone.minMiles !== undefined &&
      zone.maxMiles < zone.minMiles
    ) {
      throw new SettleError(`zone ${zone.id} ends before it starts`, { path: 'zones' });
    }
    byZone.set(zone.id, { ...zone });
  }

  if (fuel && !(fuel.thresholdPerGallon > 0)) {
    throw new SettleError('a fuel clause needs a threshold', { path: 'fuel' });
  }

  return { carrier, byZone, fuel, minimumPerLoad };
}

/** The zone a distance falls in, or null when nothing covers it. */
export function zoneForMiles(card, miles) {
  for (const zone of card.byZone.values()) {
    const low = zone.minMiles ?? 0;
    const high = zone.maxMiles ?? Infinity;
    if (miles >= low && miles <= high) return zone;
  }
  return null;
}

/**
 * The base haul charge, before fuel. The basis decides which of the load's
 * measurements is even looked at, which is why a load with no weight on it can
 * be billed in one zone and not in another.
 */
export function baseCharge(card, zoneId, load) {
  const zone = card.byZone.get(zoneId);
  if (!zone) {
    throw new SettleError(`no zone ${zoneId} on ${card.carrier}'s card`, { path: 'zone' });
  }

  switch (zone.basis) {
    case 'per load':
      return { basis: zone.basis, charge: round2(zone.rate), measured: 1 };
    case 'per mbf': {
      if (!(load.netBoardFeet >= 0)) {
        throw new SettleError('a per thousand haul needs a scale', { path: 'load.netBoardFeet' });
      }
      return {
        basis: zone.basis,
        charge: round2((load.netBoardFeet / 1000) * zone.rate),
        measured: round4(load.netBoardFeet / 1000),
      };
    }
    case 'per ton': {
      if (!(load.netWeightLb > 0)) {
        throw new SettleError('a per ton haul needs a weight ticket', { path: 'load.netWeightLb' });
      }
      const tons = load.netWeightLb / 2000;
      return { basis: zone.basis, charge: round2(tons * zone.rate), measured: round4(tons) };
    }
    default:
      throw new SettleError(`cannot bill a ${zone.basis} haul`, { path: 'basis' });
  }
}

/**
 * Fuel surcharge on a base charge. It is a share of the base, worked out from
 * how far the diesel price is over the threshold, and it never applies to
 * itself.
 */
export function fuelSurcharge(card, baseAmount, dieselPerGallon) {
  if (!card.fuel) {
    return { surcharge: 0, applied: false, reason: 'no fuel clause' };
  }
  if (dieselPerGallon === undefined || dieselPerGallon === null) {
    throw new SettleError('a fuel clause needs a diesel price', { path: 'dieselPerGallon' });
  }
  if (dieselPerGallon <= card.fuel.thresholdPerGallon) {
    return {
      surcharge: 0,
      applied: false,
      reason: `diesel at ${dieselPerGallon} is at or under the ${card.fuel.thresholdPerGallon} threshold`,
    };
  }
  const over = dieselPerGallon - card.fuel.thresholdPerGallon;
  const steps = card.fuel.perStep ? Math.floor(over / card.fuel.perStep) : over;
  const share = steps * (card.fuel.sharePerStep ?? 0.01);
  return {
    surcharge: round2(baseAmount * share),
    applied: share > 0,
    share: round4(share),
    reason: `diesel at ${dieselPerGallon} is over the ${card.fuel.thresholdPerGallon} threshold`,
  };
}

/** The whole haul charge for one load. */
export function haulCharge(card, zoneId, load, options = {}) {
  const { dieselPerGallon = null } = options;
  const base = baseCharge(card, zoneId, load);
  const fuel = fuelSurcharge(card, base.charge, card.fuel ? dieselPerGallon : undefined);
  const beforeMinimum = round2(base.charge + fuel.surcharge);
  const total = round2(Math.max(beforeMinimum, card.minimumPerLoad));

  return {
    carrier: card.carrier,
    zone: zoneId,
    basis: base.basis,
    measured: base.measured,
    baseCharge: base.charge,
    fuelSurcharge: fuel.surcharge,
    minimumApplied: total > beforeMinimum + 1e-9,
    total,
    fuelReason: fuel.reason,
  };
}

/** The same load billed in every zone, for choosing where to send a truck. */
export function compareZones(card, load, options = {}) {
  return [...card.byZone.keys()]
    .map((zoneId) => {
      try {
        return haulCharge(card, zoneId, load, options);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.total - b.total);
}
