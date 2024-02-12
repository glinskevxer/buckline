import { describe, expect, it } from 'vitest';
import { ContractError } from '../../../src/errors.js';
import {
  compareRules,
  crossoverDiameter,
  getRule,
  grossUnder,
  ruleIds,
  rulePolicy,
  scaleUnder,
} from '../../../src/scale/rules/index.js';

describe('ruleIds', () => {
  it('lists the three rules the yard scales under', () => {
    expect(ruleIds()).toEqual(['doyle', 'international', 'scribner']);
  });
});

describe('getRule', () => {
  it('finds a rule named loosely', () => {
    expect(getRule('  Doyle ').id).toBe('doyle');
  });

  it('names the alternatives when the rule is unknown', () => {
    let caught;
    try {
      getRule('cubic');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ContractError);
    expect(caught.message).toContain('international');
  });

  it('refuses a rule that is not named at all', () => {
    expect(() => getRule(undefined)).toThrow(ContractError);
  });
});

describe('rulePolicy', () => {
  it('reports the deduction method each rule wants', () => {
    expect(rulePolicy('doyle').deductionMethod).toBe('squared');
    expect(rulePolicy('scribner').deductionMethod).toBe('diameter');
    expect(rulePolicy('international').deductionMethod).toBe('length');
  });

  it('reports segment length only for the segment rule', () => {
    expect(rulePolicy('international').segmentFt).toBe(4);
    expect(rulePolicy('doyle').segmentFt).toBeNull();
    expect(rulePolicy('scribner').segmentFt).toBeNull();
  });

  it('reports what the ticket rounds to', () => {
    expect(rulePolicy('doyle').roundsTo).toBe(1);
    expect(rulePolicy('international').roundsTo).toBe(5);
    expect(rulePolicy('scribner').roundsTo).toBe(10);
  });

  it('gives every rule a policy with the same shape', () => {
    for (const id of ruleIds()) {
      expect(Object.keys(rulePolicy(id)).sort()).toEqual([
        'deductionMethod',
        'id',
        'label',
        'roundsTo',
        'segmentFt',
        'smallestDiameterIn',
      ]);
    }
  });
});

describe('scaleUnder', () => {
  it('agrees with the rule module', () => {
    expect(scaleUnder('international', 16, 16)).toBe(180);
    expect(scaleUnder('doyle', 16, 16)).toBe(144);
    expect(scaleUnder('scribner', 16, 16)).toBe(160);
  });

  it('rounds every rule the way that rule rounds', () => {
    for (const id of ruleIds()) {
      const policy = rulePolicy(id);
      expect(scaleUnder(id, 17, 13) % policy.roundsTo).toBe(0);
    }
  });

  it('exposes the unrounded figure separately', () => {
    expect(grossUnder('doyle', 15, 13)).toBeCloseTo((121 / 16) * 13, 9);
  });
});

describe('compareRules', () => {
  it('puts doyle well under international on a small log', () => {
    const rows = compareRules(12, 16);
    const doyle = rows.find((r) => r.rule === 'doyle');
    expect(doyle.ratioToInternational).toBeLessThan(0.75);
  });

  it('scores international against itself at one', () => {
    const rows = compareRules(16, 16);
    const reference = rows.find((r) => r.rule === 'international');
    expect(reference.ratioToInternational).toBeCloseTo(1, 2);
  });

  it('returns a row per rule', () => {
    expect(compareRules(18, 12).map((r) => r.rule)).toEqual(ruleIds());
  });

  it('reports a null ratio for a stick too small for any rule to find wood in', () => {
    for (const row of compareRules(1, 16)) {
      expect(row.ratioToInternational).toBeNull();
    }
  });
});

describe('crossoverDiameter', () => {
  it('finds where doyle stops shorting the seller', () => {
    const at = crossoverDiameter('doyle', 16);
    expect(at).toBeGreaterThan(24);
    expect(at).toBeLessThan(36);
  });

  it('crosses immediately for international against itself', () => {
    expect(crossoverDiameter('international', 16)).toBe(6);
  });

  it('returns null when a rule never catches up in the searched range', () => {
    expect(crossoverDiameter('doyle', 16, { from: 6, to: 20 })).toBeNull();
  });
});
