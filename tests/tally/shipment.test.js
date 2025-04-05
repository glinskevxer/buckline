import { describe, expect, it } from 'vitest';
import { TallyError } from '../../src/tally/unit.js';
import {
  bindingLimit,
  footageAtWeightLimit,
  loadShipment,
  loadingOrder,
  poundsPerBoardFoot,
  unitWeight,
} from '../../src/tally/shipment.js';

function unit(unitId, species, boardFeet) {
  return { unitId, species, boardFeet, grade: 'FAS', quarters: 4, lengthFt: 12 };
}

const oak = [unit('U-1', 'white oak', 1000), unit('U-2', 'white oak', 1000)];

describe('poundsPerBoardFoot', () => {
  it('weighs a dense species more', () => {
    expect(poundsPerBoardFoot('hickory')).toBeGreaterThan(poundsPerBoardFoot('basswood'));
  });

  it('weighs wet stock more than dry', () => {
    expect(poundsPerBoardFoot('red oak', 60)).toBeGreaterThan(poundsPerBoardFoot('red oak', 8));
  });

  it('lands in a plausible range for dry hardwood', () => {
    expect(poundsPerBoardFoot('red oak')).toBeGreaterThan(3);
    expect(poundsPerBoardFoot('red oak')).toBeLessThan(5);
  });
});

describe('unitWeight', () => {
  it('weighs a package from its footage', () => {
    expect(unitWeight(unit('U-1', 'red oak', 1000))).toBeCloseTo(
      1000 * poundsPerBoardFoot('red oak'),
      1
    );
  });

  it('refuses a package with no footage', () => {
    expect(() => unitWeight({ unitId: 'U-1', species: 'red oak' })).toThrow(TallyError);
  });
});

describe('loadShipment', () => {
  it('loads what fits and leaves the rest', () => {
    const result = loadShipment(oak, { maxBoardFeet: 1500 });
    expect(result.unitCount).toBe(1);
    expect(result.left).toHaveLength(1);
  });

  it('says why a package was left', () => {
    expect(loadShipment(oak, { maxBoardFeet: 1500 }).left[0].why).toBe('deck');
    const heavy = Array.from({ length: 40 }, (_, i) => unit(`U-${i}`, 'hickory', 1000));
    expect(loadShipment(heavy).left[0].why).toBe('weight');
  });

  it('never splits a package', () => {
    const result = loadShipment(oak, { maxBoardFeet: 1500 });
    expect(result.loaded[0].boardFeet).toBe(1000);
  });

  it('loads in the order it was given', () => {
    const mixed = [unit('U-1', 'basswood', 3000), unit('U-2', 'hickory', 3000)];
    expect(loadShipment(mixed, { maxBoardFeet: 3000 }).loaded[0].unitId).toBe('U-1');
  });

  it('says which limit bound', () => {
    const light = Array.from({ length: 30 }, (_, i) => unit(`U-${i}`, 'basswood', 1000));
    const dense = Array.from({ length: 30 }, (_, i) => unit(`U-${i}`, 'hickory', 1000));
    expect(loadShipment(light).boundBy).toBe('deck');
    expect(loadShipment(dense).boundBy).toBe('weight');
  });

  it('calls a truck full when either limit is nearly reached', () => {
    const dense = Array.from({ length: 30 }, (_, i) => unit(`U-${i}`, 'hickory', 1000));
    expect(loadShipment(dense).full).toBe(true);
  });

  it('calls a light truck not full', () => {
    expect(loadShipment(oak).full).toBe(false);
  });

  it('refuses a shipment with no limits', () => {
    expect(() => loadShipment(oak, { maxWeightLb: 0 })).toThrow(TallyError);
  });

  it('loads nothing out of nothing', () => {
    const result = loadShipment([]);
    expect(result.unitCount).toBe(0);
    expect(result.boardFeet).toBe(0);
  });
});

describe('bindingLimit', () => {
  it('binds on deck for a light species', () => {
    expect(bindingLimit([unit('U-1', 'basswood', 1000)]).binding).toBe('deck');
  });

  it('binds on weight for a dense one', () => {
    expect(bindingLimit([unit('U-1', 'hickory', 1000)]).binding).toBe('weight');
  });

  it('moves with the moisture content', () => {
    const dry = bindingLimit([unit('U-1', 'red oak', 1000)], { moisturePct: 8 });
    const green = bindingLimit([unit('U-1', 'red oak', 1000)], { moisturePct: 70 });
    expect(dry.binding).not.toBe(green.binding);
  });

  it('reports how much headroom there is', () => {
    expect(bindingLimit(oak).headroom).toBeGreaterThan(0);
  });

  it('refuses an empty shipment', () => {
    expect(() => bindingLimit([])).toThrow(TallyError);
  });
});

describe('footageAtWeightLimit', () => {
  it('fits more footage of a light species', () => {
    expect(footageAtWeightLimit('basswood')).toBeGreaterThan(footageAtWeightLimit('hickory'));
  });

  it('fits less footage of wet stock', () => {
    expect(footageAtWeightLimit('red oak', { moisturePct: 70 })).toBeLessThan(
      footageAtWeightLimit('red oak', { moisturePct: 8 })
    );
  });
});

describe('loadingOrder', () => {
  it('puts the heaviest package first', () => {
    const mixed = [unit('U-1', 'basswood', 1000), unit('U-2', 'hickory', 1000)];
    expect(loadingOrder(mixed)[0].unitId).toBe('U-2');
  });

  it('breaks a tie on the package number', () => {
    const same = [unit('U-2', 'red oak', 1000), unit('U-1', 'red oak', 1000)];
    expect(loadingOrder(same).map((u) => u.unitId)).toEqual(['U-1', 'U-2']);
  });

  it('does not edit the list it was given', () => {
    const mixed = [unit('U-1', 'basswood', 1000), unit('U-2', 'hickory', 1000)];
    loadingOrder(mixed);
    expect(mixed[0].unitId).toBe('U-1');
  });
});
