import { describe, expect, it } from 'vitest';
import { makeAgreement } from '../../src/settle/stumpage.js';
import { makeSplit } from '../../src/settle/split.js';
import { settle } from '../../src/settle/statement.js';
import { rollUp } from '../../src/settle/period.js';
import {
  accountHistory,
  accountLines,
  periodStatementDocument,
  periodSummaryLine,
} from '../../src/report/period-statement.js';

const agreement = makeAgreement({
  id: 'A-1',
  tractId: 'T-7',
  landowner: 'E. Whitlock',
  rates: [
    { species: 'red oak', grade: 'F1', perMbf: 620 },
    { species: 'red oak', perMbf: 380 },
  ],
  minimumVolumeMbf: 30,
  advance: 5000,
  advanceRecoveryShare: 0.2,
});

const split = makeSplit({ kind: 'residual', cutAndHaulPerMbf: 120 });

function statement(id, scaledOn, netBoardFeet, grade = 'F1') {
  return settle({
    statementId: id,
    loadId: `LD-${id}`,
    scaledOn,
    graded: [{ species: 'red oak', grade, netBoardFeet }],
    agreement,
    split,
    deductionSchedule: [
      { name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 },
    ],
  });
}

const statements = [
  statement('ST-1', '2025-01-06', 4200),
  statement('ST-2', '2025-01-14', 5100, 'F3'),
];

const period = rollUp(statements, agreement, {
  period: '2025-01',
  openingAdvance: 5000,
});

describe('periodStatementDocument', () => {
  const document = periodStatementDocument(period, statements);

  it('heads the statement with the period', () => {
    expect(document.split('\n')[0]).toBe('Statement of account, 2025-01');
  });

  it('lists every load with the date it was scaled', () => {
    expect(document).toContain('2025-01-06');
    expect(document).toContain('LD-ST-2');
  });

  it('totals the loads', () => {
    expect(document).toContain('total');
  });

  it('breaks the period down by species', () => {
    expect(document).toContain('By species');
    expect(document).toContain('red oak');
  });

  it('can be told to leave the species breakdown out', () => {
    expect(periodStatementDocument(period, statements, { showSpecies: false })).not.toContain(
      'By species'
    );
  });

  it('shows the advance as three lines rather than one', () => {
    expect(document).toContain('advance brought forward');
    expect(document).toContain('advance recovered');
    expect(document).toContain('advance still owing');
  });

  it('says so when the period fell short of the minimum volume', () => {
    expect(document).toContain('thousand board feet more than was cut');
  });

  it('leaves room to sign', () => {
    expect(document).toContain('date');
  });

  it('names the agreement in the footer', () => {
    expect(document).toContain('agreement A-1');
  });

  it('prints without the statements when only the roll up is to hand', () => {
    expect(periodStatementDocument(period, null)).toContain('Statement of account');
  });
});

describe('accountLines', () => {
  it('always ends with what is payable', () => {
    expect(Object.keys(accountLines(period)).at(-1)).toBe('payable to you');
  });

  it('leaves the advance lines out when there is no advance', () => {
    const clear = rollUp(statements, agreement, { period: '2025-01', openingAdvance: 0 });
    expect(Object.keys(accountLines(clear))).not.toContain('advance brought forward');
  });

  it('shows the recovery as a negative', () => {
    expect(accountLines(period)['advance recovered']).toMatch(/^\(/);
  });
});

describe('periodSummaryLine', () => {
  it('fits on one line', () => {
    const line = periodSummaryLine(period);
    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('E. Whitlock');
    expect(line).toContain('2 loads');
  });
});

describe('accountHistory', () => {
  it('puts the newest period first', () => {
    const older = rollUp(statements, agreement, { openingAdvance: 5000 });
    const rows = accountHistory([{ ...older, period: '2024-12' }, period]);
    expect(rows[0].period).toBe('2025-01');
  });

  it('carries the advance still owing forward', () => {
    expect(accountHistory([period])[0].advanceOwing).toBeGreaterThan(0);
  });
});
