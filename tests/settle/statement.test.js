import { describe, expect, it } from 'vitest';
import { SettleError, makeAgreement } from '../../src/settle/stumpage.js';
import { makeSplit } from '../../src/settle/split.js';
import { makeRateCard } from '../../src/settle/haul.js';
import { auditStatement, settle, statementSummary } from '../../src/settle/statement.js';

const agreement = makeAgreement({
  id: 'A-1',
  tractId: 'T-7',
  landowner: 'E. Whitlock',
  rates: [
    { species: 'red oak', grade: 'F1', perMbf: 620 },
    { species: 'red oak', perMbf: 380 },
    { species: 'yellow poplar', perMbf: 210 },
  ],
  slidingScale: { baseIndex: 100, triggerIndex: 110, share: 0.5 },
  advance: 5000,
  advanceRecoveryShare: 0.2,
});

const split = makeSplit({
  kind: 'residual',
  cutAndHaulPerMbf: 190,
  bears: { insurance: 'logger', haul: 'logger' },
});

const rateCard = makeRateCard({
  carrier: 'Beazley Hauling',
  minimumPerLoad: 180,
  zones: [{ id: 'zone 2', minMiles: 26, maxMiles: 60, basis: 'per mbf', rate: 62 }],
});

const base = {
  statementId: 'ST-1',
  loadId: 'LD-19',
  scaledOn: '2024-08-06',
  graded: [
    { species: 'red oak', grade: 'F1', netBoardFeet: 3200 },
    { species: 'red oak', grade: 'F3', netBoardFeet: 1600 },
    { species: 'yellow poplar', grade: 'F2', netBoardFeet: 900 },
  ],
  agreement,
  split,
  deductionSchedule: [
    { name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 },
    { name: 'insurance', class: 'contractual', basis: 'gross', rate: 0.02 },
  ],
  marketIndex: 105,
};

describe('settle', () => {
  const statement = settle(base);

  it('prices every line at its own rate', () => {
    expect(statement.lines[0].perMbf).toBe(620);
    expect(statement.lines[1].perMbf).toBe(380);
    expect(statement.lines[2].perMbf).toBe(210);
  });

  it('sums the gross from the lines', () => {
    const expected = 3.2 * 620 + 1.6 * 380 + 0.9 * 210;
    expect(statement.gross).toBeCloseTo(expected, 2);
  });

  it('totals the volume in thousands', () => {
    expect(statement.netMbf).toBeCloseTo(5.7, 4);
  });

  it('leaves the rate alone under the trigger', () => {
    expect(statement.lines.every((line) => line.slidingApplied === false)).toBe(true);
  });

  it('lifts every rate once the index passes the trigger', () => {
    const hot = settle({ ...base, marketIndex: 130 });
    expect(hot.lines.every((line) => line.slidingApplied)).toBe(true);
    expect(hot.gross).toBeGreaterThan(statement.gross);
  });

  it('reads the index that was published, not today', () => {
    const cold = settle({ ...base, marketIndex: 90 });
    expect(cold.gross).toBe(statement.gross);
  });

  it('adds no haul line when there is no rate card', () => {
    expect(statement.haul).toBeNull();
    expect(statement.deductions.lines.map((line) => line.name)).not.toContain('haul');
  });

  it('bills the haul as a deduction when there is a card and a zone', () => {
    const hauled = settle({ ...base, rateCard, haulZone: 'zone 2' });
    expect(hauled.haul.total).toBeGreaterThan(0);
    expect(hauled.deductions.lines.map((line) => line.name)).toContain('haul');
  });

  it('charges the haul to whoever the split says bears it', () => {
    const hauled = settle({ ...base, rateCard, haulZone: 'zone 2' });
    const line = hauled.division.deductionDetail.find((row) => row.name === 'haul');
    expect(line.bearer).toBe('logger');
  });

  it('divides what is left after deductions, not the gross', () => {
    const divided = statement.division.landowner.gross + statement.division.logger.gross;
    expect(divided).toBeCloseTo(statement.deductions.net, 2);
  });

  it('reports the advance recovery separately', () => {
    const withAdvance = settle({ ...base, outstanding: { advance: 5000 } });
    expect(withAdvance.advance.recovered).toBeGreaterThan(0);
  });

  it('refuses a statement with no identity, date or lines', () => {
    expect(() => settle({ ...base, statementId: '' })).toThrow(SettleError);
    expect(() => settle({ ...base, scaledOn: '' })).toThrow(SettleError);
    expect(() => settle({ ...base, graded: [] })).toThrow(SettleError);
  });

  it('refuses a line with no scale', () => {
    expect(() => settle({ ...base, graded: [{ species: 'red oak', grade: 'F1' }] })).toThrow(
      SettleError
    );
  });

  it('refuses a species the agreement has no rate for', () => {
    expect(() =>
      settle({ ...base, graded: [{ species: 'white oak', grade: 'F1', netBoardFeet: 100 }] })
    ).toThrow(SettleError);
  });
});

describe('statementSummary', () => {
  it('reads top to bottom', () => {
    const rows = statementSummary(settle(base));
    expect(rows.map((row) => row.label)).toEqual(['gross', 'deductions', 'landowner', 'logger']);
  });

  it('shows deductions as a negative', () => {
    const rows = statementSummary(settle(base));
    expect(rows[1].amount).toBeLessThan(0);
  });

  it('puts the haul in when there was one', () => {
    const rows = statementSummary(settle({ ...base, rateCard, haulZone: 'zone 2' }));
    expect(rows.map((row) => row.label)).toContain('haul');
  });
});

describe('auditStatement', () => {
  it('passes a statement that adds up', () => {
    expect(auditStatement(settle(base))).toEqual({ clean: true, problems: [] });
  });

  it('catches a gross that does not match its lines', () => {
    const statement = settle(base);
    statement.gross += 100;
    expect(auditStatement(statement).problems).toContain(
      'gross does not equal the sum of its lines'
    );
  });

  it('catches deductions that do not reconcile', () => {
    const statement = settle(base);
    statement.deductions.totalDeducted += 50;
    expect(auditStatement(statement).clean).toBe(false);
  });

  it('catches a split that does not add back', () => {
    const statement = settle(base);
    statement.division.landowner.gross += 25;
    expect(auditStatement(statement).problems).toContain(
      'the split does not add back to what was divided'
    );
  });

  it('catches negative volume', () => {
    const statement = settle(base);
    statement.netMbf = -1;
    expect(auditStatement(statement).clean).toBe(false);
  });
});
