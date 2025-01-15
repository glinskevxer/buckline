import { describe, expect, it } from 'vitest';
import { SettleError } from '../../src/settle/stumpage.js';
import { backhaulValue, makeTrip, rankTrips, tripCost, tripMiles } from '../../src/haul/route.js';

const trip = makeTrip({
  tripId: 'TR-1',
  truck: 'Peterbilt 379',
  legs: [
    { miles: 42, loaded: false, note: 'out to the landing' },
    { miles: 42, loaded: true, loadId: 'LD-19' },
    { miles: 18, loaded: false, note: 'over to the second landing' },
    { miles: 55, loaded: true, loadId: 'LD-20' },
  ],
});

describe('makeTrip', () => {
  it('needs an identifier and a leg', () => {
    expect(() => makeTrip({ legs: [{ miles: 10 }] })).toThrow(SettleError);
    expect(() => makeTrip({ tripId: 'TR-1', legs: [] })).toThrow(SettleError);
  });

  it('refuses a leg with no distance', () => {
    expect(() => makeTrip({ tripId: 'TR-1', legs: [{ loaded: false }] })).toThrow(SettleError);
  });

  it('refuses a loaded leg that names no load', () => {
    expect(() => makeTrip({ tripId: 'TR-1', legs: [{ miles: 10, loaded: true }] })).toThrow(
      SettleError
    );
  });
});

describe('tripMiles', () => {
  it('splits loaded from empty', () => {
    const miles = tripMiles(trip);
    expect(miles.loaded).toBe(97);
    expect(miles.empty).toBe(60);
    expect(miles.total).toBe(157);
  });

  it('reports the deadhead share', () => {
    expect(tripMiles(trip).deadheadShare).toBeCloseTo(60 / 157, 4);
  });

  it('reports a trip that never loaded as all deadhead', () => {
    const empty = makeTrip({ tripId: 'TR-2', legs: [{ miles: 30, loaded: false }] });
    expect(tripMiles(empty).deadheadShare).toBe(1);
  });
});

describe('tripCost', () => {
  const cost = tripCost(trip);

  it('costs the whole trip, deadhead included', () => {
    expect(cost.totalCost).toBeCloseTo(157 * 2.4, 2);
  });

  it('shares the cost across the loaded legs by mileage', () => {
    expect(cost.perLoad).toHaveLength(2);
    const nineteen = cost.perLoad.find((entry) => entry.loadId === 'LD-19');
    expect(nineteen.share).toBeCloseTo(42 / 97, 4);
  });

  it('makes the loaded legs carry the deadhead between them', () => {
    const loadedOnly = 97 * 2.4;
    const charged = cost.perLoad.reduce((sum, entry) => sum + entry.cost, 0);
    expect(charged).toBeGreaterThan(loadedOnly);
  });

  it('allocates the whole cost', () => {
    expect(cost.unallocated).toBeCloseTo(0, 1);
  });

  it('leaves the cost unallocated when nothing was carried', () => {
    const empty = makeTrip({ tripId: 'TR-2', legs: [{ miles: 30, loaded: false }] });
    const result = tripCost(empty);
    expect(result.perLoad).toEqual([]);
    expect(result.unallocated).toBeCloseTo(72, 2);
  });
});

describe('backhaulValue', () => {
  it('takes a backhaul that pays more than the detour', () => {
    const result = backhaulValue(trip, { legIndex: 0, revenue: 300, extraMiles: 12 });
    expect(result.worthTaking).toBe(true);
    expect(result.net).toBeCloseTo(300 - 12 * 2.4, 2);
  });

  it('refuses one that does not', () => {
    expect(backhaulValue(trip, { legIndex: 0, revenue: 20, extraMiles: 40 }).worthTaking).toBe(
      false
    );
  });

  it('charges nothing when there is no detour', () => {
    expect(backhaulValue(trip, { legIndex: 0, revenue: 100 }).extraCost).toBe(0);
  });

  it('never charges the backhaul a share of the base trip', () => {
    const result = backhaulValue(trip, { legIndex: 0, revenue: 300, extraMiles: 0 });
    expect(result.net).toBe(300);
  });

  it('refuses a leg that is already carrying something', () => {
    expect(() => backhaulValue(trip, { legIndex: 1, revenue: 300 })).toThrow(SettleError);
  });

  it('refuses a leg that is not on the trip', () => {
    expect(() => backhaulValue(trip, { legIndex: 9, revenue: 300 })).toThrow(SettleError);
  });
});

describe('rankTrips', () => {
  const other = makeTrip({
    tripId: 'TR-2',
    legs: [
      { miles: 8, loaded: false },
      { miles: 8, loaded: true, loadId: 'LD-21' },
    ],
  });

  const revenue = { 'LD-19': 420, 'LD-20': 520, 'LD-21': 260 };

  it('ranks by margin per mile, not by margin', () => {
    const rows = rankTrips([trip, other], revenue);
    expect(rows[0].tripId).toBe('TR-2');
    expect(rows[0].margin).toBeLessThan(rows[1].margin);
  });

  it('reports the loaded share alongside', () => {
    const rows = rankTrips([trip, other], revenue);
    expect(rows.every((row) => row.loadedShare > 0)).toBe(true);
  });

  it('counts a load with no revenue recorded as nothing', () => {
    const rows = rankTrips([other], {});
    expect(rows[0].revenue).toBe(0);
    expect(rows[0].margin).toBeLessThan(0);
  });
});
