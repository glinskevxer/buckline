import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContractError, ValidationError } from '../../src/errors.js';
import {
  EXIT,
  IoError,
  emit,
  exitCodeFor,
  makeContext,
  readData,
  resolvePath,
  writeText,
} from '../../src/cli/io.js';

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-cli-'));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('makeContext', () => {
  it('captures what a command writes', () => {
    context.out('a line');
    context.err('a problem');
    expect(context.captured()).toBe('a line');
    expect(context.capturedErrors()).toBe('a problem');
  });

  it('takes writers when it is given them', () => {
    const seen = [];
    const custom = makeContext({ out: (text) => seen.push(text) });
    custom.out('x');
    expect(seen).toEqual(['x']);
  });
});

describe('resolvePath', () => {
  it('resolves a relative path against the working directory', () => {
    expect(resolvePath(context, 'a/b.json')).toBe(join(dir, 'a/b.json'));
  });

  it('leaves an absolute path alone', () => {
    expect(resolvePath(context, '/tmp/x.json')).toBe('/tmp/x.json');
  });

  it('refuses an empty path', () => {
    expect(() => resolvePath(context, '')).toThrow(IoError);
    expect(() => resolvePath(context, null)).toThrow(IoError);
  });
});

describe('readData', () => {
  it('reads json', () => {
    writeFileSync(join(dir, 'logs.json'), '{"a":1}');
    expect(readData(context, 'logs.json')).toEqual({ a: 1 });
  });

  it('reads csv into objects with string values', () => {
    writeFileSync(join(dir, 'logs.csv'), 'id,boardFeet\nL-1,144\n');
    expect(readData(context, 'logs.csv')).toEqual([{ id: 'L-1', boardFeet: '144' }]);
  });

  it('reads json lines', () => {
    writeFileSync(join(dir, 'journal.jsonl'), '{"a":1}\n{"a":2}\n');
    expect(readData(context, 'journal.jsonl')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('goes by extension rather than sniffing the content', () => {
    writeFileSync(join(dir, 'logs.csv'), '{"a":1}');
    expect(Array.isArray(readData(context, 'logs.csv'))).toBe(true);
  });

  it('complains about a file that is not there', () => {
    let caught;
    try {
      readData(context, 'missing.json');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IoError);
    expect(exitCodeFor(caught)).toBe(EXIT.notFound);
  });

  it('complains about json it cannot read', () => {
    writeFileSync(join(dir, 'bad.json'), '{');
    expect(() => readData(context, 'bad.json')).toThrow(IoError);
  });

  it('names the line of a bad json lines file', () => {
    writeFileSync(join(dir, 'bad.jsonl'), '{"a":1}\nnope\n');
    expect(() => readData(context, 'bad.jsonl')).toThrow(/line 2/);
  });

  it('refuses an extension it does not know', () => {
    writeFileSync(join(dir, 'notes.txt'), 'hello');
    expect(() => readData(context, 'notes.txt')).toThrow(IoError);
  });
});

describe('writeText', () => {
  it('writes and makes the directory', () => {
    const full = writeText(context, 'out/report.txt', 'hello');
    expect(readFileSync(full, 'utf8')).toBe('hello\n');
  });

  it('does not double the trailing newline', () => {
    const full = writeText(context, 'out/report.txt', 'hello\n');
    expect(readFileSync(full, 'utf8')).toBe('hello\n');
  });
});

describe('emit', () => {
  it('writes to the context when there is no output file', () => {
    emit(context, 'a report');
    expect(context.captured()).toBe('a report');
  });

  it('writes to a file when there is one and says where', () => {
    emit(context, 'a report', { output: 'out/report.txt' });
    expect(context.captured()).toContain('written to');
    expect(readFileSync(join(dir, 'out/report.txt'), 'utf8')).toBe('a report\n');
  });
});

describe('exitCodeFor', () => {
  it('maps bad input to the data code', () => {
    expect(exitCodeFor(new ValidationError('bad'))).toBe(EXIT.data);
    expect(exitCodeFor(new ContractError('bad'))).toBe(EXIT.data);
  });

  it('maps a programmer mistake to the usage code', () => {
    expect(exitCodeFor(new TypeError('bad'))).toBe(EXIT.usage);
    expect(exitCodeFor(new RangeError('bad'))).toBe(EXIT.usage);
  });

  it('maps everything else to the failure code', () => {
    expect(exitCodeFor(new Error('bad'))).toBe(EXIT.failed);
  });

  it('never returns the ok code for an error', () => {
    for (const error of [new Error('a'), new TypeError('a'), new ValidationError('a')]) {
      expect(exitCodeFor(error)).not.toBe(EXIT.ok);
    }
  });
});
