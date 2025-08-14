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
import { money } from '../render/table.js';
import { document, title } from '../../report/layout.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

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

  const loss = valueLoss(stem, positions, options.rule, list, result);

  return render(format, {
    json: { ...result, card: cuttingCard(result), tally: expectedTally(result) },
    csv: expectedTally(result),
    text: () =>
      document([
        title(`Cutting card for stem ${stem.id}`),
        {
          fields: {
            species: stem.species,
            rule: options.rule,
            'price list': list.id,
            'merchantable top': `${topDiameterIn} in`,
            logs: result.logCount,
          },
        },
        {
          rows: cuttingCard(result),
          columns: [
            { key: 'step', header: 'step' },
            { key: 'action', header: 'do' },
            { key: 'fromLastCutFt', header: 'from last cut' },
            { key: 'atFt', header: 'height' },
            { key: 'note', header: 'note' },
          ],
        },
        {
          title: 'Expected off this stem',
          rows: expectedTally(result),
          columns: [
            { key: 'logNumber', header: '#' },
            { key: 'lengthFt', header: 'len' },
            { key: 'diameterIn', header: 'dia' },
            { key: 'grade', header: 'grade' },
            { key: 'netBoardFeet', header: 'net bf' },
            { key: 'value', header: 'value', format: (value) => money(value) },
          ],
        },
        {
          fields: {
            value: money(result.value),
            'net board feet': result.netBoardFeet,
            'used length': `${result.usedLengthFt} ft`,
            'left behind': `${result.wasteLengthFt} ft`,
            'value per foot': money(loss.valuePerFoot),
          },
        },
      ]),
  });
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
