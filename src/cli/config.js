/**
 * The yard file.
 *
 * A yard runs the same commands with the same six arguments every day, and
 * typing the price list path forty times is how the wrong price list gets
 * used once. A `buckline.json` in the working directory carries the defaults.
 *
 * The precedence is fixed and it is the only sane order: what was typed beats
 * what is in the file, and what is in the file beats what the command would
 * have defaulted to. Nothing else is negotiable, and in particular there is no
 * environment layer, because a value from an environment variable is invisible
 * in the command somebody pasted into an email.
 *
 * Where a value came from is recorded. A report that came out wrong is nearly
 * always a report run against a default nobody knew was there.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { IoError } from './io.js';
import { object, string, validate } from '../valid/check.js';

/** The file a yard keeps its defaults in. */
export const CONFIG_NAME = 'buckline.json';

/** The options the file is allowed to set. Nothing else reaches a command. */
export const CONFIG_KEYS = ['yard', 'prices', 'rule', 'terms', 'tract', 'format', 'actor'];

const configSchema = {
  yard: string({ optional: true }),
  prices: string({ optional: true }),
  rule: string({ optional: true }),
  terms: string({ optional: true }),
  tract: string({ optional: true }),
  format: string({ oneOf: ['text', 'csv', 'json'], optional: true }),
  actor: string({ optional: true }),
  defaults: object({}, { optional: true }),
};

/**
 * Looks for the file in a directory and every directory above it, nearest
 * first. A yard with one file at the top and a per tract file in a subfolder
 * gets the subfolder one, which is what anybody would expect.
 */
export function findConfig(fromDir) {
  let here = fromDir;
  const root = parse(here).root;
  const seen = [];
  while (true) {
    const candidate = join(here, CONFIG_NAME);
    seen.push(candidate);
    if (existsSync(candidate)) return { path: candidate, searched: seen };
    if (here === root) return { path: null, searched: seen };
    here = dirname(here);
  }
}

/** Reads a config file. A missing file is an empty config, not an error. */
export function readConfig(path) {
  if (!path || !existsSync(path)) {
    return { path: null, values: {} };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new IoError(`${path} is not readable json`, { path, cause: error });
  }
  const values = validate(parsed, configSchema, { label: CONFIG_NAME });
  return { path, values };
}

/** Loads whatever config applies to a working directory. */
export function loadConfig(cwd) {
  const found = findConfig(cwd);
  return { ...readConfig(found.path), searched: found.searched };
}

/**
 * Merges what was typed over what the file says over what the command would
 * default to, and records where every value came from.
 */
export function resolveOptions(typed, config, defaults = {}) {
  const values = {};
  const sources = {};

  for (const key of new Set([
    ...Object.keys(defaults),
    ...Object.keys(config ?? {}),
    ...Object.keys(typed ?? {}),
  ])) {
    if (typed && typed[key] !== undefined) {
      values[key] = typed[key];
      sources[key] = 'typed';
    } else if (config && config[key] !== undefined) {
      values[key] = config[key];
      sources[key] = 'yard file';
    } else if (defaults[key] !== undefined) {
      values[key] = defaults[key];
      sources[key] = 'default';
    }
  }

  return { values, sources };
}

/** A line per resolved value, for a command that is asked where things came from. */
export function explain(resolved) {
  return Object.keys(resolved.values)
    .sort()
    .map((key) => ({ option: key, value: resolved.values[key], from: resolved.sources[key] }));
}

/**
 * Whether a command's own commander defaults have been mistaken for something
 * the user typed. Commander fills a default in before the command sees it, so
 * a value that equals the declared default cannot be told from a typed one.
 * The only fix is not to declare defaults on options the file can set, and
 * this checks that nobody has.
 */
export function conflictingDefaults(commandOptions, configKeys) {
  return commandOptions
    .filter((option) => option.defaultValue !== undefined)
    .map((option) => option.attributeName())
    .filter((name) => configKeys.includes(name));
}
