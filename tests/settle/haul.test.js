import { describe, expect, it } from 'vitest';
import { SettleError } from '../../src/settle/stumpage.js';
import {
  HAUL_BASES,
  baseCharge,
  compareZones,
  fuelSurcharge,
  haulCharge,
  makeRateCard,
  zoneForMiles,
} from '../../src/settle/haul.js';

const spec = {
  carrier: 'Beazley Hauling',
  minimumPerLoad: 180,
  zones: [
    { id: 'zone 1', minMiles: 0, maxMiles: 25, basis: 'per load', rate: 220 },
    { id: 'zone 2', minMiles: 26, maxMiles: 60, basis: 'per mbf', rate: 62 },
    { id: 'zone 3', minMiles: 61, maxMiles: 140, basis: 'per ton', rate: 14.5 },
  ],
  fuel: { thresholdPerGallon: 3.5, perStep: 0.25, sharePerStep: 0.02 },
};

const card = makeRateCard(spec);
const load = { netBoardFeet: 4800, netWeightLb: 48000 };

describe('makeRateCard', () => {
  it('needs a carrier and a zone', () => {
    expect(() => makeRateCard({ ...spec, carrier: '' })).toThrow(SettleError);
    expect(() => makeRateCard({ ...spec, zones: [] })).toThrow(SettleError);
  });

  it('refuses a basis nobody bills on', () => {
    expect(() =>
      makeRateCard({ ...spec, zones: [{ id: 'z', basis: 'per acre', rate: 10 }] })
    ).toThrow(SettleError);
  });

  it('refuses a zone with no rate or a backwards mile range', () => {
    expect(() =>
      makeRateCard({ ...spec, zones: [{ id: 'z', basis: 'per load', rate: 0 }] })
    ).toThrow(SettleError);
    expect(() =>
      makeRateCard({
        ...spec,
        zones: [{ id: 'z', basis: 'per load', rate: 10, minMiles: 50, maxMiles: 10 }],
      })
    ).toThrow(SettleError);
  });

  it('refuses a fuel clause with no threshold', () => {
    expect(() => makeRateCard({ ...spec, fuel: { perStep: 0.25 } })).toThrow(SettleError);
  });

  it('knows the three bases', () => {
    expect(HAUL_BASES).toEqual(['per load', 'per mbf', 'per ton']);
  });
});

describe('zoneForMiles', () => {
  it('finds the zone a distance falls in', () => {
    expect(zoneForMiles(card, 12).id).toBe('zone 1');
    expect(zoneForMiles(card, 40).id).toBe('zone 2');
    expect(zoneForMiles(card, 100).id).toBe('zone 3');
  });

  it('finds nothing past the last zone', () => {
    expect(zoneForMiles(card, 400)).toBeNull();
  });

  it('finds nothing in the gap between two zones', () => {
    expect(zoneForMiles(card, 25.5)).toBeNull();
  });
});

describe('baseCharge', () => {
  it('bills a short haul by the trip', () => {
    const result = baseCharge(card, 'zone 1', load);
    expect(result.charge).toBe(220);
    expect(result.measured).toBe(1);
  });

  it('bills a medium haul by the scale', () => {
    expect(baseCharge(card, 'zone 2', load).charge).toBeCloseTo(4.8 * 62, 2);
  });

  it('bills a long haul by the weight', () => {
    expect(baseCharge(card, 'zone 3', load).charge).toBe(24 * 14.5);
  });

  it('does not look at the scale on a per load zone', () => {
    expect(baseCharge(card, 'zone 1', {}).charge).toBe(220);
  });

  it('refuses a per ton haul with no weight ticket', () => {
    expect(() => baseCharge(card, 'zone 3', { netBoardFeet: 4800 })).toThrow(SettleError);
  });

  it('refuses a per thousand haul with no scale', () => {
    expect(() => baseCharge(card, 'zone 2', { netWeightLb: 48000 })).toThrow(SettleError);
  });

  it('refuses a zone that is not on the card', () => {
    expect(() => baseCharge(card, 'zone 9', load)).toThrow(SettleError);
  });
});

describe('fuelSurcharge', () => {
  it('takes nothing at or under the threshold', () => {
    expect(fuelSurcharge(card, 1000, 3.5).applied).toBe(false);
    expect(fuelSurcharge(card, 1000, 2).surcharge).toBe(0);
  });

  it('takes two percent per quarter over', () => {
    expect(fuelSurcharge(card, 1000, 4).surcharge).toBe(40);
  });

  it('steps rather than sliding', () => {
    expect(fuelSurcharge(card, 1000, 3.74).surcharge).toBe(
      fuelSurcharge(card, 1000, 3.6).surcharge
    );
  });

  it('takes nothing when there is no fuel clause', () => {
    const flat = makeRateCard({ ...spec, fuel: null });
    expect(fuelSurcharge(flat, 1000, 6).applied).toBe(false);
  });

  it('refuses to compute with no diesel price', () => {
    expect(() => fuelSurcharge(card, 1000, null)).toThrow(SettleError);
  });
});

describe('haulCharge', () => {
  const diesel = { dieselPerGallon: 3.2 };

  it('refuses to bill a card with a fuel clause and no diesel price', () => {
    expect(() => haulCharge(card, 'zone 1', load)).toThrow(SettleError);
  });

  it('adds fuel to the base, not to itself', () => {
    const result = haulCharge(card, 'zone 2', load, { dieselPerGallon: 4 });
    expect(result.fuelSurcharge).toBeCloseTo(result.baseCharge * 0.04, 2);
    expect(result.total).toBeCloseTo(result.baseCharge + result.fuelSurcharge, 2);
  });

  it('lifts a small haul to the minimum', () => {
    const small = haulCharge(card, 'zone 2', { netBoardFeet: 500 }, diesel);
    expect(small.minimumApplied).toBe(true);
    expect(small.total).toBe(180);
  });

  it('leaves a big haul alone', () => {
    expect(haulCharge(card, 'zone 2', load, diesel).minimumApplied).toBe(false);
  });

  it('carries the carrier and the basis for the statement', () => {
    const result = haulCharge(card, 'zone 3', load, diesel);
    expect(result.carrier).toBe('Beazley Hauling');
    expect(result.basis).toBe('per ton');
  });

  it('bills the same load differently in each zone', () => {
    const totals = ['zone 1', 'zone 2', 'zone 3'].map(
      (zone) => haulCharge(card, zone, load, diesel).total
    );
    expect(new Set(totals).size).toBe(3);
  });
});

describe('compareZones', () => {
  const diesel = { dieselPerGallon: 3.2 };

  it('puts the cheapest zone first', () => {
    const rows = compareZones(card, load, diesel);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].total).toBeGreaterThanOrEqual(rows[i - 1].total);
    }
  });

  it('drops a zone the load cannot be billed in', () => {
    const rows = compareZones(card, { netBoardFeet: 4800 }, diesel);
    expect(rows.map((row) => row.zone)).not.toContain('zone 3');
  });
});
