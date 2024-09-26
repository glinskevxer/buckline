/**
 * buckline report
 *
 * The reports that read several things at once. Each one takes the files it
 * needs and nothing else: there is no project file and no configuration, so a
 * report can always be reproduced from the command that made it, which is
 * written into the footer.
 */

import { makeLog } from '../../model/log.js';
import { makePriceList } from '../../price/list.js';
import { reconcile, withinNormal } from '../../report/reconciliation.js';
import { studyAssumptions, studyDeck, studySummary } from '../../report/recovery-study.js';
import { footer } from '../../report/documents.js';
import { block, heading, money, table } from '../render/table.js';
import { csv } from '../render/csv.js';
import { json } from '../render/json.js';
import { emit, readData } from '../io.js';
import { VERSION, requireFormat } from '../program.js';

function readLogs(context, path) {
  const records = readData(context, path);
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError('the log file has no logs in it');
  }
  return records.map((record) => makeLog(record));
}

/** The reconciliation report. */
export function runReconcile(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const logs = readLogs(context, options.logs);

  const result = reconcile({
    logs,
    contractRule: options.rule,
    contractNetBoardFeet: Number(options.scaled),
    tallyBoardFeet: Number(options.tallied),
    checkNetBoardFeet: options.check === undefined ? null : Number(options.check),
  });

  if (format === 'json') return json(result);
  if (format === 'csv') return csv(result.buckets);

  return [
    heading('Scale against tally'),
    block({
      rule: result.contractRule,
      'contract scale': result.contractNetBoardFeet,
      'international reference': result.referenceBoardFeet,
      'mill tally': result.tallyBoardFeet,
      gap: result.gapBoardFeet,
      'gap share': `${Math.round(result.gapShare * 1000) / 10} percent`,
      verdict: withinNormal(result) ? 'inside a normal week' : 'worth a meeting',
    }),
    '',
    table(result.buckets, [
      { key: 'name', header: 'bucket' },
      { key: 'boardFeet', header: 'bd ft' },
      { key: 'whose', header: 'whose' },
    ]),
    '',
    footer(`buckline ${VERSION}`, `contract rule ${result.contractRule}`),
  ].join('\n');
}

/** The recovery study report. */
export function runStudy(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const logs = readLogs(context, options.logs);
  const list = makePriceList(readData(context, options.prices));
  const study = studyDeck(logs, list);
  const summary = studySummary(logs, study, options.rule);

  if (format === 'json') return json({ study, summary, assumptions: studyAssumptions() });
  if (format === 'csv') return csv(study.byPattern);

  return [
    heading('Recovery study'),
    block({
      logs: study.logCount,
      'price list': list.id,
      'contract rule': options.rule,
    }),
    '',
    table(study.byPattern, [
      { key: 'pattern', header: 'pattern' },
      { key: 'boardFeet', header: 'bd ft' },
      { key: 'value', header: 'value', format: (value) => money(value) },
      { key: 'bestForLogs', header: 'best for' },
    ]),
    '',
    block({
      'best single pattern': study.bestSinglePattern,
      'one pattern for the deck': money(study.singlePatternValue),
      'picked per log': money(study.perLogValue),
      uplift: money(study.uplift),
      'recovery factor': summary.lrf,
      'overrun share': `${Math.round(summary.overrunShare * 1000) / 10} percent`,
      'value per mbf': money(summary.valuePerMbf),
    }),
    '',
    heading('What this study assumed', { rule: '-' }),
    studyAssumptions()
      .map((line) => `- ${line}`)
      .join('\n'),
    '',
    footer(`buckline ${VERSION}`, `price list ${list.id}`),
  ].join('\n');
}

/** Registers the report commands on a program. */
export function registerReport(program, context) {
  const report = program
    .command('report')
    .description('the reports that read several things at once');

  report
    .command('reconcile')
    .description('split the gap between a contract scale and a mill tally')
    .requiredOption('-i, --logs <file>', 'the logs on the load')
    .requiredOption('-r, --rule <rule>', 'the contract rule')
    .requiredOption('--scaled <boardFeet>', 'what the load was bought on')
    .requiredOption('--tallied <boardFeet>', 'what the green chain counted')
    .option('--check <boardFeet>', 'an independent rescale under the same rule')
    .option('-f, --format <format>', 'text, csv or json', 'text')
    .option('-o, --output <file>', 'write to a file instead of the screen')
    .action((options) => {
      emit(context, runReconcile(options, context), options);
    });

  report
    .command('study')
    .description('saw a deck on paper under every pattern and price the result')
    .requiredOption('-i, --logs <file>', 'the logs on the deck')
    .requiredOption('-p, --prices <file>', 'the price list')
    .requiredOption('-r, --rule <rule>', 'the rule the wood was bought on')
    .option('-f, --format <format>', 'text, csv or json', 'text')
    .option('-o, --output <file>', 'write to a file instead of the screen')
    .action((options) => {
      emit(context, runStudy(options, context), options);
    });
}
