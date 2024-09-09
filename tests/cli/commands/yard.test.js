import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const tract = {
  id: 'T-7',
  name: 'Culpeper 40',
  owner: 'E. Whitlock',
  contract: { rule: 'doyle' },
};

const load = {
  id: 'LD-19',
  tractId: 'T-7',
  scaledBy: 'D. Rakes',
  logs: [
    { id: 'L-1', species: 'red oak', axesIn: [17.4, 17.4], measuredLengthFt: 16.25 },
    { id: 'L-2', species: 'white oak', axesIn: [21.8, 21.8], measuredLengthFt: 12.25 },
  ],
};

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-yard-'));
  writeFileSync(join(dir, 'tract.json'), JSON.stringify(tract));
  writeFileSync(join(dir, 'load.json'), JSON.stringify(load));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function yardRun(args, ctx = context) {
  return run(args, { context: ctx });
}

function setUp(ctx) {
  yardRun(['yard', 'tract', '-y', 'book.jsonl', '-i', 'tract.json'], ctx);
  yardRun(['yard', 'receive', '-y', 'book.jsonl', '-i', 'load.json'], ctx);
}

describe('buckline yard', () => {
  it('saves a tract', () => {
    const { code } = yardRun(['yard', 'tract', '-y', 'book.jsonl', '-i', 'tract.json']);
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('saved tract T-7');
  });

  it('receives a load', () => {
    setUp();
    expect(context.captured()).toContain('received load LD-19');
    expect(context.captured()).toContain('2 logs');
  });

  it('refuses a load for a tract that is not in the book', () => {
    const { code } = yardRun(['yard', 'receive', '-y', 'book.jsonl', '-i', 'load.json']);
    expect(code).toBe(EXIT.failed);
  });

  it('scales a load that is in the book', () => {
    setUp();
    const { code } = yardRun(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-19']);
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Scale ticket');
    expect(context.captured()).toContain('Doyle');
  });

  it('refuses to scale the same load twice', () => {
    setUp();
    yardRun(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-19']);
    const { code } = yardRun(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-19']);
    expect(code).toBe(EXIT.failed);
  });

  it('reports what the book holds', () => {
    setUp();
    yardRun(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-19']);
    const fresh = makeContext({ cwd: dir });
    yardRun(['yard', 'status', '-y', 'book.jsonl'], fresh);
    expect(fresh.captured()).toContain('Yard book');
    expect(fresh.captured()).toContain('T-7');
    expect(fresh.captured()).toContain('Projections');
  });

  it('reads the book back in a new process', () => {
    setUp();
    const fresh = makeContext({ cwd: dir });
    const { code } = yardRun(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-19'], fresh);
    expect(code).toBe(EXIT.ok);
    expect(fresh.captured()).toContain('Scale ticket');
  });

  it('writes json when asked', () => {
    setUp();
    yardRun(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-19', '-f', 'json']);
    const printed = context.captured().slice(context.captured().indexOf('{'));
    expect(JSON.parse(printed).rule).toBe('doyle');
  });

  it('needs a yard book named', () => {
    expect(yardRun(['yard', 'status']).code).toBe(EXIT.usage);
  });

  it('records who did it when told', () => {
    yardRun(['yard', 'tract', '-y', 'book.jsonl', '-i', 'tract.json', '--actor', 'dr']);
    const fresh = makeContext({ cwd: dir });
    yardRun(['yard', 'status', '-y', 'book.jsonl', '-f', 'json'], fresh);
    expect(JSON.parse(fresh.captured()).status.entries).toBe(1);
  });
});
