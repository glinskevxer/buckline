import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../../src/errors.js';
import {
  isMeasurable,
  methodFor,
  methodNames,
  methodsFor,
} from '../../../src/scale/defect/policy.js';

describe('the rule decides where it can', () => {
  it('squares a catface under doyle and cuts it out on the length under international', () => {
    expect(methodFor('catface', 'doyle').method).toBe('squared');
    expect(methodFor('catface', 'international').method).toBe('length');
  });

  it('takes heart rot on the diameter under scribner', () => {
    expect(methodFor('heart rot', 'scribner').method).toBe('diameter');
  });

  it('gives the reason it chose', () => {
    expect(methodFor('catface', 'doyle').because).toContain('doyle takes deductions');
  });

  it('takes a hole out on the length under international', () => {
    expect(methodFor('hole', 'international').method).toBe('length');
  });

  it('produces three different methods for one interior fault under three rules', () => {
    const methods = ['doyle', 'international', 'scribner'].map(
      (r) => methodFor('heart rot', r).method
    );
    expect(methods).toEqual(['squared', 'length', 'diameter']);
  });

  it('collapses to two methods for a local fault, because a diameter cannot hold it', () => {
    const methods = ['doyle', 'international', 'scribner'].map((r) => methodFor('hole', r).method);
    expect(methods).toEqual(['squared', 'length', 'squared']);
  });
});

describe('the defect wins where the rule cannot measure it', () => {
  it('falls back to squaring a local wound under a diameter rule', () => {
    expect(isMeasurable('diameter', 'local')).toBe(false);
    expect(methodFor('punk', 'scribner').method).toBe('squared');
    expect(methodFor('punk', 'scribner').because).toContain('cannot measure');
  });

  it('falls back for a shell fault under a squaring rule', () => {
    expect(isMeasurable('squared', 'shell')).toBe(false);
    expect(methodFor('sap rot', 'doyle').method).toBe('diameter');
  });
});

describe('the catalogue overrides the rule where it must', () => {
  it('charges nothing for a sound knot under any rule', () => {
    for (const rule of ['doyle', 'international', 'scribner']) {
      expect(methodFor('sound knot', rule).method).toBe('none');
    }
  });

  it('makes sweep a percentage under every rule', () => {
    for (const rule of ['doyle', 'international', 'scribner']) {
      const result = methodFor('sweep', rule);
      expect(result.method).toBe('percentage');
      expect(result.because).toContain('whole log');
    }
  });

  it('makes ring shake a percentage even under the length rule', () => {
    expect(methodFor('ring shake', 'international').method).toBe('percentage');
  });
});

describe('contract overrides', () => {
  it('pins a method for a named defect', () => {
    const result = methodFor('catface', 'doyle', { overrides: { catface: 'length' } });
    expect(result.method).toBe('length');
    expect(result.because).toBe('contract override');
  });

  it('leaves other defects alone', () => {
    const overrides = { catface: 'length' };
    expect(methodFor('hole', 'doyle', { overrides }).method).toBe('squared');
  });

  it('can pin a method for a defect that would otherwise cost nothing', () => {
    expect(
      methodFor('sound knot', 'doyle', { overrides: { 'sound knot': 'squared' } }).method
    ).toBe('squared');
  });

  it('refuses a pinned method the defect cannot be measured by', () => {
    expect(() => methodFor('sweep', 'doyle', { overrides: { sweep: 'squared' } })).toThrow(
      ScaleError
    );
  });

  it('refuses a pinned method nobody implements', () => {
    expect(() => methodFor('hole', 'doyle', { overrides: { hole: 'eyeball' } })).toThrow(
      ScaleError
    );
  });

  it('does not pick up an inherited property as an override', () => {
    expect(methodFor('hole', 'doyle', { overrides: {} }).method).toBe('squared');
  });
});

describe('methodsFor', () => {
  const defects = [{ type: 'sweep' }, { type: 'catface' }, { type: 'sound knot' }];

  it('keeps the order the scaler wrote', () => {
    const results = methodsFor(defects, 'doyle');
    expect(results.map((r) => r.method)).toEqual(['percentage', 'squared', 'none']);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('names the offending entry when one is unknown', () => {
    let caught;
    try {
      methodsFor([{ type: 'sweep' }, { type: 'gremlins' }], 'doyle');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ScaleError);
    expect(caught.path).toBe('defects[1]');
  });

  it('refuses anything that is not a list', () => {
    expect(() => methodsFor({ type: 'sweep' }, 'doyle')).toThrow(ScaleError);
  });
});

describe('the measurability table', () => {
  it('names the four methods', () => {
    expect(methodNames()).toEqual(['diameter', 'length', 'percentage', 'squared']);
  });

  it('lets length and percentage measure anything', () => {
    for (const extent of ['whole log', 'local', 'interior', 'shell']) {
      expect(isMeasurable('length', extent)).toBe(true);
      expect(isMeasurable('percentage', extent)).toBe(true);
    }
  });

  it('answers false for a method it does not know', () => {
    expect(isMeasurable('eyeball', 'local')).toBe(false);
  });
});
