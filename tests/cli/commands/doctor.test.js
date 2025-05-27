import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { checkBook } from '../../../src/cli/commands/doctor.js';

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-doctor-'));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buckline doctor', () => {
  it('runs the checks and comes back clean', () => {
    const { code } = run(['doctor'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Self check');
    expect(context.captured()).toContain('nothing to report');
  });

  it('says how much each check looked at', () => {
    run(['doctor'], { context });
    expect(context.captured()).toContain('looked');
    expect(context.captured()).toContain('log rules');
  });

  it('checks a yard book when one is named', () => {
    writeFileSync(join(dir, 'book.jsonl'), '{"seq":1,"kind":"tract.saved","id":"T-7"}\n');
    run(['doctor', '-y', 'book.jsonl'], { context });
    expect(context.captured()).toContain('yard book');
  });

  it('reports a book that will not load and exits non zero', () => {
    writeFileSync(join(dir, 'bad.jsonl'), '{"seq":5,"kind":"a"}\n');
    const { code } = run(['doctor', '-y', 'bad.jsonl'], { context });
    expect(code).not.toBe(EXIT.ok);
    expect(context.captured()).toContain('will not load');
  });

  it('prints the report even when it is going to fail', () => {
    writeFileSync(join(dir, 'bad.jsonl'), '{"seq":5,"kind":"a"}\n');
    run(['doctor', '-y', 'bad.jsonl'], { context });
    expect(context.captured()).toContain('Self check');
  });

  it('writes json when asked', () => {
    run(['doctor', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).clean).toBe(true);
  });
});

describe('checkBook', () => {
  it('reports what is in a book that loads', () => {
    writeFileSync(
      join(dir, 'book.jsonl'),
      '{"seq":1,"kind":"tract.saved","id":"T-7"}\n{"seq":2,"kind":"tract.saved","id":"T-8"}\n'
    );
    const result = checkBook(context, 'book.jsonl');
    expect(result.problems).toEqual([]);
    expect(result.looked).toBe(2);
    expect(result.detail.kinds[0].kind).toBe('tract.saved');
  });

  it('reports a book that is not there as a problem rather than throwing', () => {
    const result = checkBook(context, 'missing.jsonl');
    expect(result.problems).toEqual([]);
    expect(result.looked).toBe(0);
  });

  it('reports a book with a hole in it', () => {
    writeFileSync(join(dir, 'bad.jsonl'), '{"seq":1,"kind":"a"}\n{"seq":9,"kind":"b"}\n');
    expect(checkBook(context, 'bad.jsonl').problems.length).toBe(1);
  });
});
