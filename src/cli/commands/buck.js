/**
 * buckline buck
 *
 * Works out where to cut a stem and prints the cutting card. The answer
 * depends on the log rule and the price list as much as on the tree, so both
 * are required arguments and both are printed at the top of the card. A
 * cutting card that does not say what it was worked out against is a cutting
 * card that will be followed next month against a different market.
 */

import { makePriceList } from '../../price/list.js';
import { cutCandidates, makeStem } from '../../buck/stem.js';
import { withLengthClasses } from '../../buck/candidates.js';
import { buckStem } from '../../buck/optimize.js';
import { cuttingCard, expectedTally, valueLoss } from '../../buck/report.js';
import { block, heading, money, table } from '../render/table.js';
import { csv } from '../render/csv.js';
import { json } from '../render/json.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { requireFormat } from '../program.js';

/** Runs the buck command and returns the report text. */
export function runBuck(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const stem = makeStem(readData(context, options.stem));
  const list = makePriceList(readData(context, options.prices));
  const topDiameterIn = Number(options.top ?? 10);
  const maxLogs = options.maxLogs === undefined ? Infinity : Number(options.maxLogs);
  const trimPolicy = options.trim ?? 'hardwood';

  const rough = cutCandidates(stem, { topDiameterIn });
  const positions = withLengthClasses(stem, rough, { trimPolicy, topFt: rough.at(-1) });
  const result = buckStem(stem, positions, options.rule, list, { maxLogs, trimPolicy });

  if (format === 'json') {
    return json({ ...result, card: cuttingCard(result), tally: expectedTally(result) });
  }
  if (format === 'csv') {
    return csv(expectedTally(result));
  }

  const loss = valueLoss(stem, positions, options.rule, list, result);
  return [
    heading(`Cutting card for stem ${stem.id}`),
    block({
      species: stem.species,
      rule: options.rule,
      'price list': list.id,
      'merchantable top': `${topDiameterIn} in`,
      logs: result.logCount,
    }),
    '',
    table(cuttingCard(result), [
      { key: 'step', header: 'step' },
      { key: 'action', header: 'do' },
      { key: 'fromLastCutFt', header: 'from last cut' },
      { key: 'atFt', header: 'height' },
      { key: 'note', header: 'note' },
    ]),
    '',
    heading('Expected off this stem', { rule: '-' }),
    table(expectedTally(result), [
      { key: 'logNumber', header: '#' },
      { key: 'lengthFt', header: 'len' },
      { key: 'diameterIn', header: 'dia' },
      { key: 'grade', header: 'grade' },
      { key: 'netBoardFeet', header: 'net bf' },
      { key: 'value', header: 'value', format: (value) => money(value) },
    ]),
    '',
    block({
      value: money(result.value),
      'net board feet': result.netBoardFeet,
      'used length': `${result.usedLengthFt} ft`,
      'left behind': `${result.wasteLengthFt} ft`,
      'value per foot': money(loss.valuePerFoot),
    }),
  ].join('\n');
}

/** Registers the command on a program. */
export function registerBuck(program, context) {
  reportCommand(program, context, {
    name: 'buck',
    description: 'work out where to cut a stem and print the cutting card',
    options: [
      required('-s, --stem <file>', 'the stem profile file'),
      required('-p, --prices <file>', 'the price list file'),
      required('-r, --rule <rule>', 'doyle, international or scribner'),
      optional('--top <inches>', 'merchantable top diameter', '10'),
      optional('--max-logs <count>', 'most logs to take off the stem'),
      optional('--trim <policy>', 'hardwood, softwood or tight', 'hardwood'),
    ],
    run: runBuck,
  });
}
