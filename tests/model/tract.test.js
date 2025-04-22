import { describe, expect, it } from 'vitest';
import { ContractError, ValidationError } from '../../src/errors.js';
import {
  makeTract,
  measurementOptions,
  scalingOptions,
  tractOpenOn,
} from '../../src/model/tract.js';

const raw = {
  id: 'T-7',
  name: 'Culpeper 40',
  owner: 'E. Whitlock',
  county: 'Culpeper',
  acres: 41.5,
  openedOn: '2024-02-01',
  closedOn: '2024-06-30',
  contract: { rule: 'doyle' },
};

describe('makeTract', () => {
  it('fills the contract defaults', () => {
    const tract = makeTract(raw);
    expect(tract.contract.sweepAllowance).toBe('quarter');
    expect(tract.contract.cullShare).toBe(0.5);
    expect(tract.contract.trimPolicy).toBe('hardwood');
  });

  it('keeps the terms that were written down', () => {
    const tract = makeTract({
      ...raw,
      contract: { rule: 'international', sweepAllowance: 'none', cullShare: 0.35 },
    });
    expect(tract.contract.rule).toBe('international');
    expect(tract.contract.sweepAllowance).toBe('none');
    expect(tract.contract.cullShare).toBe(0.35);
  });

  it('refuses a rule nobody scales under', () => {
    expect(() => makeTract({ ...raw, contract: { rule: 'cubic' } })).toThrow();
  });

  it('refuses a sweep allowance that is not one of ours', () => {
    expect(() =>
      makeTract({ ...raw, contract: { rule: 'doyle', sweepAllowance: 'generous' } })
    ).toThrow(ValidationError);
  });

  it('turns the override list into the map the policy layer wants', () => {
    const tract = makeTract({
      ...raw,
      contract: { rule: 'doyle', overrides: [{ defect: 'heart rot', method: 'length' }] },
    });
    expect(tract.contract.overrides).toEqual({ 'heart rot': 'length' });
  });

  it('refuses an override for a defect nobody catalogued', () => {
    expect(() =>
      makeTract({
        ...raw,
        contract: { rule: 'doyle', overrides: [{ defect: 'gremlins', method: 'length' }] },
      })
    ).toThrow(ContractError);
  });

  it('refuses an override the defect cannot be measured by', () => {
    expect(() =>
      makeTract({
        ...raw,
        contract: { rule: 'doyle', overrides: [{ defect: 'sweep', method: 'squared' }] },
      })
    ).toThrow(ContractError);
  });

  it('refuses a tract closed before it opened', () => {
    expect(() => makeTract({ ...raw, closedOn: '2024-01-01' })).toThrow(ContractError);
  });

  it('refuses a tract with no owner', () => {
    expect(() => makeTract({ ...raw, owner: '' })).toThrow(ValidationError);
  });
});

describe('option bags', () => {
  const tract = makeTract({
    ...raw,
    contract: {
      rule: 'doyle',
      sweepAllowance: 'flat',
      cullShare: 0.4,
      rounding: 'nearest',
      overrides: [{ defect: 'heart rot', method: 'length' }],
    },
  });

  it('builds the scaling options from the contract', () => {
    expect(scalingOptions(tract)).toEqual({
      overrides: { 'heart rot': 'length' },
      sweepAllowance: 'flat',
      cullShare: 0.4,
      minimumNetBoardFeet: 10,
    });
  });

  it('builds the measurement options from the contract', () => {
    expect(measurementOptions(tract)).toEqual({
      convention: 'average',
      rounding: 'nearest',
      trimPolicy: 'hardwood',
    });
  });
});

describe('tractOpenOn', () => {
  const tract = makeTract(raw);

  it('is open inside the window', () => {
    expect(tractOpenOn(tract, '2024-03-15')).toBe(true);
  });

  it('is shut either side of it', () => {
    expect(tractOpenOn(tract, '2024-01-31')).toBe(false);
    expect(tractOpenOn(tract, '2024-07-01')).toBe(false);
  });

  it('is open ended when a date is missing', () => {
    const open = makeTract({ ...raw, openedOn: undefined, closedOn: undefined });
    expect(tractOpenOn(open, '1999-01-01')).toBe(true);
  });
});

describe('tract dates', () => {
  it('refuses a date written any other way', () => {
    expect(() => makeTract({ ...raw, openedOn: '01/02/2024' })).toThrow(ValidationError);
  });

  it('refuses a day that does not exist', () => {
    expect(() => makeTract({ ...raw, closedOn: '2024-06-31' })).toThrow(ValidationError);
  });

  it('takes a tract with no dates at all', () => {
    const open = makeTract({ ...raw, openedOn: undefined, closedOn: undefined });
    expect(open.openedOn).toBeUndefined();
  });
});
