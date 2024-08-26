import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { kindOf } from '../../../src/cli/commands/grade.js';

const logs = [
  {
    id: 'L-1',
    species: 'black walnut',
    position: 'butt',
    axesIn: [24, 24],
    measuredLengthFt: 12.25,
  },
  {
    id: 'L-2',
    species: 'yellow poplar',
    position: 'butt',
    axesIn: [22, 22],
    measuredLengthFt: 12.25,
  },
];

const boards = [
  { id: 'B-1', species: 'red oak', thicknessIn: 1, widthIn: 8, lengthFt: 12 },
  { id: 'B-2', species: 'loblolly pine', thicknessIn: 2, widthIn: 4, lengthFt: 12 },
];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-grade-'));
  writeFileSync(join(dir, 'logs.json'), JSON.stringify(logs));
  writeFileSync(join(dir, 'boards.json'), JSON.stringify(boards));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('kindOf', () => {
  it('reads a log by its length and axes', () => {
    expect(kindOf(logs)).toBe('logs');
  });

  it('reads a board by its thickness and width', () => {
    expect(kindOf(boards)).toBe('boards');
  });

  it('refuses an empty list or something it cannot tell', () => {
    expect(() => kindOf([])).toThrow(TypeError);
    expect(() => kindOf([{ id: 'x' }])).toThrow(TypeError);
  });
});

describe('buckline grade', () => {
  it('grades logs without being told they are logs', () => {
    const { code } = run(['grade', '-i', 'logs.json'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Log grades');
    expect(context.captured()).toContain('veneer');
  });

  it('grades boards without being told they are boards', () => {
    const { code } = run(['grade', '-i', 'boards.json'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Lumber grades');
  });

  it('sends each board to its own rule book', () => {
    run(['grade', '-i', 'boards.json'], { context });
    expect(context.captured()).toContain('nhla');
    expect(context.captured()).toContain('structural');
  });

  it('changes the answer when a market is shut', () => {
    run(['grade', '-i', 'logs.json', '--markets', 'factory,tie,pulp'], { context });
    expect(context.captured()).not.toContain('veneer');
  });

  it('writes csv when asked', () => {
    run(['grade', '-i', 'logs.json', '-f', 'csv'], { context });
    expect(context.captured().split('\n')[0]).toBe('log,market,grade,note');
  });

  it('writes json when asked', () => {
    run(['grade', '-i', 'boards.json', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).results).toHaveLength(2);
  });

  it('complains about a file that is not there', () => {
    const { code } = run(['grade', '-i', 'nope.json'], { context });
    expect(code).toBe(EXIT.notFound);
  });

  it('complains about a file it cannot make sense of', () => {
    writeFileSync(join(dir, 'odd.json'), JSON.stringify([{ id: 'x' }]));
    const { code } = run(['grade', '-i', 'odd.json'], { context });
    expect(code).toBe(EXIT.usage);
  });
});
