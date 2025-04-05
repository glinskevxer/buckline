/**
 * Loading a shipment.
 *
 * Packages of dry lumber go out on a flatbed or in a container, and the
 * constraint is never one thing. A truck runs out of weight before it runs out
 * of deck on eight quarter oak and out of deck before weight on four quarter
 * poplar, and the loader who only watches one of them is wrong half the time.
 *
 * So a shipment carries both limits and reports which one bound. Knowing that
 * is what tells the office whether to sell heavier stock into the next order
 * or lighter.
 *
 * Packages are not split. A package is strapped and tagged and a customer
 * bought it as a unit, so a shipment that cannot fit a package leaves it
 * behind rather than opening it.
 */

import { round2, round4, sum } from '../num.js';
import { lookupSpecies } from '../model/species.js';
import { TallyError } from './unit.js';

/** Pounds per board foot of lumber at a moisture content, by species. */
export function poundsPerBoardFoot(species, moisturePct = 8) {
  const entry = lookupSpecies(species);
  const dryDensity = entry.densityLbPerFt3;
  const withWater = dryDensity * (1 + moisturePct / 100);
  return round4(withWater / 12);
}

/** What one package weighs. */
export function unitWeight(unit, options = {}) {
  const { moisturePct = 8 } = options;
  if (!(unit.boardFeet > 0)) {
    throw new TallyError(`package ${unit.unitId} has no footage on it`, { path: 'boardFeet' });
  }
  return round2(unit.boardFeet * poundsPerBoardFoot(unit.species, moisturePct));
}

/**
 * Loads packages onto a shipment until either limit is reached. Packages are
 * taken in the order given, because a loader works down the row rather than
 * searching the yard for the one that fits.
 *
 * The default deck limit is twelve thousand board feet, which is about what a
 * forty eight foot flatbed holds in four quarter stock. It is a volume limit
 * dressed up in board feet and it does not move with the moisture; the weight
 * limit does, which is the whole reason both are here.
 */
export function loadShipment(units, options = {}) {
  const { maxWeightLb = 48000, maxBoardFeet = 12000, moisturePct = 8, shipmentId = null } = options;

  if (!(maxWeightLb > 0) || !(maxBoardFeet > 0)) {
    throw new TallyError('a shipment needs both a weight limit and a footage limit', {
      path: 'options',
    });
  }

  const loaded = [];
  const left = [];
  let weight = 0;
  let boardFeet = 0;

  for (const unit of units) {
    const unitLb = unitWeight(unit, { moisturePct });
    if (weight + unitLb > maxWeightLb || boardFeet + unit.boardFeet > maxBoardFeet) {
      left.push({
        ...unit,
        weightLb: unitLb,
        why: weight + unitLb > maxWeightLb ? 'weight' : 'deck',
      });
      continue;
    }
    loaded.push({ ...unit, weightLb: unitLb });
    weight = round2(weight + unitLb);
    boardFeet = round2(boardFeet + unit.boardFeet);
  }

  const weightShare = round4(weight / maxWeightLb);
  const deckShare = round4(boardFeet / maxBoardFeet);

  return {
    shipmentId,
    loaded,
    left,
    unitCount: loaded.length,
    weightLb: weight,
    boardFeet,
    maxWeightLb,
    maxBoardFeet,
    weightShare,
    deckShare,
    boundBy: weightShare >= deckShare ? 'weight' : 'deck',
    full: weightShare >= 0.95 || deckShare >= 0.95,
  };
}

/**
 * Which limit a set of packages will hit first, worked out before any loading.
 * This is the question the office asks when it is deciding what to sell, and
 * the answer moves with the moisture content as well as the species.
 */
export function bindingLimit(units, options = {}) {
  const { maxWeightLb = 48000, maxBoardFeet = 12000, moisturePct = 8 } = options;
  if (units.length === 0) {
    throw new TallyError('a shipment needs packages to weigh', { path: 'units' });
  }
  const weight = sum(
    units.map((unit) => unitWeight(unit, { moisturePct })),
    2
  );
  const feet = sum(
    units.map((unit) => unit.boardFeet),
    2
  );
  const perBoardFoot = weight / feet;
  const deckWeight = maxBoardFeet * perBoardFoot;

  return {
    poundsPerBoardFoot: round4(perBoardFoot),
    weightAtFullDeck: round2(deckWeight),
    binding: deckWeight > maxWeightLb ? 'weight' : 'deck',
    headroom: round2(Math.abs(deckWeight - maxWeightLb)),
  };
}

/**
 * The footage that would fill a truck to its weight limit at a given moisture.
 * Wetter stock means less footage, which is why a mill shipping green sells
 * fewer board feet a truck and the same money's worth of freight.
 */
export function footageAtWeightLimit(species, options = {}) {
  const { maxWeightLb = 48000, moisturePct = 8 } = options;
  return round2(maxWeightLb / poundsPerBoardFoot(species, moisturePct));
}

/** A loading list for the yard, heaviest package first so it goes on the bottom. */
export function loadingOrder(units, options = {}) {
  const { moisturePct = 8 } = options;
  return [...units]
    .map((unit) => ({ ...unit, weightLb: unitWeight(unit, { moisturePct }) }))
    .sort((a, b) => b.weightLb - a.weightLb || String(a.unitId).localeCompare(String(b.unitId)));
}
