/**
 * buckline grade
 *
 * Grades either a deck of logs or a tally of boards. Which one it is doing is
 * decided by the file, not by a flag: a record with a length and a diameter is
 * a log and a record with a thickness and a width is a board. Asking the user
 * to tell us something the data already says is how the wrong flag ends up on
 * the right file.
 */

import { makeLog } from '../../model/log.js';
import { makeBoard } from '../../model/board.js';
import { gradeLoad } from '../../grade/log/index.js';
import { gradeTally } from '../../grade/index.js';
import { byGrade } from '../../tally/summary.js';
import { block, heading, table } from '../render/table.js';
import { csv } from '../render/csv.js';
import { json } from '../render/json.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { requireFormat } from '../render/index.js';

/** Works out whether a file holds logs or boards. */
export function kindOf(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError('grade wants a list of logs or boards');
  }
  const first = records[0];
  if (first.axesIn !== undefined || first.measuredLengthFt !== undefined) return 'logs';
  if (first.thicknessIn !== undefined || first.widthIn !== undefined) return 'boards';
  throw new TypeError('cannot tell whether these are logs or boards');
}

/** Runs the grade command and returns the report text. */
export function runGrade(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const records = readData(context, options.input);
  const kind = kindOf(records);
  const markets = options.markets
    ? options.markets.split(',').map((name) => name.trim())
    : undefined;

  if (kind === 'logs') {
    const logs = records.map((record) => makeLog(record));
    const result = gradeLoad(logs, markets ? { markets } : {});
    if (format === 'json') return json(result);
    const rows = result.results.map((entry) => ({
      log: entry.logId,
      market: entry.market ?? '',
      grade: entry.grade ?? 'none',
      note: entry.notes[0] ?? '',
    }));
    if (format === 'csv') return csv(rows);
    return [
      heading('Log grades'),
      table(rows, ['log', 'market', 'grade', 'note']),
      '',
      table(result.byGrade, ['grade', 'count']),
      '',
      block({ logs: result.results.length, ungraded: result.ungraded }),
    ].join('\n');
  }

  const boards = records.map((record) => makeBoard(record));
  const result = gradeTally(boards, {});
  if (format === 'json') return json(result);
  const rows = result.results.map((entry, index) => ({
    board: entry.boardId,
    species: entry.species,
    book: entry.book,
    grade: entry.grade ?? 'none',
    boardFeet: boards[index].boardFeet,
  }));
  if (format === 'csv') return csv(rows);
  return [
    heading('Lumber grades'),
    table(rows, ['board', 'species', 'book', 'grade', 'boardFeet']),
    '',
    table(
      byGrade(rows.map((row, index) => ({ grade: row.grade, boardFeet: boards[index].boardFeet }))),
      ['grade', 'pieces', 'boardFeet', 'footageShare']
    ),
    '',
    block({ boards: result.results.length, ungraded: result.ungraded }),
  ].join('\n');
}

/** Registers the command on a program. */
export function registerGrade(program, context) {
  reportCommand(program, context, {
    name: 'grade',
    description: 'grade a deck of logs or a tally of boards',
    options: [
      required('-i, --input <file>', 'the logs or boards file'),
      optional('--markets <list>', 'open log markets, comma separated'),
    ],
    run: runGrade,
  });
}
