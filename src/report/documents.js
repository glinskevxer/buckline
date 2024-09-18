/**
 * The documents.
 *
 * A scale ticket and a settlement statement are documents, not command
 * output. They get printed, signed, posted and argued over, and the same
 * document has to come out of the command line, out of the yard book and out
 * of a rerun six months later looking identical. So they are built here and
 * the command line only decides where the text goes.
 *
 * Every document carries a footer saying what produced it and under what
 * terms. That footer has settled more arguments than any other line in this
 * program.
 */

import { block, heading, money, table } from '../cli/render/table.js';
import { cullReport, deductionShare } from '../scale/ticket.js';
import { statementSummary } from '../settle/statement.js';

/** The scale ticket, as it is printed and handed over. */
export function scaleTicketDocument(ticket, options = {}) {
  const { copies = ['mill', 'seller'], producedBy = 'buckline' } = options;
  const parts = [
    heading(`Scale ticket ${ticket.ticketId ?? ''}`.trim()),
    block({
      load: ticket.loadId ?? '',
      tract: ticket.tractId ?? '',
      rule: ticket.ruleLabel,
      scaler: ticket.scaledBy ?? '',
      logs: ticket.logCount,
      culled: ticket.culledCount,
    }),
    '',
    table(
      ticket.lines,
      [
        { key: 'logId', header: 'log' },
        { key: 'grossBoardFeet', header: 'gross' },
        { key: 'netBoardFeet', header: 'net' },
        { key: 'cullReason', header: 'note' },
      ],
      {
        totals: {
          logId: 'total',
          grossBoardFeet: ticket.grossBoardFeet,
          netBoardFeet: ticket.netBoardFeet,
        },
      }
    ),
    '',
    block({
      gross: ticket.grossBoardFeet,
      deduction: ticket.deductionBoardFeet,
      net: ticket.netBoardFeet,
      'deduction share': percent(deductionShare(ticket)),
    }),
  ];

  const culls = cullReport(ticket);
  if (culls.length > 0) {
    parts.push('', heading('Culled', { rule: '-' }));
    parts.push(
      table(culls, [
        { key: 'logId', header: 'log' },
        { key: 'grossBoardFeet', header: 'gross' },
        { key: 'reason', header: 'reason' },
      ])
    );
  }

  parts.push('', footer(producedBy, `scaled ${ticket.ruleLabel}`), '', copyLines(copies));
  return parts.join('\n');
}

/** The settlement statement, as it is printed and posted. */
export function settlementDocument(statement, options = {}) {
  const { producedBy = 'buckline' } = options;
  const parts = [
    heading(`Settlement ${statement.statementId}`),
    block({
      load: statement.loadId,
      'scaled on': statement.scaledOn,
      agreement: statement.agreement,
      'market index': statement.marketIndex ?? 'not read',
    }),
    '',
    table(
      statement.lines,
      [
        { key: 'species', header: 'species' },
        { key: 'grade', header: 'grade' },
        { key: 'netBoardFeet', header: 'net bf' },
        { key: 'basePerMbf', header: 'base' },
        { key: 'perMbf', header: 'rate' },
        { key: 'value', header: 'value', format: (value) => money(value) },
      ],
      {
        totals: {
          species: 'total',
          netBoardFeet: Math.round(statement.netMbf * 1000),
          value: statement.gross,
        },
      }
    ),
    '',
    heading('Deductions', { rule: '-' }),
    table(statement.deductions.lines, [
      { key: 'name', header: 'deduction' },
      { key: 'class', header: 'class' },
      { key: 'basis', header: 'basis' },
      { key: 'amount', header: 'amount', format: (value) => money(value) },
      { key: 'reason', header: 'note' },
    ]),
    '',
    table(statementSummary(statement), [
      { key: 'label', header: '' },
      { key: 'amount', header: 'amount', format: (value) => money(value) },
    ]),
  ];

  if (statement.underwater.underwater) {
    parts.push('', `WARNING: ${statement.underwater.parties.join(' and ')} owe money on this load`);
  }

  parts.push(
    '',
    footer(producedBy, `agreement ${statement.agreement}`),
    '',
    signatureLines(['landowner', 'logger'])
  );
  return parts.join('\n');
}

/** The line at the bottom of every document. */
export function footer(producedBy, terms) {
  return `produced by ${producedBy} under ${terms}`;
}

/** The copy markings, one line each. */
export function copyLines(copies) {
  return copies.map((name) => `copy: ${name}`).join('\n');
}

/** Blank lines for signing. */
export function signatureLines(parties) {
  return parties
    .map((party) => `${party.padEnd(12)} ${'.'.repeat(30)}  date ${'.'.repeat(12)}`)
    .join('\n');
}

function percent(share) {
  return `${Math.round(share * 1000) / 10} percent`;
}
