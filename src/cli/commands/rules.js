/**
 * buckline rules
 *
 * Prints a scale stick and compares the rules against each other. This is a
 * reference command rather than a working one, and it exists because the
 * argument about which rule a contract should be written on is far easier to
 * have in front of a table than in the abstract.
 */

import {
  compareRules,
  crossoverDiameter,
  getRule,
  ruleIds,
  rulePolicy,
} from '../../scale/rules/index.js';
import { block, heading, table } from '../render/table.js';
import { optional, reportCommand } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

/** Rows for a printed scale stick under one rule. */
export function stickRows(ruleId, lengthFt, options = {}) {
  const { from = 6, to = 40 } = options;
  const rule = getRule(ruleId);
  const rows = [];
  for (let diameter = from; diameter <= to; diameter += 1) {
    rows.push({ diameterIn: diameter, boardFeet: rule.scale(diameter, lengthFt) });
  }
  return rows;
}

/** Rows comparing every rule at one length. */
export function comparisonRows(lengthFt, options = {}) {
  const { from = 6, to = 40 } = options;
  const rows = [];
  for (let diameter = from; diameter <= to; diameter += 1) {
    const row = { diameterIn: diameter };
    for (const entry of compareRules(diameter, lengthFt)) {
      row[entry.rule] = entry.boardFeet;
      row[`${entry.rule} ratio`] = entry.ratioToInternational;
    }
    rows.push(row);
  }
  return rows;
}

/** Runs the rules command and returns the report text. */
export function runRules(options) {
  const format = requireFormat(options.format ?? 'text');
  const lengthFt = Number(options.length ?? 16);
  const from = Number(options.from ?? 6);
  const to = Number(options.to ?? 40);

  if (options.rule) {
    const policy = rulePolicy(options.rule);
    const rows = stickRows(options.rule, lengthFt, { from, to });
    return render(format, {
      json: { policy, rows },
      csv: rows,
      text: () =>
        [
          heading(`${policy.label} scale stick, ${lengthFt} foot logs`),
          block({
            rule: policy.id,
            'deduction method': policy.deductionMethod,
            'segment length': policy.segmentFt ?? 'whole log',
            'rounds to': policy.roundsTo,
            'smallest log': `${policy.smallestDiameterIn} in`,
          }),
          '',
          table(rows, [
            { key: 'diameterIn', header: 'dia' },
            { key: 'boardFeet', header: 'bd ft' },
          ]),
        ].join('\n'),
    });
  }

  const rows = comparisonRows(lengthFt, { from, to });
  const crossings = ruleIds().map((ruleId) => ({
    rule: ruleId,
    crossover: crossoverDiameter(ruleId, lengthFt) ?? 'never in range',
  }));

  return render(format, {
    json: rows,
    csv: rows,
    text: () =>
      [
        heading(`Every rule at ${lengthFt} feet`),
        table(rows, [
          { key: 'diameterIn', header: 'dia' },
          ...ruleIds().map((ruleId) => ({ key: ruleId, header: ruleId })),
        ]),
        '',
        heading('Where each rule catches International', { rule: '-' }),
        table(crossings, ['rule', 'crossover']),
      ].join('\n'),
  });
}

/** Registers the command on a program. */
export function registerRules(program, context) {
  reportCommand(program, context, {
    name: 'rules',
    description: 'print a scale stick or compare the log rules',
    options: [
      optional('-r, --rule <rule>', 'print one rule instead of comparing them all'),
      optional('-l, --length <feet>', 'log length', '16'),
      optional('--from <inches>', 'smallest diameter', '6'),
      optional('--to <inches>', 'largest diameter', '40'),
    ],
    run: (options) => runRules(options),
  });
}
