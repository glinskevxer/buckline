/**
 * The documents, at their edges.
 *
 * A document with an empty section, a missing field or a number that is
 * exactly zero is the case that gets printed on the day somebody is watching,
 * and none of them are covered by a happy path test.
 */

import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { scaleTicket } from '../../src/scale/ticket.js';
import { makeAgreement } from '../../src/settle/stumpage.js';
import { makeSplit } from '../../src/settle/split.js';
import { settle } from '../../src/settle/statement.js';
import { rollUp } from '../../src/settle/period.js';
import { scaleTicketDocument, settlementDocument } from '../../src/report/documents.js';
import { periodStatementDocument } from '../../src/report/period-statement.js';
import { document, section } from '../../src/report/layout.js';

function log(id, axis, lengthFt, defects = []) {
  return makeLog({
    id,
    species: 'red oak',
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
    defects,
  });
}

const agreement = makeAgreement({
  id: 'A-1',
  tractId: 'T-7',
  landowner: 'E. Whitlock',
  rates: [{ species: 'red oak', perMbf: 380 }],
});

describe('a scale ticket with nothing optional on it', () => {
  const ticket = scaleTicket({ rule: 'doyle', logs: [log('L-1', 17.4, 16)] });
  const printed = scaleTicketDocument(ticket);

  it('still heads itself', () => {
    expect(printed.split('\n')[0]).toBe('Scale ticket');
  });

  it('leaves the missing fields blank rather than printing undefined', () => {
    expect(printed).not.toContain('undefined');
    expect(printed).not.toContain('null');
  });

  it('leaves the cull section out entirely', () => {
    expect(printed).not.toContain('Culled');
  });

  it('never leaves two blank lines together', () => {
    expect(printed).not.toContain('\n\n\n');
  });
});

describe('a settlement with one line and no deductions', () => {
  const statement = settle({
    statementId: 'ST-1',
    loadId: 'LD-1',
    scaledOn: '2025-07-24',
    graded: [{ species: 'red oak', grade: 'F1', netBoardFeet: 1000 }],
    agreement,
    split: makeSplit({ kind: 'share', landownerShare: 0.5, loggerShare: 0.5 }),
    deductionSchedule: [],
  });
  const printed = settlementDocument(statement);

  it('prints the deduction heading with nothing under it', () => {
    expect(printed).not.toContain('Deductions');
  });

  it('still shows the summary and the signature lines', () => {
    expect(printed).toContain('landowner');
    expect(printed).toContain('date');
  });

  it('says the index was not read', () => {
    expect(printed).toContain('not read');
  });

  it('never leaves two blank lines together', () => {
    expect(printed).not.toContain('\n\n\n');
  });
});

describe('a period with one load and no clauses', () => {
  const statement = settle({
    statementId: 'ST-1',
    loadId: 'LD-1',
    scaledOn: '2025-07-08',
    graded: [{ species: 'red oak', grade: 'F1', netBoardFeet: 1000 }],
    agreement,
    split: makeSplit({ kind: 'residual', cutAndHaulPerMbf: 120 }),
    deductionSchedule: [],
  });
  const period = rollUp([statement], agreement, { period: '2025-07' });
  const printed = periodStatementDocument(period, [statement]);

  it('prints without a minimum volume note', () => {
    expect(printed).not.toContain('calls for');
  });

  it('prints without the advance lines', () => {
    expect(printed).not.toContain('advance brought forward');
  });

  it('prints the species breakdown for one species', () => {
    expect(printed).toContain('By species');
  });

  it('leaves the species breakdown out when told to', () => {
    expect(periodStatementDocument(period, [statement], { showSpecies: false })).not.toContain(
      'By species'
    );
  });
});

describe('the layout at its edges', () => {
  it('renders a document of nothing as nothing', () => {
    expect(document([])).toBe('');
    expect(document([null, undefined, ''])).toBe('');
  });

  it('renders a section with only a title as nothing', () => {
    expect(section({ title: 'Culled' })).toBeNull();
  });

  it('renders a one row table without a totals line', () => {
    expect(section({ rows: [{ a: 1 }] }).split('\n')).toHaveLength(3);
  });

  it('renders a value of exactly zero rather than dropping it', () => {
    expect(section({ fields: { gross: 0 } })).toBe('gross: 0');
  });

  it('renders a false value as a word', () => {
    expect(section({ rows: [{ cull: false }] })).toContain('no');
  });
});
