/**
 * The period statement document.
 *
 * What goes in the envelope at the end of the month. It has to stand on its
 * own: the landowner has not seen the per load statements and will not ask for
 * them, so every load is listed with the date it was scaled and what it paid,
 * and the clauses that only make sense across the period are shown as their
 * own lines rather than folded into a total.
 *
 * The advance line is the one that causes calls. It is shown as an opening
 * balance, an amount recovered and a closing balance, because a landowner who
 * sees only "advance recovery" and a number cannot tell whether the loan is
 * nearly paid off or has barely moved.
 */

import { round2 } from '../num.js';
import { block, heading, money, table } from '../cli/render/table.js';
import { periodBySpecies } from '../settle/period.js';
import { footer, signatureLines } from './documents.js';

/** The period statement, ready to print. */
export function periodStatementDocument(period, statements, options = {}) {
  const { producedBy = 'buckline', showSpecies = true } = options;

  const parts = [
    heading(`Statement of account, ${period.period ?? 'period'}`),
    block({
      landowner: period.landowner ?? '',
      agreement: period.agreement,
      loads: period.loadCount,
      'thousand board feet': period.netMbf,
    }),
    '',
    table(
      period.loads,
      [
        { key: 'scaledOn', header: 'scaled' },
        { key: 'loadId', header: 'load' },
        { key: 'netMbf', header: 'mbf' },
        { key: 'gross', header: 'gross', format: (value) => money(value) },
        { key: 'deductions', header: 'deducted', format: (value) => money(value) },
        { key: 'landowner', header: 'to you', format: (value) => money(value) },
      ],
      {
        totals: {
          scaledOn: 'total',
          netMbf: period.netMbf,
          gross: period.gross,
          deductions: period.deductions,
          landowner: period.landownerNet,
        },
      }
    ),
  ];

  if (showSpecies && statements) {
    parts.push('', heading('By species', { rule: '-' }));
    parts.push(
      table(periodBySpecies(statements), [
        { key: 'species', header: 'species' },
        { key: 'netBoardFeet', header: 'bd ft' },
        { key: 'perMbf', header: 'per mbf', format: (value) => money(value) },
        { key: 'value', header: 'value', format: (value) => money(value) },
      ])
    );
  }

  parts.push('', heading('Account', { rule: '-' }), block(accountLines(period)));

  if (period.minimumVolume.applies) {
    parts.push(
      '',
      `The agreement calls for ${period.minimumVolume.shortfallMbf} thousand board feet more than was cut this period.`
    );
  }

  parts.push(
    '',
    footer(producedBy, `agreement ${period.agreement}`),
    '',
    signatureLines(['landowner'])
  );
  return parts.join('\n');
}

/** The account section, which is the part that gets read. */
export function accountLines(period) {
  const lines = {
    'loads this period': money(period.landownerNet),
  };
  if (period.minimumVolume.charge > 0) {
    lines['minimum volume'] = money(period.minimumVolume.charge);
  }
  if (period.advance.opening > 0) {
    lines['advance brought forward'] = money(period.advance.opening);
    lines['advance recovered'] = money(-period.advance.recovered);
    lines['advance still owing'] = money(period.advance.remaining);
  }
  lines['payable to you'] = money(period.payable);
  return lines;
}

/** A one line summary for a covering letter or a spreadsheet row. */
export function periodSummaryLine(period) {
  return [
    period.period ?? '',
    period.landowner ?? '',
    `${period.loadCount} loads`,
    `${period.netMbf} mbf`,
    money(period.payable),
  ]
    .filter(Boolean)
    .join('  ');
}

/** Every period for a landowner, newest first, for a running account. */
export function accountHistory(periods) {
  return [...periods]
    .sort((a, b) => String(b.period).localeCompare(String(a.period)))
    .map((period) => ({
      period: period.period,
      loads: period.loadCount,
      netMbf: period.netMbf,
      payable: round2(period.payable),
      advanceOwing: round2(period.advance.remaining),
    }));
}
