/**
 * Plain text tables.
 *
 * Everything this program prints ends up taped to a wall or faxed to a
 * landowner, so the output is fixed width text with no colour and no box
 * drawing characters. A scale ticket that reads correctly in a terminal, in a
 * text file and on a dot matrix printer is worth more than a pretty one.
 *
 * Numbers are right aligned and text is left aligned, because a column of
 * board feet that does not line up on the decimal is a column nobody can add
 * up by eye, and adding a column up by eye is the first thing anybody does
 * when they think the total is wrong.
 */

const PAD = 2;

/**
 * Renders rows against a column spec.
 *
 * Each column is `{ key, header, align, format, width }`. Only `key` is
 * required; alignment defaults to right for numbers and left for everything
 * else, decided per column from the first row that has a value in it.
 */
export function table(rows, columns, options = {}) {
  const { totals = null, empty = '(nothing to show)' } = options;
  if (!Array.isArray(rows)) {
    throw new TypeError('table wants an array of rows');
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError('table wants at least one column');
  }
  if (rows.length === 0) {
    return empty;
  }

  const specs = columns.map((column) => resolve(column, rows));
  const body = rows.map((row) => specs.map((spec) => spec.render(row)));
  const totalRow = totals ? specs.map((spec) => spec.render(totals)) : null;

  const widths = specs.map((spec, index) => {
    const cells = [spec.header, ...body.map((line) => line[index])];
    if (totalRow) cells.push(totalRow[index]);
    return Math.max(spec.width ?? 0, ...cells.map((cell) => cell.length));
  });

  const lines = [];
  lines.push(join(specs.map((spec, i) => pad(spec.header, widths[i], spec.align))));
  lines.push(join(widths.map((width) => '-'.repeat(width))));
  for (const line of body) {
    lines.push(join(line.map((cell, i) => pad(cell, widths[i], specs[i].align))));
  }
  if (totalRow) {
    lines.push(join(widths.map((width) => '-'.repeat(width))));
    lines.push(join(totalRow.map((cell, i) => pad(cell, widths[i], specs[i].align))));
  }
  return lines.join('\n');
}

/** A block of label and value pairs, aligned on the labels. */
export function block(pairs, options = {}) {
  const { separator = ': ' } = options;
  const entries = Array.isArray(pairs) ? pairs : Object.entries(pairs);
  if (entries.length === 0) return '';
  const width = Math.max(...entries.map(([label]) => String(label).length));
  return entries
    .map(([label, value]) => `${String(label).padEnd(width)}${separator}${format(value)}`)
    .join('\n');
}

/** A heading with a rule under it. */
export function heading(text, options = {}) {
  const { rule = '=' } = options;
  return `${text}\n${rule.repeat(text.length)}`;
}

/** Formats a number to a fixed number of places with thousands separators. */
export function money(value, places = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const fixed = Math.abs(value).toFixed(places);
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = fraction ? `${grouped}.${fraction}` : grouped;
  return value < 0 ? `(${body})` : body;
}

function resolve(column, rows) {
  const key = typeof column === 'string' ? column : column.key;
  const spec = typeof column === 'string' ? {} : column;
  const sample = rows.find((row) => row[key] !== undefined && row[key] !== null);
  const numeric = sample !== undefined && typeof sample[key] === 'number';

  return {
    key,
    header: spec.header ?? key,
    align: spec.align ?? (numeric ? 'right' : 'left'),
    width: spec.width,
    render: (row) => {
      const value = row === null || row === undefined ? undefined : row[key];
      return spec.format ? spec.format(value, row) : format(value);
    },
  };
}

function format(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

function pad(text, width, align) {
  return align === 'right' ? text.padStart(width) : text.padEnd(width);
}

function join(cells) {
  return cells.join(' '.repeat(PAD)).trimEnd();
}
