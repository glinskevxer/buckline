/**
 * buckline forecast
 *
 * How much of a sale is left and what it should pay. It reads the loads that
 * have already been settled rather than anything about the future, and it says
 * on its face that it is a ratio applied to a cruise.
 *
 * The cruise error is only taken from a block the caller says is finished.
 * There is no flag to make the program guess, because guessing whether a block
 * is finished from a share that looks close enough is exactly how a sale ends
 * up forecast off half a block.
 */

import { cruiseError, loadsRemaining, valueRemaining } from '../../analysis/forecast.js';
import { periodOf } from '../../settle/period.js';
import { document, title } from '../../report/layout.js';
import { money } from '../render/table.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

/** Reads settled statements into the shape the forecast wants. */
export function loadsFrom(context, path) {
  const raw = readData(context, path);
  const statements = Array.isArray(raw) ? raw : [raw];
  return statements.map((statement) => ({
    period: statement.scaledOn ? periodOf(statement.scaledOn) : null,
    netMbf: statement.netMbf ?? 0,
    landownerNet: statement.division?.landowner?.net ?? 0,
  }));
}

/** Runs the forecast. */
export function runForecast(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const loads = loadsFrom(context, options.statements);
  const cruiseMbf = Number(options.cruise);

  const error =
    options.blockCruised && options.blockScaled
      ? cruiseError(Number(options.blockCruised), Number(options.blockScaled), {
          blockFinished: true,
        })
      : { known: false };

  const value = valueRemaining(cruiseMbf, loads, { cruiseError: error });
  const trucks = loadsRemaining(cruiseMbf, loads, { cruiseError: error });

  return render(format, {
    json: { value, trucks, cruiseError: error },
    csv: loads,
    text: () =>
      document([
        title('What is left in this sale'),
        {
          fields: {
            cruise: `${value.cruiseMbf} mbf`,
            cut: `${value.cutMbf} mbf over ${value.loads} loads`,
            'share cut': `${Math.round(value.share * 100)} percent`,
            'left on the cruise': `${value.remainingMbf} mbf`,
            'left as adjusted': `${value.adjustedRemainingMbf} mbf`,
            'loads to go': trucks.loadsLeft ?? trucks.reason,
          },
        },
        {
          title: 'Money',
          fields: {
            'paid so far': money(value.paidSoFar),
            'per thousand': value.perMbf === null ? 'nothing cut yet' : money(value.perMbf),
            'expected to come': value.expected === null ? 'not yet' : money(value.expected),
          },
        },
        {
          title: 'The cruise',
          lines: error.known
            ? [
                `Read off a finished block: ${error.cruisedMbf} cruised, ${error.scaledMbf} scaled.`,
                `That is ${error.direction}, a ratio of ${error.ratio}.`,
              ]
            : [error.reason ?? 'no finished block was given, so the cruise is taken as written'],
        },
        `Basis: ${value.basis}. This is a ratio applied to a cruise and not a trend.`,
        value.overcut ? 'WARNING: this sale has already cut past its cruise.' : '',
      ]),
  });
}

/** Registers the forecast command on a program. */
export function registerForecast(program, context) {
  reportCommand(program, context, {
    name: 'forecast',
    description: 'how much of a sale is left and what it should pay',
    options: [
      required('-s, --statements <file>', 'the settled statements'),
      required('-c, --cruise <mbf>', 'the cruise volume for the sale'),
      optional('--block-cruised <mbf>', 'cruise volume of a block that is finished'),
      optional('--block-scaled <mbf>', 'what that block actually scaled'),
    ],
    run: runForecast,
  });
}
