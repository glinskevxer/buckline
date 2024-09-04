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
import { auditStatement, settle, statementSummary } from '../../settle/statement.js';
import { SettleError } from '../../settle/stumpage.js';
import { block, heading, money, table } from '../render/table.js';
import { csv } from '../render/csv.js';
import { json } from '../render/json.js';
import { emit, readData } from '../io.js';
import { requireFormat } from '../program.js';

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
  return textStatement(statement);
}

function normaliseLine(line) {
  return {
    species: line.species,
    grade: line.grade,
    netBoardFeet:
      typeof line.netBoardFeet === 'string' ? Number(line.netBoardFeet) : line.netBoardFeet,
  };
}

function textStatement(statement) {
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
        totals: { species: 'total', netBoardFeet: statement.netMbf * 1000, value: statement.gross },
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
  return parts.join('\n');
}

/** Registers the command on a program. */
export function registerSettle(program, context) {
  program
    .command('settle')
    .description('turn a graded load into a settlement statement')
    .requiredOption('-g, --graded <file>', 'the graded and scaled lines')
    .requiredOption('-t, --terms <file>', 'the agreement, split and deduction schedule')
    .option('--load <id>', 'load number')
    .option('--statement <id>', 'statement number')
    .option('--scaled-on <date>', 'the date the load was scaled')
    .option('--index <value>', 'the market index published on the scale date')
    .option('--diesel <value>', 'diesel price for the fuel surcharge')
    .option('--zone <zone>', 'haul zone')
    .option('-f, --format <format>', 'text, csv or json', 'text')
    .option('-o, --output <file>', 'write to a file instead of the screen')
    .action((options) => {
      emit(context, runSettle(options, context), options);
    });
}
