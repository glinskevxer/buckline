/**
 * Choosing a format.
 *
 * Ten commands had the same three lines: if it is json print json, if it is
 * csv print csv, otherwise build the text. They were not identical. Two of
 * them checked the format after doing the work rather than before, so a
 * command asked for an unknown format did the whole job and then failed, and
 * one of those wrote a file first.
 *
 * The format is checked before anything is computed now, and the text shape is
 * a function rather than a value so it is only built when it is the one being
 * used. That matters on the reports that assemble half a dozen tables.
 */

import { csv } from './csv.js';
import { json } from './json.js';

/** The formats every reporting command supports. */
export const FORMATS = ['text', 'csv', 'json'];

/** Checks a format name before a command uses it. */
export function requireFormat(name) {
  if (!FORMATS.includes(name)) {
    throw new TypeError(`unknown format ${name}, we write ${FORMATS.join(', ')}`);
  }
  return name;
}

/**
 * Renders a result in the format asked for.
 *
 * `shapes` carries a `json` value, a `csv` value and a `text` function. The
 * text is a function because it is the expensive one; the other two are
 * already in hand by the time this is called.
 */
export function render(format, shapes) {
  requireFormat(format);
  if (format === 'json') {
    return json(shapes.json);
  }
  if (format === 'csv') {
    return csv(shapes.csv, shapes.csvColumns ?? null);
  }
  if (typeof shapes.text !== 'function') {
    throw new TypeError('the text shape has to be a function so it is only built when used');
  }
  return shapes.text();
}
