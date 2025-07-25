/**
 * Laying a document out.
 *
 * Every document in this program is the same three things in some order: a
 * heading, a block of label and value pairs, and a table. They were assembled
 * by hand in six places and the blank lines between them had drifted, so the
 * scale ticket had one blank line before a table and the settlement had two,
 * and printing them on the same continuous form looked wrong.
 *
 * A document is a list of sections now. An empty section disappears rather
 * than leaving a heading over nothing, which is the other thing that kept
 * happening: a cull section with no culls in it.
 */

import { block, heading, table } from '../cli/render/table.js';

/**
 * One section. Everything is optional, and a section with no fields, no rows
 * and no lines renders as nothing at all.
 */
export function section(spec = {}) {
  const {
    title = null,
    rule = '-',
    fields = null,
    rows = null,
    columns = null,
    totals = null,
    lines = null,
    empty = null,
  } = spec;

  const parts = [];
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const hasFields = fields && Object.keys(fields).length > 0;
  const hasLines = Array.isArray(lines) && lines.length > 0;

  if (!hasRows && !hasFields && !hasLines) {
    if (!empty) return null;
    if (title) parts.push(heading(title, { rule }));
    parts.push(empty);
    return parts.join('\n');
  }

  if (title) parts.push(heading(title, { rule }));
  if (hasFields) parts.push(block(fields));
  if (hasRows) {
    if (hasFields) parts.push('');
    parts.push(table(rows, columns ?? Object.keys(rows[0]), totals ? { totals } : {}));
  }
  if (hasLines) {
    if (hasFields || hasRows) parts.push('');
    parts.push(lines.join('\n'));
  }
  return parts.join('\n');
}

/**
 * A whole document. Sections are separated by exactly one blank line and
 * anything that rendered as nothing is dropped, so the spacing does not depend
 * on which optional sections happened to have content.
 */
export function document(sections) {
  return sections
    .filter((entry) => entry !== null && entry !== undefined && entry !== '')
    .map((entry) => (typeof entry === 'string' ? entry : section(entry)))
    .filter((entry) => entry !== null && entry !== undefined && entry !== '')
    .join('\n\n');
}

/** The main heading, ruled with the heavier character. */
export function title(text) {
  return heading(text, { rule: '=' });
}
