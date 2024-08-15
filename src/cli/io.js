/**
 * Reading and writing at the edge.
 *
 * Everything that touches a file or a stream lives here, so the domain code
 * can be tested without a filesystem and the command line can be tested
 * without a terminal. The commands are handed a context object with `out`,
 * `err` and a working directory on it, and they never reach for the process
 * themselves.
 *
 * Input files are read by extension, not by sniffing. A file called .csv is
 * read as CSV even when it happens to parse as JSON, because guessing gets it
 * right until the day somebody has a single column of numbers and then it is
 * wrong in a way nobody can reproduce.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { BucklineError } from '../errors.js';
import { parseCsv } from './render/csv.js';

export class IoError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'IO', ...options });
    this.name = 'IoError';
  }
}

/** Exit codes the command line uses. */
export const EXIT = {
  ok: 0,
  usage: 2,
  data: 3,
  notFound: 4,
  failed: 5,
};

/** Builds a context for the commands to write through. */
export function makeContext(options = {}) {
  const lines = [];
  const errors = [];
  return {
    cwd: options.cwd ?? process.cwd(),
    yardPath: options.yardPath ?? null,
    out: options.out ?? ((text) => lines.push(text)),
    err: options.err ?? ((text) => errors.push(text)),
    lines,
    errors,
    captured: () => lines.join('\n'),
    capturedErrors: () => errors.join('\n'),
  };
}

/** Resolves a path against the context working directory. */
export function resolvePath(context, path) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new IoError('a path is required', { path: 'path' });
  }
  return isAbsolute(path) ? path : resolve(context.cwd, path);
}

/**
 * Reads a data file. JSON comes back as it was written; CSV comes back as an
 * array of objects with every value still a string, because a CSV does not
 * know what a number is and pretending otherwise loses leading zeroes off
 * ticket numbers.
 */
export function readData(context, path) {
  const full = resolvePath(context, path);
  if (!existsSync(full)) {
    throw new IoError(`no file at ${full}`, { path: full, details: { code: EXIT.notFound } });
  }
  const text = readFileSync(full, 'utf8');
  const extension = extname(full).toLowerCase();

  if (extension === '.csv') {
    return parseCsv(text);
  }
  if (extension === '.json') {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new IoError(`${full} is not readable json`, { path: full, cause: error });
    }
  }
  if (extension === '.jsonl') {
    return text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new IoError(`line ${index + 1} of ${full} is not readable json`, {
            path: full,
            cause: error,
          });
        }
      });
  }
  throw new IoError(`do not know how to read a ${extension || 'file with no extension'}`, {
    path: full,
  });
}

/** Writes text to a file, making the directory if it is not there. */
export function writeText(context, path, text) {
  const full = resolvePath(context, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return full;
}

/** Writes to a file when one is named and to the context otherwise. */
export function emit(context, text, options = {}) {
  if (options.output) {
    const full = writeText(context, options.output, text);
    context.out(`written to ${full}`);
    return full;
  }
  context.out(text);
  return null;
}

/** Turns any thrown value into an exit code. */
export function exitCodeFor(error) {
  if (error instanceof IoError) {
    return error.details?.code ?? EXIT.data;
  }
  if (error instanceof BucklineError) {
    return error.code === 'VALIDATION' || error.code === 'CONTRACT' ? EXIT.data : EXIT.failed;
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return EXIT.usage;
  }
  return EXIT.failed;
}
