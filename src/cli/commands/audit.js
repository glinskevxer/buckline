/**
 * buckline audit
 *
 * The supervisor's commands. Compare a check scale against the ticket it was
 * checking, and look at what a run of check scales says about a scaler.
 *
 * The reason both are here rather than one being part of the scale command is
 * that they answer to a different person. A scaler runs the scale command all
 * day; the audit commands are run by whoever is allowed to suspend them, and
 * separating them keeps that clear on a shared terminal.
 */

import { checkScale, scalerDrift } from '../../scale/audit.js';
import {
  admissible,
  describeScaler,
  makeScaler,
  passRate,
  reviewChecks,
} from '../../model/scaler.js';
import { block, heading, table } from '../render/table.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

/** Compares a check scale against the ticket. */
export function runCheck(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const ticket = readData(context, options.ticket);
  const lines = readData(context, options.check).map((line) => ({
    logId: line.logId,
    netBoardFeet: Number(line.netBoardFeet),
  }));

  const result = checkScale(ticket, lines, {
    tolerance: {
      perLogShare: Number(options.perLog ?? 0.05),
      loadShare: Number(options.perLoad ?? 0.02),
    },
  });

  return render(format, {
    json: result,
    csv: result.comparisons,
    text: () =>
      [
        heading(`Check scale on ticket ${result.ticketId ?? ''}`.trim()),
        block({
          rule: result.rule,
          sampled: `${result.sampleSize} logs, ${Math.round(result.sampleShare * 100)} percent`,
          'original net': result.originalNetBoardFeet,
          'check net': result.checkNetBoardFeet,
          difference: `${result.differenceBoardFeet} (${result.direction})`,
          verdict: result.verdict,
        }),
        '',
        table(result.comparisons, [
          { key: 'logId', header: 'log' },
          { key: 'originalNet', header: 'original' },
          { key: 'checkNet', header: 'check' },
          { key: 'differenceBoardFeet', header: 'difference' },
          { key: 'withinTolerance', header: 'in tolerance' },
        ]),
        result.logsOutsideTolerance.length > 0
          ? `\nOutside tolerance: ${result.logsOutsideTolerance.join(', ')}`
          : '',
      ].join('\n'),
  });
}

/** What a run of check scales says about a scaler. */
export function runScalerReview(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const scaler = makeScaler(readData(context, options.scaler));
  const checks = readData(context, options.checks);
  const onDate = options.asOf ?? new Date().toISOString().slice(0, 10);

  const drift = scalerDrift(checks);
  const review = reviewChecks(scaler, checks);
  const standing = admissible(review.scaler, options.rule ?? scaler.endorsements[0], onDate);

  return render(format, {
    json: { scaler: review.scaler, drift, review, standing },
    csv: checks,
    text: () =>
      [
        heading(`Review of ${scaler.name}`),
        block({
          certificate: describeScaler(review.scaler, onDate),
          checks: checks.length,
          'pass rate': passRate(checks) ?? 'no checks',
          bias: drift.bias,
          'mean difference': `${Math.round(drift.meanShare * 1000) / 10} percent`,
          consistent: drift.consistent,
        }),
        '',
        review.changed
          ? `SUSPENDED: ${review.reasons.join('; ')}`
          : 'No change to the certificate.',
        '',
        standing.admissible
          ? 'This scaler may scale under that rule today.'
          : `Not admissible: ${standing.reasons.join('; ')}`,
      ].join('\n'),
  });
}

/** Registers the audit commands on a program. */
export function registerAudit(program, context) {
  const audit = program.command('audit').description('supervisor checks');

  reportCommand(audit, context, {
    name: 'check',
    description: 'compare a check scale against the ticket it checked',
    options: [
      required('-t, --ticket <file>', 'the original ticket'),
      required('-c, --check <file>', 'the check scale lines'),
      optional('--per-log <share>', 'per log tolerance', '0.05'),
      optional('--per-load <share>', 'load tolerance', '0.02'),
    ],
    run: runCheck,
  });

  reportCommand(audit, context, {
    name: 'scaler',
    description: 'what a run of check scales says about a scaler',
    options: [
      required('-s, --scaler <file>', 'the scaler record'),
      required('-c, --checks <file>', 'the check scales'),
      optional('-r, --rule <rule>', 'the rule to test admissibility against'),
      optional('--as-of <date>', 'the date to read the certificate at'),
    ],
    run: runScalerReview,
  });
}
