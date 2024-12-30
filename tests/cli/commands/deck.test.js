import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const deck = [
  {
    logId: 'L-1',
    species: 'red oak',
    diameterIn: 16,
    lengthFt: 12,
    arrivedOn: '2024-06-01',
    netBoardFeet: 200,
    sawnOn: null,
  },
  {
    logId: 'L-2',
    species: 'red oak',
    diameterIn: 20,
    lengthFt: 12,
    arrivedOn: '2024-11-15',
    netBoardFeet: 320,
    sawnOn: null,
  },
  {
    logId: 'L-3',
    species: 'soft maple',
    diameterIn: 14,
    lengthFt: 10,
    arrivedOn: '2024-09-01',
    netBoardFeet: 140,
    sawnOn: null,
  },
];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-deck-'));
  writeFileSync(join(dir, 'deck.json'), JSON.stringify(deck));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buckline deck list', () => {
  it('totals the deck', () => {
    const { code } = run(['deck', 'list', '-d', 'deck.json', '--as-of', '2024-12-01'], {
      context,
    });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Log deck as of 2024-12-01');
    expect(context.captured()).toContain('660');
  });

  it('breaks down by species by default', () => {
    run(['deck', 'list', '-d', 'deck.json', '--as-of', '2024-12-01'], { context });
    expect(context.captured()).toContain('red oak');
  });

  it('breaks down by diameter when asked', () => {
    run(['deck', 'list', '-d', 'deck.json', '--as-of', '2024-12-01', '--by', 'diameter'], {
      context,
    });
    expect(context.captured()).toContain('diameter');
  });

  it('refuses a breakdown nobody wrote', () => {
    const { code } = run(
      ['deck', 'list', '-d', 'deck.json', '--as-of', '2024-12-01', '--by', 'colour'],
      { context }
    );
    expect(code).toBe(EXIT.usage);
  });

  it('works out days of inventory when given a cut rate', () => {
    run(['deck', 'list', '-d', 'deck.json', '--as-of', '2024-12-01', '--cut-rate', '110'], {
      context,
    });
    expect(context.captured()).toContain('days of inventory');
  });

  it('leaves out wood that had not arrived yet', () => {
    run(['deck', 'list', '-d', 'deck.json', '--as-of', '2024-07-01'], { context });
    expect(context.captured()).not.toContain('soft maple');
  });

  it('writes json and csv', () => {
    run(['deck', 'list', '-d', 'deck.json', '--as-of', '2024-12-01', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).rows.length).toBeGreaterThan(0);
  });
});

describe('buckline deck aging', () => {
  it('lists the wood that has been waiting', () => {
    const { code } = run(['deck', 'aging', '-d', 'deck.json', '--as-of', '2024-12-01'], {
      context,
    });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Wood that has been waiting');
    expect(context.captured()).toContain('L-1');
  });

  it('says what is showing first on each log', () => {
    run(['deck', 'aging', '-d', 'deck.json', '--as-of', '2024-12-01'], { context });
    expect(context.captured()).toMatch(/stain|check|beetle/);
  });

  it('costs less under a sprinkler', () => {
    run(['deck', 'aging', '-d', 'deck.json', '--as-of', '2024-12-01'], { context });
    const open = context.captured();
    const other = makeContext({ cwd: dir });
    run(['deck', 'aging', '-d', 'deck.json', '--as-of', '2024-12-01', '--storage', 'sprinkled'], {
      context: other,
    });
    expect(other.captured()).not.toBe(open);
  });

  it('takes a different threshold', () => {
    run(['deck', 'aging', '-d', 'deck.json', '--as-of', '2024-12-01', '--older-than', '10'], {
      context,
    });
    expect(context.captured()).toContain('L-2');
  });

  it('writes json when asked', () => {
    run(['deck', 'aging', '-d', 'deck.json', '--as-of', '2024-12-01', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).season).toBe('winter');
  });
});
