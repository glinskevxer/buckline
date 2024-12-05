/**
 * buckline scale
 *
 * Scales a load against its tract's contract and prints the ticket. The
 * contract file is not optional and there is no default rule, because a scale
 * with no named rule is not a scale, it is a number.
 */

import { makeTract, measurementOptions, scalingOptions } from '../../model/tract.js';
import { makeLoad } from '../../model/load.js';
import { scaleTicket } from '../../scale/ticket.js';
import { scaleTicketDocument } from '../../report/documents.js';
import { csv } from '../render/csv.js';
import { json } from '../render/json.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { VERSION, requireFormat } from '../program.js';

/** Runs the scale command and returns the report text. */
export function runScale(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const tract = makeTract(readData(context, options.tract));
  const load = makeLoad(readData(context, options.load), measurementOptions(tract));

  const ticket = scaleTicket(
    {
      ticketId: options.ticket ?? `S-${load.id}`,
      loadId: load.id,
      tractId: load.tractId,
      scaledBy: load.scaledBy ?? null,
      rule: tract.contract.rule,
      logs: load.logs,
    },
    scalingOptions(tract)
  );

  if (format === 'json') return json(ticket);
  if (format === 'csv') {
    return csv(ticket.lines, [
      { key: 'logId', header: 'log' },
      { key: 'grossBoardFeet', header: 'gross' },
      { key: 'netBoardFeet', header: 'net' },
      { key: 'cull', header: 'cull' },
      { key: 'cullReason', header: 'reason' },
    ]);
  }
  return scaleTicketDocument(ticket, { producedBy: `buckline ${VERSION}` });
}

/** Registers the command on a program. */
export function registerScale(program, context) {
  reportCommand(program, context, {
    name: 'scale',
    description: 'scale a load against its tract contract',
    options: [
      required('-l, --load <file>', 'the load file'),
      required('-t, --tract <file>', 'the tract and contract file'),
      optional('--ticket <id>', 'ticket number to put on the report'),
    ],
    run: runScale,
  });
}
