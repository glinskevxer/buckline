import { describe, expect, it } from 'vitest';
import { ContractError, ValidationError } from '../../src/errors.js';
import { makeLoad, netWeightLb, weightCheck, weightPerBoardFoot } from '../../src/model/load.js';

const raw = {
  id: 'LD-19',
  tractId: 'T-7',
  truck: 'Peterbilt 379',
  driver: 'C. Beazley',
  haulZone: 'zone 2',
  grossWeightLb: 78000,
  tareWeightLb: 30000,
  logs: [
    { id: 'L-1', species: 'red oak', axesIn: [17, 17], measuredLengthFt: 12.25 },
    { id: 'L-2', species: 'white oak', axesIn: [21, 21], measuredLengthFt: 16.25 },
  ],
};

describe('makeLoad', () => {
  it('reads every log with the load and tract stamped on it', () => {
    const load = makeLoad(raw);
    expect(load.logs).toHaveLength(2);
    expect(load.logs[0].loadId).toBe('LD-19');
    expect(load.logs[0].tractId).toBe('T-7');
  });

  it('passes the measurement conventions down to each log', () => {
    const load = makeLoad(raw, { rounding: 'nearest' });
    expect(load.logs[0].conventions.rounding).toBe('nearest');
  });

  it('refuses a load with no logs', () => {
    expect(() => makeLoad({ ...raw, logs: [] })).toThrow(ContractError);
  });

  it('refuses a log from another tract', () => {
    const mixed = {
      ...raw,
      logs: [{ ...raw.logs[0], tractId: 'T-9' }, raw.logs[1]],
    };
    expect(() => makeLoad(mixed)).toThrow(ContractError);
  });

  it('refuses the same log twice', () => {
    expect(() => makeLoad({ ...raw, logs: [raw.logs[0], raw.logs[0]] })).toThrow(ContractError);
  });

  it('refuses a load with no tract', () => {
    expect(() => makeLoad({ ...raw, tractId: '' })).toThrow(ValidationError);
  });
});

describe('weights', () => {
  it('takes the truck off the gross', () => {
    expect(netWeightLb(makeLoad(raw))).toBe(48000);
  });

  it('reports nothing when a weight is missing', () => {
    const load = makeLoad({ ...raw, tareWeightLb: undefined });
    expect(netWeightLb(load)).toBeNull();
    expect(weightPerBoardFoot(load, 5000)).toBeNull();
  });

  it('works out pounds per board foot', () => {
    expect(weightPerBoardFoot(makeLoad(raw), 4800)).toBe(10);
  });

  it('returns nothing on a zero scale', () => {
    expect(weightPerBoardFoot(makeLoad(raw), 0)).toBeNull();
  });
});

describe('weightCheck', () => {
  const load = makeLoad(raw);

  it('passes a load in the usual band', () => {
    expect(weightCheck(load, 4800).verdict).toBe('in line');
  });

  it('flags a load that is heavy for its scale', () => {
    expect(weightCheck(load, 3000).verdict).toBe('heavy for the scale');
  });

  it('flags a load that is light for its scale', () => {
    expect(weightCheck(load, 8000).verdict).toBe('light for the scale');
  });

  it('says so when there is nothing to check', () => {
    const noWeights = makeLoad({ ...raw, grossWeightLb: undefined });
    expect(weightCheck(noWeights, 4800).checked).toBe(false);
  });

  it('takes a different band for a dry load', () => {
    expect(weightCheck(load, 8000, { low: 5, high: 9 }).verdict).toBe('in line');
  });
});
