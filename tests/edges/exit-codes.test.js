/**
 * What the command line exits with.
 *
 * A script driving this needs to tell a missing file from a bad ticket from a
 * mistyped flag, and the message text is not an interface. These pin every
 * code to a case, and the cases are chosen to be the ones a cron job actually
 * hits at three in the morning.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../src/cli/io.js';
import { run } from '../../src/cli/program.js';

const tract = {
  id: 'T-7',
  name: 'Culpeper 40',
  owner: 'E. Whitlock',
  contract: { rule: 'doyle' },
};

const load = {
  id: 'LD-19',
  tractId: 'T-7',
  logs: [{ id: 'L-1', species: 'red oak', axesIn: [17.4, 17.4], measuredLengthFt: 16.25 }],
};

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-exits-'));
  writeFileSync(join(dir, 'tract.json'), JSON.stringify(tract));
  writeFileSync(join(dir, 'load.json'), JSON.stringify(load));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function code(args) {
  const fresh = makeContext({ cwd: dir });
  return run(args, { context: fresh }).code;
}

describe('nothing wrong', () => {
  it('exits zero on a command that worked', () => {
    expect(code(['scale', '-l', 'load.json', '-t', 'tract.json'])).toBe(EXIT.ok);
  });

  it('exits zero on help and on version', () => {
    expect(code(['--help'])).toBe(EXIT.ok);
    expect(code(['--version'])).toBe(EXIT.ok);
    expect(code(['scale', '--help'])).toBe(EXIT.ok);
  });

  it('exits zero on a subcommand group help', () => {
    expect(code(['yard', '--help'])).toBe(EXIT.ok);
  });
});

describe('a usage mistake', () => {
  it('exits two on a command nobody wrote', () => {
    expect(code(['polish'])).toBe(EXIT.usage);
  });

  it('exits two on a missing required option', () => {
    expect(code(['scale'])).toBe(EXIT.usage);
    expect(code(['scale', '-l', 'load.json'])).toBe(EXIT.usage);
  });

  it('exits two on a flag nobody declared', () => {
    expect(code(['scale', '-l', 'load.json', '-t', 'tract.json', '--polish'])).toBe(EXIT.usage);
  });

  it('exits two on a format we do not write', () => {
    expect(code(['scale', '-l', 'load.json', '-t', 'tract.json', '-f', 'pdf'])).toBe(EXIT.usage);
  });

  it('exits two on a breakdown key nobody defined', () => {
    writeFileSync(join(dir, 'deck.json'), '[]');
    expect(code(['deck', 'list', '-d', 'deck.json', '--by', 'colour'])).toBe(EXIT.usage);
  });
});

describe('a file that is not there', () => {
  it('exits four', () => {
    expect(code(['scale', '-l', 'nope.json', '-t', 'tract.json'])).toBe(EXIT.notFound);
  });

  it('exits four whichever file is missing', () => {
    expect(code(['scale', '-l', 'load.json', '-t', 'nope.json'])).toBe(EXIT.notFound);
  });
});

describe('bad data', () => {
  it('exits three on a contract naming a rule nobody scales under', () => {
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ ...tract, contract: { rule: 'cubic' } }));
    expect(code(['scale', '-l', 'load.json', '-t', 'bad.json'])).toBe(EXIT.data);
  });

  it('exits three on a load that will not validate', () => {
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ ...load, id: '' }));
    expect(code(['scale', '-l', 'bad.json', '-t', 'tract.json'])).toBe(EXIT.data);
  });

  it('exits three on a yard file that will not parse', () => {
    writeFileSync(join(dir, 'buckline.json'), '{');
    expect(run(['config'], { cwd: dir, out: () => {}, err: () => {} }).code).toBe(EXIT.data);
  });

  it('exits three on a json file that will not parse', () => {
    writeFileSync(join(dir, 'broken.json'), '{');
    expect(code(['scale', '-l', 'broken.json', '-t', 'tract.json'])).toBe(EXIT.data);
  });

  it('exits three on a file with an extension we do not read', () => {
    writeFileSync(join(dir, 'notes.txt'), 'hello');
    expect(code(['scale', '-l', 'notes.txt', '-t', 'tract.json'])).toBe(EXIT.data);
  });
});

describe('something else went wrong', () => {
  it('exits five when the yard book does not hold what was asked for', () => {
    expect(code(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-99'])).toBe(EXIT.failed);
  });

  it('exits five when a load is scaled twice', () => {
    run(['yard', 'tract', '-y', 'book.jsonl', '-i', 'tract.json'], { context });
    run(['yard', 'receive', '-y', 'book.jsonl', '-i', 'load.json'], { context });
    expect(code(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-19'])).toBe(EXIT.ok);
    expect(code(['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-19'])).toBe(EXIT.failed);
  });

  it('exits five when the doctor finds a problem', () => {
    writeFileSync(join(dir, 'bad.jsonl'), '{"seq":5,"kind":"a"}\n');
    expect(code(['doctor', '-y', 'bad.jsonl'])).toBe(EXIT.failed);
  });
});

describe('every failure writes something to the error stream', () => {
  it('never fails silently', () => {
    const cases = [
      ['scale', '-l', 'nope.json', '-t', 'tract.json'],
      ['yard', 'scale', '-y', 'book.jsonl', '-l', 'LD-99'],
      ['rules', '-r', 'cubic'],
    ];
    for (const args of cases) {
      const fresh = makeContext({ cwd: dir });
      const { code: exit } = run(args, { context: fresh });
      expect(exit).not.toBe(EXIT.ok);
      expect(fresh.capturedErrors().length).toBeGreaterThan(0);
    }
  });
});
