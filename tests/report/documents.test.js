import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { scaleTicket } from '../../src/scale/ticket.js';
import { makeAgreement } from '../../src/settle/stumpage.js';
import { makeSplit } from '../../src/settle/split.js';
import { settle } from '../../src/settle/statement.js';
import {
  copyLines,
  footer,
  scaleTicketDocument,
  settlementDocument,
  signatureLines,
} from '../../src/report/documents.js';

function log(id, species, axis, lengthFt, defects = []) {
  return makeLog({
    id,
    species,
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
    defects,
  });
}

const ticket = scaleTicket({
  ticketId: 'S-4417',
  loadId: 'LD-19',
  tractId: 'T-7',
  scaledBy: 'D. Rakes',
  rule: 'doyle',
  logs: [
    log('L-1', 'red oak', 17.4, 16),
    log('L-2', 'white oak', 21.8, 12),
    log('L-3', 'yellow poplar', 13.7, 10, [
      { type: 'heart rot', widthIn: 10, depthIn: 10, lengthFt: 10 },
    ]),
  ],
});

const statement = settle({
  statementId: 'ST-1',
  loadId: 'LD-19',
  scaledOn: '2024-09-12',
  graded: [{ species: 'red oak', grade: 'F1', netBoardFeet: 3200 }],
  agreement: makeAgreement({
    id: 'A-1',
    tractId: 'T-7',
    landowner: 'E. Whitlock',
    rates: [{ species: 'red oak', grade: 'F1', perMbf: 620 }],
  }),
  split: makeSplit({ kind: 'residual', cutAndHaulPerMbf: 190 }),
  deductionSchedule: [{ name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 }],
});

describe('scaleTicketDocument', () => {
  const document = scaleTicketDocument(ticket);

  it('heads the ticket with its number', () => {
    expect(document.split('\n')[0]).toBe('Scale ticket S-4417');
  });

  it('names the rule in words', () => {
    expect(document).toContain('Doyle');
  });

  it('lists every log and totals them', () => {
    expect(document).toContain('L-1');
    expect(document).toContain('total');
  });

  it('lists the culls separately', () => {
    expect(document).toContain('Culled');
    expect(document).toContain('L-3');
  });

  it('leaves the cull section out when nothing was culled', () => {
    const clean = scaleTicket({
      ...ticket,
      rule: 'doyle',
      logs: [log('L-1', 'red oak', 17.4, 16)],
    });
    expect(scaleTicketDocument(clean)).not.toContain('Culled');
  });

  it('reports the deduction share as a percentage', () => {
    expect(document).toContain('percent');
  });

  it('says what produced it and under what terms', () => {
    expect(document).toContain('produced by buckline under scaled Doyle');
  });

  it('marks the copies', () => {
    expect(document).toContain('copy: mill');
    expect(document).toContain('copy: seller');
  });

  it('takes a different set of copies', () => {
    expect(scaleTicketDocument(ticket, { copies: ['file'] })).not.toContain('copy: mill');
  });
});

describe('settlementDocument', () => {
  const document = settlementDocument(statement);

  it('heads the statement with its number', () => {
    expect(document.split('\n')[0]).toBe('Settlement ST-1');
  });

  it('shows the base rate beside the rate charged', () => {
    expect(document).toContain('base');
    expect(document).toContain('rate');
  });

  it('lists the deductions', () => {
    expect(document).toContain('severance tax');
  });

  it('leaves room to sign', () => {
    expect(document).toContain('landowner');
    expect(document).toContain('date');
  });

  it('names the agreement in the footer', () => {
    expect(document).toContain('agreement A-1');
  });

  it('warns when a party ends up owing money', () => {
    const thin = settle({
      ...statement,
      statementId: 'ST-2',
      graded: [{ species: 'red oak', grade: 'F1', netBoardFeet: 100 }],
      agreement: makeAgreement({
        id: 'A-1',
        tractId: 'T-7',
        landowner: 'E. Whitlock',
        rates: [{ species: 'red oak', grade: 'F1', perMbf: 620 }],
      }),
      split: makeSplit({ kind: 'residual', cutAndHaulPerMbf: 900 }),
      deductionSchedule: [
        { name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 },
      ],
    });
    expect(settlementDocument(thin)).toContain('WARNING');
  });
});

describe('the shared parts', () => {
  it('writes a footer naming the producer and the terms', () => {
    expect(footer('buckline 0.5.0', 'agreement A-1')).toBe(
      'produced by buckline 0.5.0 under agreement A-1'
    );
  });

  it('writes one copy line per copy', () => {
    expect(copyLines(['a', 'b']).split('\n')).toHaveLength(2);
  });

  it('writes a signature line per party with room for a date', () => {
    const lines = signatureLines(['landowner', 'logger']).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('date');
  });
});
