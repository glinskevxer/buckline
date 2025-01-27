/**
 * buckline settle
 *
 * Turns a graded load into a settlement statement. The statement is audited
 * against itself before it is printed, and a statement that does not reconcile
 * is not printed at all: the office would rather have nothing than a document
 * with a total that does not add up, because the second one gets posted.
 */

import { makeAgreement } from '../../settle/stumpage.js';
import { makeSplit } from '../../settle/split.js';
import { makeRateCard } from '../../settle/haul.js';
import { auditStatement, settle } from '../../settle/statement.js';
import { settlementDocument } from '../../report/documents.js';
import { SettleError } from '../../settle/stumpage.js';
import { csv } from '../render/csv.js';
import { json } from '../render/json.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { VERSION } from '../program.js';
import { requireFormat } from '../render/index.js';

/** Runs the settle command and returns the statement text. */
export function runSettle(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const terms = readData(context, options.terms);
  const graded = readData(context, options.graded);

  const agreement = makeAgreement(terms.agreement);
  const split = makeSplit(terms.split);
  const rateCard = terms.rateCard ? makeRateCard(terms.rateCard) : null;

  const statement = settle({
    statementId: options.statement ?? `ST-${options.load ?? 'x'}`,
    loadId: options.load ?? terms.loadId ?? 'unknown',
    scaledOn: options.scaledOn ?? terms.scaledOn,
    graded: graded.map(normaliseLine),
    agreement,
    split,
    rateCard,
    haulZone: options.zone ?? terms.haulZone ?? null,
    deductionSchedule: terms.deductions ?? [],
    marketIndex: options.index === undefined ? (terms.marketIndex ?? null) : Number(options.index),
    dieselPerGallon:
      options.diesel === undefined ? (terms.dieselPerGallon ?? null) : Number(options.diesel),
    outstanding: terms.outstanding ?? {},
    netWeightLb: terms.netWeightLb,
  });

  const audit = auditStatement(statement);
  if (!audit.clean) {
    throw new SettleError(`statement does not reconcile: ${audit.problems.join('; ')}`, {
      path: 'statement',
      details: audit,
    });
  }

  if (format === 'json') return json(statement);
  if (format === 'csv') return csv(statement.lines);
  return settlementDocument(statement, { producedBy: `buckline ${VERSION}` });
}

function normaliseLine(line) {
  return {
    species: line.species,
    grade: line.grade,
    netBoardFeet:
      typeof line.netBoardFeet === 'string' ? Number(line.netBoardFeet) : line.netBoardFeet,
  };
}

/** Registers the command on a program. */
export function registerSettle(program, context) {
  reportCommand(program, context, {
    name: 'settle',
    description: 'turn a graded load into a settlement statement',
    options: [
      required('-g, --graded <file>', 'the graded and scaled lines'),
      required('-t, --terms <file>', 'the agreement, split and deduction schedule'),
      optional('--load <id>', 'load number'),
      optional('--statement <id>', 'statement number'),
      optional('--scaled-on <date>', 'the date the load was scaled'),
      optional('--index <value>', 'the market index published on the scale date'),
      optional('--diesel <value>', 'diesel price for the fuel surcharge'),
      optional('--zone <zone>', 'haul zone'),
    ],
    run: runSettle,
  });
}
