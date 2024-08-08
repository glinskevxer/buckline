import { describe, expect, it } from 'vitest';
import { SettleError } from '../../src/settle/stumpage.js';
import {
  BEARERS,
  SPLIT_KINDS,
  bearerOf,
  compareArrangements,
  divide,
  makeSplit,
  underwater,
} from '../../src/settle/split.js';

const residual = makeSplit({
  kind: 'residual',
  cutAndHaulPerMbf: 190,
  bears: { insurance: 'logger', 'road maintenance': 'both' },
});

const share = makeSplit({
  kind: 'share',
  landownerShare: 0.45,
  loggerShare: 0.55,
  bears: { insurance: 'logger' },
});

const deductions = [
  { name: 'severance tax', amount: 285 },
  { name: 'insurance', amount: 200 },
  { name: 'road maintenance', amount: 150 },
];

describe('makeSplit', () => {
  it('knows the two arrangements', () => {
    expect(SPLIT_KINDS).toEqual(['residual', 'share']);
    expect(BEARERS).toContain('both');
  });

  it('refuses an arrangement nobody uses', () => {
    expect(() => makeSplit({ kind: 'handshake' })).toThrow(SettleError);
  });

  it('refuses a residual sale with no cut and haul rate', () => {
    expect(() => makeSplit({ kind: 'residual' })).toThrow(SettleError);
  });

  it('refuses shares that do not add to one', () => {
    expect(() => makeSplit({ kind: 'share', landownerShare: 0.5, loggerShare: 0.4 })).toThrow(
      SettleError
    );
  });

  it('refuses a deduction charged to somebody who is not a party', () => {
    expect(() =>
      makeSplit({ kind: 'residual', cutAndHaulPerMbf: 190, bears: { fuel: 'the mill' } })
    ).toThrow(SettleError);
  });
});

describe('bearerOf', () => {
  it('charges an unnamed deduction to the landowner', () => {
    expect(bearerOf(residual, 'severance tax')).toBe('landowner');
  });

  it('charges a named one to whoever was named', () => {
    expect(bearerOf(residual, 'insurance')).toBe('logger');
    expect(bearerOf(residual, 'road maintenance')).toBe('both');
  });

  it('does not pick up an inherited property name', () => {
    expect(bearerOf(residual, 'constructor')).toBe('landowner');
  });
});

describe('divide on a residual sale', () => {
  const result = divide(residual, 10000, 12, deductions);

  it('pays the logger the cut and haul rate', () => {
    expect(result.logger.gross).toBe(12 * 190);
  });

  it('gives the landowner what is left', () => {
    expect(result.landowner.gross).toBe(10000 - 12 * 190);
  });

  it('leaves nothing unallocated', () => {
    expect(result.unallocated).toBe(0);
  });

  it('charges each deduction to whoever bears it', () => {
    expect(result.logger.deductions).toBe(200 + 75);
    expect(result.landowner.deductions).toBe(285 + 75);
  });

  it('splits a shared deduction down the middle', () => {
    const shared = result.deductionDetail.find((line) => line.name === 'road maintenance');
    expect(shared.landownerShare).toBe(75);
    expect(shared.loggerShare).toBe(75);
  });

  it('nets each party down from their own gross', () => {
    expect(result.landowner.net).toBe(result.landowner.gross - result.landowner.deductions);
    expect(result.logger.net).toBe(result.logger.gross - result.logger.deductions);
  });

  it('never pays the logger more than the whole settlement', () => {
    const poor = divide(residual, 1000, 12, []);
    expect(poor.logger.gross).toBe(1000);
    expect(poor.landowner.gross).toBe(0);
  });
});

describe('divide on a share sale', () => {
  const result = divide(share, 10000, 12, deductions);

  it('splits the gross by the agreed shares', () => {
    expect(result.landowner.gross).toBe(4500);
    expect(result.logger.gross).toBe(5500);
  });

  it('does not care how many thousand were cut', () => {
    expect(divide(share, 10000, 40, []).landowner.gross).toBe(4500);
  });

  it('charges the deductions the same way', () => {
    expect(result.logger.deductions).toBe(200);
    expect(result.landowner.deductions).toBe(285 + 150);
  });
});

describe('underwater', () => {
  it('reports a settlement where nobody owes anything', () => {
    expect(underwater(divide(residual, 10000, 12, deductions)).underwater).toBe(false);
  });

  it('reports the landowner underwater on a poor residual load', () => {
    const result = divide(residual, 2300, 12, deductions);
    const state = underwater(result);
    expect(state.underwater).toBe(true);
    expect(state.parties).toContain('landowner');
    expect(state.shortfall).toBeLessThan(0);
  });

  it('does not quietly floor a negative settlement at nothing', () => {
    expect(divide(residual, 2300, 12, deductions).landowner.net).toBeLessThan(0);
  });
});

describe('compareArrangements', () => {
  it('shows the landowner doing better on a share sale with poor wood', () => {
    const result = compareArrangements(residual, share, 2500, 12, deductions);
    expect(result.landownerDifference).toBeGreaterThan(0);
  });

  it('shows the landowner doing better on a residual sale with good wood', () => {
    const result = compareArrangements(residual, share, 20000, 12, deductions);
    expect(result.landownerDifference).toBeLessThan(0);
  });

  it('names both arrangements', () => {
    const result = compareArrangements(residual, share, 10000, 12, deductions);
    expect(result.left.kind).toBe('residual');
    expect(result.right.kind).toBe('share');
  });
});
