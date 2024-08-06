import { describe, expect, it } from 'vitest';
import { SettleError } from '../../src/settle/stumpage.js';
import {
  DEDUCTION_BASES,
  DEDUCTION_CLASSES,
  applyDeductions,
  byClass,
  checkDeduction,
} from '../../src/settle/deductions.js';

const schedule = [
  { name: 'advance', class: 'advance', basis: 'running', rate: 0.25 },
  { name: 'insurance', class: 'contractual', basis: 'gross', rate: 0.02 },
  { name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 },
  { name: 'road maintenance', class: 'contractual', basis: 'flat', amount: 150 },
];

describe('checkDeduction', () => {
  it('accepts a well formed line', () => {
    expect(checkDeduction(schedule[1])).toBe(true);
  });

  it('refuses an unknown class or basis', () => {
    expect(() => checkDeduction({ name: 'x', class: 'other', basis: 'gross', rate: 0.1 })).toThrow(
      SettleError
    );
    expect(() =>
      checkDeduction({ name: 'x', class: 'statutory', basis: 'guess', rate: 0.1 })
    ).toThrow(SettleError);
  });

  it('refuses a flat charge with no amount', () => {
    expect(() => checkDeduction({ name: 'x', class: 'contractual', basis: 'flat' })).toThrow(
      SettleError
    );
  });

  it('refuses a rated line with no rate', () => {
    expect(() => checkDeduction({ name: 'x', class: 'statutory', basis: 'gross' })).toThrow(
      SettleError
    );
  });

  it('refuses an advance taken on the gross', () => {
    expect(() =>
      checkDeduction({ name: 'a', class: 'advance', basis: 'gross', rate: 0.25 })
    ).toThrow(SettleError);
  });

  it('knows its classes and bases', () => {
    expect(DEDUCTION_CLASSES).toEqual(['statutory', 'contractual', 'advance']);
    expect(DEDUCTION_BASES).toContain('per mbf');
  });
});

describe('applyDeductions', () => {
  const result = applyDeductions(10000, 12, schedule, { outstanding: { advance: 5000 } });

  it('takes the statutory deduction first however the schedule was written', () => {
    expect(result.lines[0].name).toBe('severance tax');
  });

  it('takes the advance last', () => {
    expect(result.lines.at(-1).name).toBe('advance');
  });

  it('works out a gross based line on the gross, not the running balance', () => {
    expect(result.lines[0].amount).toBe(285);
    expect(result.lines.find((line) => line.name === 'insurance').amount).toBe(200);
  });

  it('works out the advance on what is left', () => {
    const advance = result.lines.at(-1);
    const beforeAdvance = 10000 - 285 - 200 - 150;
    expect(advance.amount).toBeCloseTo(beforeAdvance * 0.25, 2);
  });

  it('nets down to the gross less every deduction', () => {
    expect(result.net).toBeCloseTo(
      result.gross - result.lines.reduce((sum, line) => sum + line.amount, 0),
      2
    );
    expect(result.totalDeducted).toBeCloseTo(result.gross - result.net, 2);
  });

  it('reduces what is outstanding on the advance', () => {
    expect(result.outstanding.advance).toBeLessThan(5000);
  });

  it('takes nothing on an advance that is already paid off', () => {
    const paid = applyDeductions(10000, 12, schedule, { outstanding: { advance: 0 } });
    const advance = paid.lines.at(-1);
    expect(advance.amount).toBe(0);
    expect(advance.reason).toBe('nothing outstanding');
  });

  it('caps an advance at what is outstanding', () => {
    const nearlyPaid = applyDeductions(10000, 12, schedule, { outstanding: { advance: 50 } });
    const advance = nearlyPaid.lines.at(-1);
    expect(advance.amount).toBe(50);
    expect(advance.capped).toBe(true);
    expect(advance.reason).toContain('outstanding');
  });

  it('never takes a settlement negative', () => {
    const heavy = [
      { name: 'road maintenance', class: 'contractual', basis: 'flat', amount: 9000 },
      { name: 'insurance', class: 'contractual', basis: 'flat', amount: 9000 },
    ];
    const result = applyDeductions(10000, 12, heavy);
    expect(result.net).toBe(0);
    expect(result.lines[1].capped).toBe(true);
  });

  it('takes a per thousand deduction off the scale', () => {
    const perMbf = [{ name: 'yard fee', class: 'contractual', basis: 'per mbf', rate: 8 }];
    expect(applyDeductions(10000, 12, perMbf).lines[0].amount).toBe(96);
  });

  it('deducts nothing when the schedule is empty', () => {
    const result = applyDeductions(10000, 12, []);
    expect(result.net).toBe(10000);
    expect(result.totalDeducted).toBe(0);
  });

  it('refuses a negative gross', () => {
    expect(() => applyDeductions(-1, 12, schedule)).toThrow(SettleError);
  });

  it('gives a bigger tax than taking the advance first would', () => {
    const advanceFirst = 10000 * 0.25;
    const taxOnGross = result.lines[0].amount;
    expect(taxOnGross).toBe(10000 * 0.0285);
    expect(taxOnGross).toBeGreaterThan((10000 - advanceFirst) * 0.0285);
  });
});

describe('byClass', () => {
  it('groups and totals by class', () => {
    const groups = byClass(
      applyDeductions(10000, 12, schedule, { outstanding: { advance: 5000 } })
    );
    expect(groups.map((group) => group.class)).toEqual(['statutory', 'contractual', 'advance']);
    expect(groups[1].total).toBe(350);
  });

  it('leaves out a class with nothing in it', () => {
    const groups = byClass(applyDeductions(10000, 12, [schedule[2]]));
    expect(groups).toHaveLength(1);
  });
});
