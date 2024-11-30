/**
 * Building a charge.
 *
 * A kiln runs one schedule at a time and everything in it dries on that
 * schedule whether it suits it or not. So a charge is not "whatever fits", it
 * is a set of packages that all want the same schedule, and the schedule is
 * chosen by species and thickness together.
 *
 * That is what makes charge building awkward. A yard with four species in
 * three thicknesses has up to twelve piles that cannot be mixed, and a kiln
 * that holds forty thousand feet. The temptation is to put the odd package in
 * with something close enough, and it is always the odd package that comes out
 * honeycombed.
 *
 * Mixing is allowed here, but only where the schedules agree, and a mixed
 * charge is marked so nobody can pretend afterwards that it was not.
 */

import { round1, round2, sum } from '../num.js';
import { groupBy } from '../collect.js';
import { KilnError, scheduleFor } from './schedule.js';
import { inchesFromQuarters } from '../units.js';

/** A package as the kiln sees it. */
export function chargeCandidate(unit) {
  if (!unit.unitId) {
    throw new KilnError('a package needs an identifier', { path: 'unitId' });
  }
  if (!unit.species) {
    throw new KilnError(`package ${unit.unitId} has no species on it`, { path: 'species' });
  }
  const thicknessIn = unit.thicknessIn ?? inchesFromQuarters(unit.quarters);
  const chosen = scheduleFor(unit.species, thicknessIn);
  return {
    unitId: unit.unitId,
    species: unit.species,
    thicknessIn,
    boardFeet: unit.boardFeet ?? 0,
    greenMoisturePct: unit.greenMoisturePct ?? 60,
    schedule: chosen.schedule.id,
    because: chosen.because,
  };
}

/**
 * Groups packages by the schedule they need. Anything in one group can share
 * a kiln; anything in different groups cannot, whatever the yard says.
 */
export function schedulePiles(units) {
  const candidates = units.map((unit) => chargeCandidate(unit));
  const piles = groupBy(candidates, (candidate) => candidate.schedule);
  return [...piles.entries()]
    .map(([schedule, members]) => ({
      schedule,
      units: members,
      boardFeet: sum(
        members.map((member) => member.boardFeet),
        2
      ),
      species: [...new Set(members.map((member) => member.species))].sort(),
      thicknesses: [...new Set(members.map((member) => member.thicknessIn))].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.boardFeet - a.boardFeet || a.schedule.localeCompare(b.schedule));
}

/**
 * Fills a kiln from one pile, biggest package first, and stops at capacity.
 * A charge under the minimum fill is refused rather than run: a half empty
 * kiln dries unevenly because the air short circuits round the gap.
 */
export function buildCharge(pile, options = {}) {
  const { capacityBoardFeet = 40000, minimumFillShare = 0.7, kilnId = null } = options;
  if (!(capacityBoardFeet > 0)) {
    throw new KilnError('a kiln has to hold something', { path: 'capacityBoardFeet' });
  }

  const taken = [];
  let loaded = 0;
  for (const unit of [...pile.units].sort((a, b) => b.boardFeet - a.boardFeet)) {
    if (loaded + unit.boardFeet > capacityBoardFeet) continue;
    taken.push(unit);
    loaded = round2(loaded + unit.boardFeet);
  }

  const fill = capacityBoardFeet > 0 ? loaded / capacityBoardFeet : 0;
  const species = [...new Set(taken.map((unit) => unit.species))].sort();
  const thicknesses = [...new Set(taken.map((unit) => unit.thicknessIn))].sort((a, b) => a - b);

  return {
    kilnId,
    schedule: pile.schedule,
    units: taken,
    unitCount: taken.length,
    boardFeet: loaded,
    capacityBoardFeet,
    fillShare: round2(fill),
    mixedSpecies: species.length > 1,
    mixedThickness: thicknesses.length > 1,
    species,
    thicknesses,
    runnable: taken.length > 0 && fill >= minimumFillShare,
    reason:
      taken.length === 0
        ? 'nothing in the pile fits the kiln'
        : fill < minimumFillShare
          ? `only ${Math.round(fill * 100)} percent full, under the ${Math.round(minimumFillShare * 100)} percent a kiln needs`
          : null,
  };
}

/**
 * The wettest package in a charge sets the pace, because the schedule advances
 * on the wettest sample board. A charge with a wide spread of starting moisture
 * holds the dry packages at temperature for days after they are done.
 */
export function chargePace(charge) {
  if (charge.units.length === 0) {
    throw new KilnError('an empty charge has no pace', { path: 'units' });
  }
  const moistures = charge.units.map((unit) => unit.greenMoisturePct);
  const wettest = Math.max(...moistures);
  const driest = Math.min(...moistures);
  return {
    wettest,
    driest,
    spread: round1(wettest - driest),
    setBy: charge.units.find((unit) => unit.greenMoisturePct === wettest).unitId,
    even: wettest - driest <= 15,
  };
}

/** Every charge the yard could run today, fullest first. */
export function planCharges(units, options = {}) {
  return schedulePiles(units)
    .map((pile) => buildCharge(pile, options))
    .sort((a, b) => b.fillShare - a.fillShare || a.schedule.localeCompare(b.schedule));
}
