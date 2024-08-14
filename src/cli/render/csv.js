/**
 * Comma separated output.
 *
 * The office runs on a spreadsheet and always will, so every report has to
 * come out in a form the spreadsheet will take without an import wizard. That
 * means quoting anything with a comma, a quote or a newline in it, doubling
 * embedded quotes, and writing numbers without thousands separators however
 * nice they look on the printed copy.
 *
 * It also means writing an empty field rather than the word undefined. That
 * sounds obvious and it was in the first version of this file for a month,
 * where it silently became the text "undefined" in a column that was summed.
 */

const NEEDS_QUOTING = /[",\r\n]/;

/** One CSV row from a list of values. */
export function csvRow(values) {
  return values.map(csvCell).join(',');
}

/** One CSV cell, quoted only when it has to be. */
export function csvCell(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value);
  if (!NEEDS_QUOTING.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * A whole CSV document. `columns` are keys or `{ key, header }` pairs; when
 * they are left out the keys of the first row are used, in their own order.
 */
export function csv(rows, columns = null, options = {}) {
  const { newline = '\n', header = true } = options;
  if (!Array.isArray(rows)) {
    throw new TypeError('csv wants an array of rows');
  }
  if (rows.length === 0 && !columns) return '';

  const specs = (columns ?? Object.keys(rows[0])).map((column) =>
    typeof column === 'string' ? { key: column, header: column } : { header: column.key, ...column }
  );

  const lines = [];
  if (header) lines.push(csvRow(specs.map((spec) => spec.header)));
  for (const row of rows) {
    lines.push(
      csvRow(specs.map((spec) => (spec.format ? spec.format(row[spec.key], row) : row[spec.key])))
    );
  }
  return lines.join(newline);
}

/** Reads a simple CSV document back. Enough for round tripping our own output. */
export function parseCsv(text, options = {}) {
  const { header = true } = options;
  const rows = [];
  let field = '';
  let record = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n') {
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  if (!header) return rows;
  if (rows.length === 0) return [];
  const [headings, ...body] = rows;
  return body.map((line) =>
    Object.fromEntries(headings.map((name, index) => [name, line[index] ?? '']))
  );
}
