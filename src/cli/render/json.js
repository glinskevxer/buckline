/**
 * JSON output.
 *
 * The whole result object, indented, with nothing dropped. This is the format
 * another program reads, so it is the one place where the answer is not
 * summarised for a human: a report that prints six columns to a terminal
 * carries thirty fields here.
 *
 * Maps come out as objects and sets as arrays, because the domain code uses
 * both and JSON.stringify turns them into empty objects without a word.
 */

/** Replaces the types JSON does not know about. */
export function jsonSafe(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), jsonSafe(v, seen)]));
  }
  if (value instanceof Set) {
    return [...value].map((entry) => jsonSafe(entry, seen));
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code ?? null };
  }
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => jsonSafe(entry, seen));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v, seen)]));
}

/** The document, indented for reading. */
export function json(value, options = {}) {
  const { indent = 2 } = options;
  return JSON.stringify(jsonSafe(value), null, indent);
}

/** One object per line, for piping into something that reads a stream. */
export function jsonLines(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError('jsonLines wants an array');
  }
  return rows.map((row) => JSON.stringify(jsonSafe(row))).join('\n');
}
