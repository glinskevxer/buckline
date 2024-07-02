import { describe, expect, it } from 'vitest';
import { KilnError } from '../../src/kiln/schedule.js';
import {
  DEGRADE_KINDS,
  MAX_STICKER_SPACING_IN,
  chargeRisk,
  degradeCost,
  shapeRisk,
  stressRisk,
} from '../../src/kiln/degrade.js';

const charge = (over = {}) => ({
  species: 'red oak',
  thicknessIn: 1,
  scheduleId: 'T2-C1',
  moisturePct: 60,
  ...over,
});

const pile = (over = {}) => ({
  stickerSpacingIn: 24,
  stickerThicknessIn: 0.75,
  weightedTop: true,
  ...over,
});

describe('stressRisk', () => {
  it('rises with thickness', () => {
    expect(stressRisk(charge({ thicknessIn: 2 })).risk).toBeGreaterThan(stressRisk(charge()).risk);
  });

  it('rises with density', () => {
    expect(stressRisk(charge({ species: 'hickory' })).risk).toBeGreaterThan(
      stressRisk(charge({ species: 'basswood' })).risk
    );
  });

  it('rises on a harsher schedule', () => {
    expect(stressRisk(charge({ scheduleId: 'T8-D4' })).risk).toBeGreaterThan(
      stressRisk(charge()).risk
    );
  });

  it('says what drove the number', () => {
    expect(stressRisk(charge()).because).toContain('severity');
  });

  it('reports nothing once the charge is off the schedule', () => {
    const result = stressRisk(charge({ moisturePct: 4 }));
    expect(result.risk).toBe(0);
    expect(result.band).toBe('none');
  });

  it('gives the same board a different risk on a different schedule', () => {
    const mild = stressRisk(charge({ scheduleId: 'T2-C1' }));
    const standard = stressRisk(charge({ scheduleId: 'T4-C2' }));
    expect(mild.risk).not.toBe(standard.risk);
  });
});

describe('shapeRisk', () => {
  it('rises as the stickers get further apart', () => {
    expect(shapeRisk(pile({ stickerSpacingIn: 48 })).risk).toBeGreaterThan(shapeRisk(pile()).risk);
  });

  it('flags stickers past the limit', () => {
    expect(shapeRisk(pile({ stickerSpacingIn: 36 })).notes.join(' ')).toContain('over the');
    expect(shapeRisk(pile()).notes).toEqual([]);
  });

  it('penalises an unweighted pile', () => {
    expect(shapeRisk(pile({ weightedTop: false })).risk).toBeGreaterThan(shapeRisk(pile()).risk);
  });

  it('penalises thin stickers', () => {
    expect(shapeRisk(pile({ stickerThicknessIn: 0.25 })).risk).toBeGreaterThan(
      shapeRisk(pile()).risk
    );
  });

  it('penalises thin stock', () => {
    expect(shapeRisk(pile({ boardThicknessIn: 0.75 })).risk).toBeGreaterThan(
      shapeRisk(pile({ boardThicknessIn: 1 })).risk
    );
  });

  it('does not look at the schedule at all', () => {
    expect(shapeRisk(pile())).toEqual(shapeRisk(pile()));
  });

  it('refuses a pile with no sticker spacing', () => {
    expect(() => shapeRisk(pile({ stickerSpacingIn: 0 }))).toThrow(KilnError);
  });

  it('holds the limit at two feet', () => {
    expect(MAX_STICKER_SPACING_IN).toBe(24);
  });
});

describe('chargeRisk', () => {
  it('reports the two risks separately', () => {
    const result = chargeRisk(charge(), pile());
    expect(result.stress).toBeTruthy();
    expect(result.shape).toBeTruthy();
  });

  it('names which one is worse', () => {
    const result = chargeRisk(charge({ thicknessIn: 3, species: 'hickory' }), pile());
    expect(result.worst).toBe('stress');
  });

  it('names the pile when the pile is the problem', () => {
    const result = chargeRisk(charge(), pile({ stickerSpacingIn: 60, weightedTop: false }));
    expect(result.worst).toBe('shape');
    expect(result.remedies.join(' ')).toContain('restack');
  });

  it('suggests a milder schedule when the stress is high', () => {
    const result = chargeRisk(charge({ thicknessIn: 3, species: 'hickory' }), pile());
    expect(result.remedies.join(' ')).toContain('milder schedule');
  });

  it('takes the board thickness from the charge, not the pile', () => {
    const thick = chargeRisk(charge({ thicknessIn: 2 }), pile());
    const thin = chargeRisk(charge({ thicknessIn: 0.75 }), pile());
    expect(thin.shape.risk).toBeGreaterThan(thick.shape.risk);
  });
});

describe('degradeCost', () => {
  it('writes off a honeycombed board entirely', () => {
    const cost = degradeCost('honeycomb', 100);
    expect(cost.lostBoardFeet).toBe(100);
    expect(cost.recoverable).toBe(false);
  });

  it('takes part of a checked board', () => {
    expect(degradeCost('surface check', 100).lostBoardFeet).toBe(40);
    expect(degradeCost('surface check', 100).recoverable).toBe(true);
  });

  it('costs less for a shape defect than a stress one', () => {
    expect(degradeCost('bow', 100).lostBoardFeet).toBeLessThan(
      degradeCost('surface check', 100).lostBoardFeet
    );
  });

  it('costs more for twist than the other shape defects', () => {
    expect(degradeCost('twist', 100).lostBoardFeet).toBeGreaterThan(
      degradeCost('cup', 100).lostBoardFeet
    );
  });

  it('calls every shape defect recoverable', () => {
    for (const kind of DEGRADE_KINDS.shape) {
      expect(degradeCost(kind, 100).recoverable).toBe(true);
    }
  });

  it('puts every kind in one family or the other', () => {
    for (const kind of [...DEGRADE_KINDS.stress, ...DEGRADE_KINDS.shape]) {
      expect(['stress', 'shape']).toContain(degradeCost(kind, 100).family);
    }
  });

  it('refuses something that is not a drying defect', () => {
    expect(() => degradeCost('knot', 100)).toThrow(KilnError);
  });
});
