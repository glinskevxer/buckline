/**
 * buckline deck
 *
 * What is on the log deck and what it is costing to leave it there. The second
 * half is the point: every mill knows roughly what is out there and almost
 * none of them can put a number on the wood that has been sitting since
 * before the last rain.
 */

import { daysOfInventory, deckSummary, deckVolume, oldest, onDeck } from '../../inventory/deck.js';
import { holdingCost, seasonOf } from '../../inventory/degrade.js';
import { block, heading, money, table } from '../render/table.js';
import { csv } from '../render/csv.js';
import { json } from '../render/json.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { requireFormat } from '../program.js';

const KEYS = {
  species: (entry) => entry.species,
  diameter: (entry) => String(entry.diameterIn),
  length: (entry) => String(entry.lengthFt),
};

/** What is standing on the deck. */
export function runDeckList(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const entries = readData(context, options.deck);
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const keyOf = KEYS[options.by ?? 'species'];
  if (!keyOf) {
    throw new TypeError(`cannot break the deck down by ${options.by}`);
  }

  const rows = deckSummary(entries, asOf, keyOf);
  if (format === 'json') return json({ asOf, rows, entries: onDeck(entries, asOf) });
  if (format === 'csv') return csv(rows);

  const parts = [
    heading(`Log deck as of ${asOf}`),
    block({
      'board feet': deckVolume(entries, asOf),
      logs: onDeck(entries, asOf).length,
      'broken out by': options.by ?? 'species',
    }),
    '',
    table(rows, [
      { key: 'key', header: options.by ?? 'species' },
      { key: 'logs', header: 'logs' },
      { key: 'netBoardFeet', header: 'bd ft' },
      { key: 'averageAgeDays', header: 'avg age' },
    ]),
  ];

  if (options.cutRate) {
    parts.push(
      '',
      block({ 'days of inventory': daysOfInventory(entries, asOf, Number(options.cutRate)) })
    );
  }
  return parts.join('\n');
}

/** What the wood that has been waiting is costing. */
export function runDeckAging(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const entries = readData(context, options.deck);
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const perMbf = Number(options.perMbf ?? 900);
  const storage = options.storage ?? 'open';
  const season = seasonOf(asOf);

  const rows = oldest(entries, asOf, {
    olderThanDays: Number(options.olderThan ?? 45),
    limit: Number(options.limit ?? 25),
  }).map((entry) => {
    const cost = holdingCost(entry.species, entry.ageDays, entry.netBoardFeet, perMbf, {
      season,
      storage,
    });
    return {
      logId: entry.logId,
      species: entry.species,
      arrivedOn: entry.arrivedOn,
      ageDays: entry.ageDays,
      netBoardFeet: entry.netBoardFeet,
      lostValue: cost.lostValue,
      firstToShow: cost.firstToShow,
    };
  });

  if (format === 'json') return json({ asOf, season, storage, rows });
  if (format === 'csv') return csv(rows);

  const total = rows.reduce((sum, row) => sum + row.lostValue, 0);
  return [
    heading(`Wood that has been waiting, as of ${asOf}`),
    block({ season, storage, 'priced at': money(perMbf), logs: rows.length }),
    '',
    table(rows, [
      { key: 'logId', header: 'log' },
      { key: 'species', header: 'species' },
      { key: 'ageDays', header: 'days' },
      { key: 'netBoardFeet', header: 'bd ft' },
      { key: 'lostValue', header: 'lost', format: (value) => money(value) },
      { key: 'firstToShow', header: 'showing' },
    ]),
    '',
    block({ 'lost so far': money(total) }),
  ].join('\n');
}

/** Registers the deck commands on a program. */
export function registerDeck(program, context) {
  const deck = program.command('deck').description('the log deck');

  reportCommand(deck, context, {
    name: 'list',
    description: 'what is standing on the deck',
    options: [
      required('-d, --deck <file>', 'the deck file'),
      optional('--as-of <date>', 'the date to read the deck at'),
      optional('--by <key>', 'species, diameter or length', 'species'),
      optional('--cut-rate <boardFeet>', 'board feet a day, to work out days of inventory'),
    ],
    run: runDeckList,
  });

  reportCommand(deck, context, {
    name: 'aging',
    description: 'what the wood that has been waiting is costing',
    options: [
      required('-d, --deck <file>', 'the deck file'),
      optional('--as-of <date>', 'the date to read the deck at'),
      optional('--older-than <days>', 'how old counts as waiting', '45'),
      optional('--per-mbf <price>', 'what the wood is worth', '900'),
      optional('--storage <how>', 'open, end sealed, sprinkled or ponded', 'open'),
      optional('--limit <count>', 'how many logs to list', '25'),
    ],
    run: runDeckAging,
  });
}
