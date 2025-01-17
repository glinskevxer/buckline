import { describe, expect, it } from 'vitest';
import { SettleError } from '../../src/settle/stumpage.js';
import {
  REMITTERS,
  TAX_BASES,
  asDeduction,
  compareJurisdictions,
  effectiveRate,
  exemption,
  makeJurisdiction,
  taxOn,
} from '../../src/settle/tax.js';

const onValue = makeJurisdiction({
  id: 'VA',
  name: 'Virginia',
  basis: 'stumpage value',
  rate: 0.0285,
});

const onVolume = makeJurisdiction({
  id: 'WV',
  name: 'West Virginia',
  basis: 'volume',
  rate: 4.5,
  remitter: 'seller',
  exemptBelowMbf: 5,
});

const cut = { stumpageValue: 10000, netMbf: 14.2, product: 'sawlog' };

describe('makeJurisdiction', () => {
  it('knows the bases and the remitters', () => {
    expect(TAX_BASES).toContain('assessed value');
    expect(REMITTERS).toEqual(['buyer', 'seller']);
  });

  it('refuses a basis or a remitter nobody uses', () => {
    expect(() => makeJurisdiction({ id: 'X', basis: 'acres', rate: 1 })).toThrow(SettleError);
    expect(() =>
      makeJurisdiction({ id: 'X', basis: 'volume', rate: 1, remitter: 'the bank' })
    ).toThrow(SettleError);
  });

  it('refuses a jurisdiction with no identity or no rate', () => {
    expect(() => makeJurisdiction({ basis: 'volume', rate: 1 })).toThrow(SettleError);
    expect(() => makeJurisdiction({ id: 'X', basis: 'volume' })).toThrow(SettleError);
  });

  it('lets a rate be nothing, which some states do', () => {
    expect(makeJurisdiction({ id: 'X', basis: 'volume', rate: 0 }).rate).toBe(0);
  });
});

describe('taxOn', () => {
  it('taxes the stumpage value where that is the basis', () => {
    const result = taxOn(onValue, cut);
    expect(result.taxable).toBe(10000);
    expect(result.tax).toBe(285);
  });

  it('taxes the volume where that is the basis', () => {
    const result = taxOn(onVolume, cut);
    expect(result.taxable).toBe(14.2);
    expect(result.tax).toBeCloseTo(63.9, 2);
  });

  it('gives a very different answer on the same cut', () => {
    expect(taxOn(onValue, cut).tax).not.toBeCloseTo(taxOn(onVolume, cut).tax, 0);
  });

  it('taxes an assessed value where that is the basis', () => {
    const assessed = makeJurisdiction({ id: 'X', basis: 'assessed value', rate: 0.01 });
    expect(taxOn(assessed, { ...cut, assessedValue: 40000 }).tax).toBe(400);
  });

  it('refuses to tax an assessed value the cut does not carry', () => {
    const assessed = makeJurisdiction({ id: 'X', basis: 'assessed value', rate: 0.01 });
    expect(() => taxOn(assessed, cut)).toThrow(SettleError);
  });

  it('names who remits', () => {
    expect(taxOn(onValue, cut).remitter).toBe('buyer');
    expect(taxOn(onVolume, cut).remitter).toBe('seller');
  });
});

describe('exemption', () => {
  it('exempts a small cut where a volume threshold is set', () => {
    const small = { ...cut, netMbf: 3 };
    expect(exemption(onVolume, small).exempt).toBe(true);
    expect(taxOn(onVolume, small).tax).toBe(0);
  });

  it('does not exempt the same cut where no threshold is set', () => {
    expect(exemption(onValue, { ...cut, netMbf: 3 }).exempt).toBe(false);
  });

  it('exempts pulpwood where a state says so', () => {
    const noPulp = makeJurisdiction({
      id: 'X',
      basis: 'volume',
      rate: 4,
      appliesToPulpwood: false,
    });
    expect(exemption(noPulp, { ...cut, product: 'pulpwood' }).exempt).toBe(true);
    expect(exemption(noPulp, cut).exempt).toBe(false);
  });

  it('gives every reason it exempted', () => {
    const both = makeJurisdiction({
      id: 'X',
      basis: 'volume',
      rate: 4,
      exemptBelowMbf: 20,
      exemptBelowValue: 20000,
    });
    expect(exemption(both, cut).reasons).toHaveLength(2);
  });
});

describe('asDeduction', () => {
  it('makes a deduction line where the buyer remits', () => {
    expect(asDeduction(onValue, cut)).toMatchObject({ class: 'statutory', basis: 'flat' });
  });

  it('makes none where the seller remits', () => {
    expect(asDeduction(onVolume, cut)).toBeNull();
  });

  it('makes none on an exempt cut', () => {
    expect(asDeduction(onValue, { ...cut, stumpageValue: 0 })).toBeNull();
  });

  it('takes a different line name', () => {
    expect(asDeduction(onValue, cut, { name: 'forest products tax' }).name).toBe(
      'forest products tax'
    );
  });
});

describe('compareJurisdictions', () => {
  it('shows the difference across a state line', () => {
    const result = compareJurisdictions(onValue, onVolume, cut);
    expect(result.difference).not.toBe(0);
    expect(result.sameBasis).toBe(false);
    expect(result.sameRemitter).toBe(false);
  });

  it('shows no difference between a jurisdiction and itself', () => {
    expect(compareJurisdictions(onValue, onValue, cut).difference).toBe(0);
  });
});

describe('effectiveRate', () => {
  it('puts a volume tax on the same footing as a value tax', () => {
    expect(effectiveRate(onVolume, cut)).toBeGreaterThan(0);
    expect(effectiveRate(onValue, cut)).toBeCloseTo(0.0285, 4);
  });

  it('is nothing on a cut with no value', () => {
    expect(effectiveRate(onValue, { ...cut, stumpageValue: 0 })).toBe(0);
  });
});
