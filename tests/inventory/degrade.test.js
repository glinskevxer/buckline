import { describe, expect, it } from 'vitest';
import { DeckError } from '../../src/inventory/deck.js';
import {
  STORAGE,
  degradeAfter,
  degradeRates,
  holdingCost,
  safeHoldingDays,
  seasonOf,
} from '../../src/inventory/degrade.js';

describe('seasonOf', () => {
  it('reads the month', () => {
    expect(seasonOf('2024-01-15')).toBe('winter');
    expect(seasonOf('2024-04-15')).toBe('spring');
    expect(seasonOf('2024-07-15')).toBe('summer');
    expect(seasonOf('2024-10-15')).toBe('autumn');
    expect(seasonOf('2024-12-15')).toBe('winter');
  });

  it('refuses something that is not a date', () => {
    expect(() => seasonOf('later')).toThrow(DeckError);
  });
});

describe('degradeRates', () => {
  it('is slower in winter than in summer', () => {
    expect(degradeRates('red oak', { season: 'winter' }).stainPerDay).toBeLessThan(
      degradeRates('red oak', { season: 'summer' }).stainPerDay
    );
  });

  it('stains a light species faster than a dense dark one', () => {
    expect(degradeRates('soft maple').stainPerDay).toBeGreaterThan(
      degradeRates('hickory').stainPerDay
    );
  });

  it('checks a heavy shrinking species faster', () => {
    expect(degradeRates('beech').checkPerDay).toBeGreaterThan(
      degradeRates('black cherry').checkPerDay
    );
  });

  it('end sealing stops checking and does nothing for stain', () => {
    const open = degradeRates('red oak', { storage: 'open' });
    const sealed = degradeRates('red oak', { storage: 'end sealed' });
    expect(sealed.checkPerDay).toBeLessThan(open.checkPerDay);
    expect(sealed.stainPerDay).toBe(open.stainPerDay);
  });

  it('a sprinkler stops the beetles outright', () => {
    expect(degradeRates('red oak', { storage: 'sprinkled' }).beetlePerDay).toBe(0);
    expect(degradeRates('red oak', { storage: 'open' }).beetlePerDay).toBeGreaterThan(0);
  });

  it('knows the four ways of holding wood', () => {
    for (const storage of STORAGE) {
      expect(degradeRates('red oak', { storage })).toBeTruthy();
    }
  });

  it('refuses a season or a storage nobody uses', () => {
    expect(() => degradeRates('red oak', { season: 'monsoon' })).toThrow(DeckError);
    expect(() => degradeRates('red oak', { storage: 'buried' })).toThrow(DeckError);
  });
});

describe('degradeAfter', () => {
  it('finds nothing wrong on day zero', () => {
    const state = degradeAfter('red oak', 0);
    expect(state.worstShare).toBe(0);
    expect(state.firstToShow).toBeNull();
  });

  it('gets worse with time', () => {
    expect(degradeAfter('red oak', 60).worstShare).toBeGreaterThan(
      degradeAfter('red oak', 10).worstShare
    );
  });

  it('never goes past everything', () => {
    const state = degradeAfter('soft maple', 5000);
    expect(state.shares.stain).toBe(1);
    expect(state.worstShare).toBe(1);
  });

  it('names which defect shows first', () => {
    expect(degradeAfter('soft maple', 20).firstToShow).toBe('stain');
  });

  it('names checking first on a species that shrinks hard', () => {
    expect(degradeAfter('beech', 20).firstToShow).toBe('check');
  });

  it('flips that species to stain first once the ends are sealed', () => {
    expect(degradeAfter('beech', 20, { storage: 'end sealed' }).firstToShow).toBe('stain');
  });

  it('refuses a negative number of days', () => {
    expect(() => degradeAfter('red oak', -1)).toThrow(DeckError);
  });
});

describe('holdingCost', () => {
  it('costs nothing on the first day', () => {
    expect(holdingCost('red oak', 0, 5000, 1400).lostValue).toBe(0);
  });

  it('costs more the longer the wood sits', () => {
    expect(holdingCost('red oak', 90, 5000, 1400).lostValue).toBeGreaterThan(
      holdingCost('red oak', 30, 5000, 1400).lostValue
    );
  });

  it('reports the grade loss and the volume loss separately', () => {
    const cost = holdingCost('red oak', 60, 5000, 1400);
    expect(cost.gradeLossShare).toBeGreaterThan(0);
    expect(cost.volumeLossShare).toBeGreaterThan(0);
    expect(cost.lostBoardFeet).toBeGreaterThan(0);
  });

  it('costs far less under a sprinkler', () => {
    expect(holdingCost('red oak', 90, 5000, 1400, { storage: 'sprinkled' }).lostValue).toBeLessThan(
      holdingCost('red oak', 90, 5000, 1400, { storage: 'open' }).lostValue
    );
  });

  it('costs far less in winter', () => {
    expect(holdingCost('red oak', 90, 5000, 1400, { season: 'winter' }).lostValue).toBeLessThan(
      holdingCost('red oak', 90, 5000, 1400, { season: 'summer' }).lostValue
    );
  });
});

describe('safeHoldingDays', () => {
  it('allows longer in winter than in summer', () => {
    expect(safeHoldingDays('red oak', 1400, { season: 'winter' })).toBeGreaterThan(
      safeHoldingDays('red oak', 1400, { season: 'summer' })
    );
  });

  it('allows longer under a sprinkler', () => {
    expect(safeHoldingDays('red oak', 1400, { storage: 'sprinkled' })).toBeGreaterThan(
      safeHoldingDays('red oak', 1400, { storage: 'open' })
    );
  });

  it('allows longer when more loss is tolerated', () => {
    expect(safeHoldingDays('red oak', 1400, { limitShare: 0.2 })).toBeGreaterThan(
      safeHoldingDays('red oak', 1400, { limitShare: 0.02 })
    );
  });

  it('caps at the window it was asked to search', () => {
    expect(safeHoldingDays('red oak', 1400, { storage: 'ponded', maxDays: 30 })).toBe(30);
  });
});
