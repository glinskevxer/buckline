import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const logs = [
  { id: 'L-1', species: 'red oak', axesIn: [21.8, 21.8], measuredLengthFt: 12.25 },
  { id: 'L-2', species: 'red oak', axesIn: [15.2, 15.2], measuredLengthFt: 12.25 },
];

const prices = { id: 'PL-1', effectiveFrom: '2024-01-01', base: { 'red oak': 1400 } };

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-report-'));
  writeFileSync(join(dir, 'logs.json'), JSON.stringify(logs));
  writeFileSync(join(dir, 'prices.json'), JSON.stringify(prices));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buckline report reconcile', () => {
  function call(args = []) {
    return run(
      [
        'report',
        'reconcile',
        '-i',
        'logs.json',
        '-r',
        'doyle',
        '--scaled',
        '500',
        '--tallied',
        '560',
        ...args,
      ],
      { context }
    );
  }

  it('prints the four buckets', () => {
    const { code } = call();
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Scale against tally');
    expect(context.captured()).toContain('unaccounted');
  });

  it('says the scaler was not separated without a check scale', () => {
    call();
    expect(context.captured()).toContain('no check scale');
  });

  it('separates the scaler once a check scale is given', () => {
    call(['--check', '520']);
    expect(context.captured()).toContain('the scaler');
  });

  it('gives a verdict', () => {
    call();
    expect(context.captured()).toMatch(/inside a normal week|worth a meeting/);
  });

  it('says what produced it', () => {
    call();
    expect(context.captured()).toContain('produced by buckline');
  });

  it('writes csv and json', () => {
    call(['-f', 'csv']);
    expect(context.captured()).toContain('boardFeet');
    const other = makeContext({ cwd: dir });
    run(
      [
        'report',
        'reconcile',
        '-i',
        'logs.json',
        '-r',
        'doyle',
        '--scaled',
        '500',
        '--tallied',
        '560',
        '-f',
        'json',
      ],
      { context: other }
    );
    expect(JSON.parse(other.captured()).buckets).toHaveLength(4);
  });

  it('needs every figure', () => {
    expect(run(['report', 'reconcile'], { context }).code).toBe(EXIT.usage);
  });
});

describe('buckline report study', () => {
  function call(args = []) {
    return run(
      ['report', 'study', '-i', 'logs.json', '-p', 'prices.json', '-r', 'doyle', ...args],
      { context }
    );
  }

  it('prints a row per pattern', () => {
    const { code } = call();
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Recovery study');
    expect(context.captured()).toContain('quarter');
  });

  it('says what one pattern for the deck is worth against picking per log', () => {
    call();
    expect(context.captured()).toContain('one pattern for the deck');
    expect(context.captured()).toContain('picked per log');
  });

  it('prints its own assumptions', () => {
    call();
    expect(context.captured()).toContain('What this study assumed');
    expect(context.captured()).toContain('no defect map');
  });

  it('reports recovery factor and overrun', () => {
    call();
    expect(context.captured()).toContain('recovery factor');
    expect(context.captured()).toContain('overrun share');
  });

  it('writes json when asked', () => {
    call(['-f', 'json']);
    expect(JSON.parse(context.captured()).study.logCount).toBe(2);
  });

  it('complains about an empty log file', () => {
    writeFileSync(join(dir, 'none.json'), '[]');
    const { code } = run(
      ['report', 'study', '-i', 'none.json', '-p', 'prices.json', '-r', 'doyle'],
      { context }
    );
    expect(code).toBe(EXIT.usage);
  });
});
