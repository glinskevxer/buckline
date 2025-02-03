/**
 * buckline period
 *
 * Rolls a month of settled loads up into one statement for the landowner.
 *
 * It reads statements that have already been settled rather than settling them
 * again. That is the whole design of the command: a statement that has been
 * paid is a fact, and a period statement that quietly recomputes it will
 * disagree with the cheque the landowner already banked as soon as a price
 * list or a rate changes.
 */

import { makeAgreement } from '../../settle/stumpage.js';
import { periodOf, rollUp } from '../../settle/period.js';
import {
  accountHistory,
  periodStatementDocument,
  periodSummaryLine,
} from '../../report/period-statement.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';
import { VERSION } from '../program.js';

/** Reads the statements file and keeps the ones in the period asked for. */
export function statementsFor(context, path, period) {
  const raw = readData(context, path);
  const statements = Array.isArray(raw) ? raw : [raw];
  if (statements.length === 0) {
    throw new TypeError('the statements file holds nothing');
  }
  for (const statement of statements) {
    if (!statement.scaledOn || !statement.division) {
      throw new TypeError(`${statement.statementId ?? 'a statement'} is not a settled statement`);
    }
  }
  return period ? statements.filter((s) => periodOf(s.scaledOn) === period) : statements;
}

/** Rolls the period up and prints the statement. */
export function runPeriod(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const terms = readData(context, options.terms);
  const agreement = makeAgreement(terms.agreement);
  const statements = statementsFor(context, options.statements, options.period);

  if (statements.length === 0) {
    throw new TypeError(`nothing was scaled in ${options.period}`);
  }

  const period = rollUp(statements, agreement, {
    period: options.period,
    landowner: options.landowner ?? terms.landowner,
    openingAdvance: options.advance === undefined ? 0 : Number(options.advance),
  });

  return render(format, {
    json: period,
    csv: period.loads,
    text: () =>
      periodStatementDocument(period, statements, {
        producedBy: `buckline ${VERSION}`,
        showSpecies: options.species !== false,
      }),
  });
}

/** A running account across several periods. */
export function runAccount(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const terms = readData(context, options.terms);
  const agreement = makeAgreement(terms.agreement);
  const statements = statementsFor(context, options.statements, null);

  const periods = [...new Set(statements.map((statement) => periodOf(statement.scaledOn)))].sort();
  let advance = options.advance === undefined ? 0 : Number(options.advance);

  const rolled = periods.map((name) => {
    const inPeriod = statements.filter((statement) => periodOf(statement.scaledOn) === name);
    const period = rollUp(inPeriod, agreement, {
      period: name,
      landowner: terms.landowner,
      openingAdvance: advance,
    });
    advance = period.advance.remaining;
    return period;
  });

  return render(format, {
    json: accountHistory(rolled),
    csv: accountHistory(rolled),
    text: () => rolled.map((period) => periodSummaryLine(period)).join('\n'),
  });
}

/** Registers the period commands on a program. */
export function registerPeriod(program, context) {
  const period = program.command('period').description('landowner statements by period');

  reportCommand(period, context, {
    name: 'statement',
    description: 'roll a period up into one statement',
    options: [
      required('-s, --statements <file>', 'the settled statements'),
      required('-t, --terms <file>', 'the agreement'),
      optional('-p, --period <period>', 'the period, as a year and month'),
      optional('--landowner <name>', 'who it is addressed to'),
      optional('--advance <amount>', 'advance brought forward', '0'),
    ],
    run: runPeriod,
  });

  reportCommand(period, context, {
    name: 'account',
    description: 'a running account across every period on file',
    options: [
      required('-s, --statements <file>', 'the settled statements'),
      required('-t, --terms <file>', 'the agreement'),
      optional('--advance <amount>', 'advance brought forward', '0'),
    ],
    run: runAccount,
  });
}
