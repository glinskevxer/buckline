/**
 * Grouping and counting.
 *
 * Four modules had grown their own version of "bucket these by a key, add up
 * a couple of fields, sort the result", and two of them sorted ties
 * differently, so the same load could list its species in one order on the
 * scale ticket and another on the tally sheet. There is one of each here now.
 *
 * Every function returns plain arrays or Maps. Nothing here knows what a log
 * or a board is.
 */

/** Buckets items by a key, keeping the order they arrived in inside a bucket. */
export function groupBy(items, keyOf) {
  const out = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = out.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
}

/** Counts items by a key. */
export function countBy(items, keyOf) {
  const out = new Map();
  for (const item of items) {
    const key = keyOf(item);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * Buckets items by a key and totals a named set of fields inside each bucket.
 * `fields` maps an output name to a function that reads the value off an item.
 * Every bucket also gets a `count`.
 */
export function summarize(items, keyOf, fields) {
  const out = new Map();
  for (const item of items) {
    const key = keyOf(item);
    let bucket = out.get(key);
    if (!bucket) {
      bucket = { key, count: 0 };
      for (const name of Object.keys(fields)) bucket[name] = 0;
      out.set(key, bucket);
    }
    bucket.count += 1;
    for (const [name, valueOf] of Object.entries(fields)) {
      bucket[name] += valueOf(item) ?? 0;
    }
  }
  return [...out.values()];
}

/**
 * A comparator that puts rows in a fixed order, with anything not in the order
 * falling to the end alphabetically. Used wherever a grade list has a
 * meaningful order that is not alphabetical.
 */
export function byOrder(order, keyOf = (row) => row.key) {
  return (a, b) => {
    const rank = (row) => {
      const index = order.indexOf(keyOf(row));
      return index === -1 ? order.length : index;
    };
    const difference = rank(a) - rank(b);
    if (difference !== 0) return difference;
    return String(keyOf(a)).localeCompare(String(keyOf(b)));
  };
}

/** A comparator that puts the biggest first and breaks ties on the key. */
export function byDescending(field, keyOf = (row) => row.key) {
  return (a, b) => {
    const difference = b[field] - a[field];
    if (difference !== 0) return difference;
    return String(keyOf(a)).localeCompare(String(keyOf(b)));
  };
}
