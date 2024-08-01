import { describe, expect, it } from 'vitest';
import {
  SettleError,
  advanceRecovery,
  baseRate,
  makeAgreement,
  minimumVolumeShortfall,
  rateFor,
  slideRate,
} from '../../src/settle/stumpage.js';

const spec = {
  id: 'A-1',
  tractId: 'T-7',
  landowner: 'E. Whitlock',
  rates: [
    { species: 'red oak', grade: 'F1', perMbf: 620 },
    { species: 'red oak', perMbf: 380 },
    { species: 'yellow poplar', perMbf: 210 },
  ],
  slidingScale: { baseIndex: 100, triggerIndex: 110, share: 0.5 },
  minimumVolumeMbf: 40,
  advance: 5000,
  advanceRecoveryShare: 0.25,
};

const agreement = makeAgreement(spec);

describe('makeAgreement', () => {
  it('needs an identity and a tract', () => {
    expect(() => makeAgreement({ ...spec, id: '' })).toThrow(SettleError);
    expect(() => makeAgreement({ ...spec, tractId: '' })).toThrow(SettleError);
  });

  it('needs at least one rate', () => {
    expect(() => makeAgreement({ ...spec, rates: [] })).toThrow(SettleError);
  });

  it('refuses a rate that is not a rate', () => {
    expect(() => makeAgreement({ ...spec, rates: [{ species: 'red oak', perMbf: 0 }] })).toThrow(
      SettleError
    );
  });

  it('refuses an advance that is never recovered', () => {
    expect(() => makeAgreement({ ...spec, advanceRecoveryShare: 0 })).toThrow(SettleError);
  });

  it('allows no advance with no recovery', () => {
    expect(makeAgreement({ ...spec, advance: 0, advanceRecoveryShare: 0 }).advance).toBe(0);
  });

  it('refuses a negative advance or a nonsense recovery share', () => {
    expect(() => makeAgreement({ ...spec, advance: -1 })).toThrow(SettleError);
    expect(() => makeAgreement({ ...spec, advanceRecoveryShare: 1.5 })).toThrow(SettleError);
  });

  it('refuses a sliding scale with no base', () => {
    expect(() => makeAgreement({ ...spec, slidingScale: { share: 0.5 } })).toThrow(SettleError);
    expect(() => makeAgreement({ ...spec, slidingScale: { baseIndex: 100, share: 2 } })).toThrow(
      SettleError
    );
  });
});

describe('baseRate', () => {
  it('takes the rate quoted for the grade', () => {
    expect(baseRate(agreement, 'red oak', 'F1')).toMatchObject({ perMbf: 620 });
  });

  it('falls back to the any grade rate', () => {
    const result = baseRate(agreement, 'red oak', 'F3');
    expect(result.perMbf).toBe(380);
    expect(result.route).toContain('any grade');
  });

  it('never falls back across species', () => {
    expect(() => baseRate(agreement, 'white oak', 'F1')).toThrow(SettleError);
  });

  it('normalises the species', () => {
    expect(baseRate(agreement, 'Yellow  Poplar', 'F2').perMbf).toBe(210);
  });
});

describe('slideRate', () => {
  it('does nothing at or under the trigger', () => {
    expect(slideRate(agreement, 600, 100).applied).toBe(false);
    expect(slideRate(agreement, 600, 110).perMbf).toBe(600);
  });

  it('never cuts the rate on a falling market', () => {
    expect(slideRate(agreement, 600, 60).perMbf).toBe(600);
  });

  it('shares the rise above the trigger', () => {
    const result = slideRate(agreement, 600, 120);
    expect(result.applied).toBe(true);
    expect(result.adjustment).toBe(60);
    expect(result.perMbf).toBe(660);
  });

  it('measures the rise from the base, not from the trigger', () => {
    expect(slideRate(agreement, 600, 120).adjustment).toBe(600 * 0.2 * 0.5);
  });

  it('does nothing when there is no sliding scale', () => {
    const flat = makeAgreement({ ...spec, slidingScale: null });
    expect(slideRate(flat, 600, 200).applied).toBe(false);
  });

  it('refuses to slide with no index to read', () => {
    expect(() => slideRate(agreement, 600, null)).toThrow(SettleError);
  });

  it('says why it did or did not apply', () => {
    expect(slideRate(agreement, 600, 100).reason).toContain('trigger');
    expect(slideRate(agreement, 600, 120).reason).toContain('over the trigger');
  });
});

describe('rateFor', () => {
  it('puts the base and the slid rate side by side', () => {
    const result = rateFor(agreement, 'red oak', 'F1', 120);
    expect(result.basePerMbf).toBe(620);
    expect(result.perMbf).toBeGreaterThan(620);
    expect(result.slidingApplied).toBe(true);
  });

  it('leaves the rate alone in a flat market', () => {
    const result = rateFor(agreement, 'red oak', 'F1', 105);
    expect(result.perMbf).toBe(result.basePerMbf);
  });
});

describe('minimumVolumeShortfall', () => {
  it('finds nothing when the sale cut its minimum', () => {
    expect(minimumVolumeShortfall(agreement, 45).applies).toBe(false);
  });

  it('finds the shortfall when it did not', () => {
    const result = minimumVolumeShortfall(agreement, 32.5);
    expect(result.applies).toBe(true);
    expect(result.shortfallMbf).toBe(7.5);
  });

  it('finds nothing when there is no minimum', () => {
    const none = makeAgreement({ ...spec, minimumVolumeMbf: 0 });
    expect(minimumVolumeShortfall(none, 0).applies).toBe(false);
  });
});

describe('advanceRecovery', () => {
  it('takes its share of the settlement', () => {
    const result = advanceRecovery(agreement, 4000, 5000);
    expect(result.recovered).toBe(1000);
    expect(result.remaining).toBe(4000);
  });

  it('never takes more than is outstanding', () => {
    expect(advanceRecovery(agreement, 40000, 500).recovered).toBe(500);
  });

  it('never takes more than the settlement itself', () => {
    const greedy = makeAgreement({ ...spec, advanceRecoveryShare: 1 });
    expect(advanceRecovery(greedy, 300, 5000).recovered).toBe(300);
  });

  it('takes nothing when nothing is outstanding', () => {
    expect(advanceRecovery(agreement, 4000, 0).recovered).toBe(0);
  });
});
