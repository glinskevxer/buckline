import { describe, expect, it } from 'vitest';
import { KilnError } from '../../src/kiln/schedule.js';
import {
  buildCharge,
  chargeCandidate,
  chargePace,
  planCharges,
  schedulePiles,
} from '../../src/kiln/charge.js';

function unit(unitId, species, quarters, boardFeet, greenMoisturePct = 60) {
  return { unitId, species, quarters, boardFeet, greenMoisturePct };
}

const units = [
  unit('U-1', 'yellow poplar', 4, 12000),
  unit('U-2', 'yellow poplar', 4, 11000),
  unit('U-3', 'basswood', 4, 9000),
  unit('U-4', 'white oak', 4, 14000),
  unit('U-5', 'white oak', 8, 10000),
  unit('U-6', 'loblolly pine', 4, 20000),
];

describe('chargeCandidate', () => {
  it('works out the schedule from the species and thickness', () => {
    expect(chargeCandidate(unit('U-1', 'yellow poplar', 4, 1000)).schedule).toBe('T4-C2');
    expect(chargeCandidate(unit('U-4', 'white oak', 4, 1000)).schedule).toBe('T2-C1');
  });

  it('reads the thickness off the quarters', () => {
    expect(chargeCandidate(unit('U-1', 'yellow poplar', 8, 1000)).thicknessIn).toBe(2);
  });

  it('takes an explicit thickness over the quarters', () => {
    const candidate = chargeCandidate({ ...unit('U-1', 'yellow poplar', 4, 1000), thicknessIn: 2 });
    expect(candidate.thicknessIn).toBe(2);
    expect(candidate.schedule).toBe('T2-C1');
  });

  it('refuses a package with no identity or no species', () => {
    expect(() => chargeCandidate({ species: 'red oak', quarters: 4 })).toThrow(KilnError);
    expect(() => chargeCandidate({ unitId: 'U-1', quarters: 4 })).toThrow(KilnError);
  });
});

describe('schedulePiles', () => {
  const piles = schedulePiles(units);

  it('groups by the schedule rather than by the species', () => {
    const standard = piles.find((pile) => pile.schedule === 'T4-C2');
    expect(standard.species).toEqual(['basswood', 'yellow poplar']);
  });

  it('keeps species that need different schedules apart', () => {
    const mild = piles.find((pile) => pile.schedule === 'T2-C1');
    expect(mild.species).toContain('white oak');
    expect(mild.species).not.toContain('yellow poplar');
  });

  it('puts every softwood on its own schedule', () => {
    expect(piles.find((pile) => pile.schedule === 'T8-D4').species).toEqual(['loblolly pine']);
  });

  it('totals each pile', () => {
    expect(piles.find((pile) => pile.schedule === 'T4-C2').boardFeet).toBe(32000);
  });

  it('puts the biggest pile first', () => {
    for (let i = 1; i < piles.length; i += 1) {
      expect(piles[i].boardFeet).toBeLessThanOrEqual(piles[i - 1].boardFeet);
    }
  });

  it('lists the thicknesses in a pile', () => {
    const mild = schedulePiles(units).find((pile) => pile.schedule === 'T2-C1');
    expect(mild.thicknesses).toEqual([1, 2]);
  });
});

describe('buildCharge', () => {
  const pile = schedulePiles(units).find((p) => p.schedule === 'T4-C2');

  it('fills the kiln biggest package first', () => {
    const charge = buildCharge(pile);
    expect(charge.units[0].boardFeet).toBe(12000);
  });

  it('never overfills', () => {
    const charge = buildCharge(pile, { capacityBoardFeet: 20000 });
    expect(charge.boardFeet).toBeLessThanOrEqual(20000);
  });

  it('refuses to run a kiln that is too empty', () => {
    const charge = buildCharge(pile, { capacityBoardFeet: 100000 });
    expect(charge.runnable).toBe(false);
    expect(charge.reason).toContain('percent full');
  });

  it('runs a kiln that is full enough', () => {
    expect(buildCharge(pile, { capacityBoardFeet: 35000 }).runnable).toBe(true);
  });

  it('says so when nothing in the pile fits', () => {
    const charge = buildCharge(pile, { capacityBoardFeet: 100 });
    expect(charge.unitCount).toBe(0);
    expect(charge.reason).toContain('fits the kiln');
  });

  it('marks a charge that mixes species', () => {
    expect(buildCharge(pile, { capacityBoardFeet: 40000 }).mixedSpecies).toBe(true);
  });

  it('marks a charge that mixes thicknesses', () => {
    const mild = schedulePiles(units).find((p) => p.schedule === 'T2-C1');
    expect(buildCharge(mild, { capacityBoardFeet: 40000 }).mixedThickness).toBe(true);
  });

  it('refuses a kiln that holds nothing', () => {
    expect(() => buildCharge(pile, { capacityBoardFeet: 0 })).toThrow(KilnError);
  });
});

describe('chargePace', () => {
  it('is set by the wettest package', () => {
    const pile = schedulePiles([
      unit('U-1', 'yellow poplar', 4, 10000, 55),
      unit('U-2', 'yellow poplar', 4, 10000, 82),
    ])[0];
    const pace = chargePace(buildCharge(pile, { capacityBoardFeet: 40000 }));
    expect(pace.wettest).toBe(82);
    expect(pace.setBy).toBe('U-2');
  });

  it('calls a tight charge even', () => {
    const pile = schedulePiles([
      unit('U-1', 'yellow poplar', 4, 10000, 58),
      unit('U-2', 'yellow poplar', 4, 10000, 62),
    ])[0];
    expect(chargePace(buildCharge(pile, { capacityBoardFeet: 40000 })).even).toBe(true);
  });

  it('calls a spread charge uneven', () => {
    const pile = schedulePiles([
      unit('U-1', 'yellow poplar', 4, 10000, 45),
      unit('U-2', 'yellow poplar', 4, 10000, 95),
    ])[0];
    expect(chargePace(buildCharge(pile, { capacityBoardFeet: 40000 })).even).toBe(false);
  });

  it('refuses an empty charge', () => {
    const pile = schedulePiles(units)[0];
    expect(() => chargePace(buildCharge(pile, { capacityBoardFeet: 100 }))).toThrow(KilnError);
  });
});

describe('planCharges', () => {
  it('plans one charge per schedule', () => {
    const plan = planCharges(units, { capacityBoardFeet: 40000 });
    expect(plan.map((charge) => charge.schedule).sort()).toEqual(['T2-C1', 'T4-C2', 'T8-D4']);
  });

  it('puts the fullest kiln first', () => {
    const plan = planCharges(units, { capacityBoardFeet: 40000 });
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].fillShare).toBeLessThanOrEqual(plan[i - 1].fillShare);
    }
  });

  it('marks the ones that are not worth running yet', () => {
    const plan = planCharges(units, { capacityBoardFeet: 40000 });
    expect(plan.some((charge) => charge.runnable === false)).toBe(true);
  });
});
