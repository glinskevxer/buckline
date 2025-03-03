/**
 * buckline yard
 *
 * The commands that write to the yard book. Everything else in the command
 * line reads a file, works something out and prints it; these are the ones
 * that leave a record behind, and they are deliberately the only ones.
 *
 * A yard path has to be named. There is no default location and no search up
 * the directory tree, because a scale written into the wrong book is worse
 * than a scale not written at all, and a default is how that happens.
 */

import { openYard } from '../../store/repo.js';
import { block, heading, money, table } from '../render/table.js';
import { json } from '../render/json.js';
import { IoError, readData, resolvePath } from '../io.js';
import { actionCommand, optional, required } from '../command-kit.js';
import { requireFormat } from '../render/index.js';

function open(options, context) {
  if (!options.yard) {
    throw new IoError('name the yard book with --yard', { path: 'yard' });
  }
  return openYard(resolvePath(context, options.yard));
}

/** Writes a tract and its contract into the book. */
export function runYardTract(options, context) {
  const yard = open(options, context);
  const tract = yard.saveTract(readData(context, options.file), { actor: options.actor ?? null });
  return `saved tract ${tract.id} on the ${tract.contract.rule} rule`;
}

/** Records a load arriving. */
export function runYardReceive(options, context) {
  const yard = open(options, context);
  const load = yard.receiveLoad(readData(context, options.file), { actor: options.actor ?? null });
  return `received load ${load.id} from tract ${load.tractId} with ${load.logs.length} logs`;
}

/** Scales a load that is already in the book. */
export function runYardScale(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const yard = open(options, context);
  const ticket = yard.scaleLoad(options.load, { actor: options.actor ?? null });
  if (format === 'json') return json(ticket);
  return [
    heading(`Scale ticket ${ticket.ticketId}`),
    block({
      load: ticket.loadId,
      tract: ticket.tractId,
      rule: ticket.ruleLabel,
      logs: ticket.logCount,
      culled: ticket.culledCount,
      gross: ticket.grossBoardFeet,
      net: ticket.netBoardFeet,
    }),
  ].join('\n');
}

/** What the book holds. */
export function runYardStatus(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const yard = open(options, context);
  const status = yard.status();
  const totals = yard.tractTotals();

  if (format === 'json') return json({ status, totals, tracts: yard.listTracts() });

  return [
    heading('Yard book'),
    block({ entries: status.entries, sequence: status.sequence, tracts: yard.listTracts().length }),
    '',
    heading('By tract', { rule: '-' }),
    table(totals, [
      { key: 'tractId', header: 'tract' },
      { key: 'loads', header: 'loads' },
      { key: 'grossBoardFeet', header: 'gross' },
      { key: 'netBoardFeet', header: 'net', format: (value) => money(value, 0) },
    ]),
    '',
    heading('Projections', { rule: '-' }),
    table(status.projections, [
      { key: 'name', header: 'projection' },
      { key: 'lastSeq', header: 'read to' },
      { key: 'applied', header: 'applied' },
      { key: 'skipped', header: 'skipped' },
    ]),
    '',
    heading('Entry versions', { rule: '-' }),
    table(status.versions, [
      { key: 'version', header: 'written under' },
      { key: 'count', header: 'entries' },
      { key: 'current', header: 'current' },
    ]),
  ].join('\n');
}

/** Registers the yard commands on a program. */
export function registerYard(program, context) {
  const yard = program.command('yard').description('the commands that write to the yard book');

  actionCommand(yard, context, {
    name: 'tract',
    description: 'save a tract and its contract',
    options: [
      required('-y, --yard <file>', 'the yard book'),
      required('-i, --file <file>', 'the tract file'),
      optional('--actor <name>', 'who is doing this'),
    ],
    run: runYardTract,
  });

  actionCommand(yard, context, {
    name: 'receive',
    description: 'record a load arriving',
    options: [
      required('-y, --yard <file>', 'the yard book'),
      required('-i, --file <file>', 'the load file'),
      optional('--actor <name>', 'who is doing this'),
    ],
    run: runYardReceive,
  });

  actionCommand(yard, context, {
    name: 'scale',
    description: 'scale a load that is already in the book',
    formats: true,
    options: [
      required('-y, --yard <file>', 'the yard book'),
      required('-l, --load <id>', 'the load number'),
      optional('--actor <name>', 'who is doing this'),
    ],
    run: runYardScale,
  });

  actionCommand(yard, context, {
    name: 'status',
    description: 'what the book holds',
    formats: true,
    options: [required('-y, --yard <file>', 'the yard book')],
    run: runYardStatus,
  });
}
