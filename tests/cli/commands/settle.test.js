import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const terms = {
  loadId: 'LD-19',
  scaledOn: '2024-09-03',
  marketIndex: 105,
  agreement: {
    id: 'A-1',
    tractId: 'T-7',
    landowner: 'E. Whitlock',
    rates: [
      { species: 'red oak', grade: 'F1', perMbf: 620 },
      { species: 'red oak', perMbf: 380 },
    ],
    slidingScale: { baseIndex: 100, triggerIndex: 110, share: 0.5 },
  },
  split: { kind: 'residual', cutAndHaulPerMbf: 190, bears: { insurance: 'logger' } },
  deductions: [
    { name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 },
    { name: 'insurance', class: 'contractual', basis: 'gross', rate: 0.02 },
  ],
};

const graded = [
  { species: 'red oak', grade: 'F1', netBoardFeet: 3200 },
  { species: 'red oak', grade: 'F3', netBoardFeet: 1600 },
];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-settle-'));
  writeFileSync(join(dir, 'terms.json'), JSON.stringify(terms));
  writeFileSync(join(dir, 'graded.json'), JSON.stringify(graded));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(args = []) {
  return run(['settle', '-g', 'graded.json', '-t', 'terms.json', ...args], { context });
}

describe('buckline settle', () => {
  it('prints a statement', () => {
    const { code } = call();
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Settlement');
    expect(context.captured()).toContain('Deductions');
  });

  it('shows the base rate next to the rate charged', () => {
    call();
    expect(context.captured()).toContain('base');
    expect(context.captured()).toContain('rate');
  });

  it('takes the market index off the command line over the terms file', () => {
    call();
    const flat = context.captured();
    const other = makeContext({ cwd: dir });
    run(['settle', '-g', 'graded.json', '-t', 'terms.json', '--index', '140'], {
      context: other,
    });
    expect(other.captured()).not.toBe(flat);
  });

  it('reads a graded csv as well as json', () => {
    writeFileSync(
      join(dir, 'graded.csv'),
      'species,grade,netBoardFeet\nred oak,F1,3200\nred oak,F3,1600\n'
    );
    const { code } = run(['settle', '-g', 'graded.csv', '-t', 'terms.json'], { context });
    expect(code).toBe(EXIT.ok);
  });

  it('warns when a party ends up owing money', () => {
    writeFileSync(
      join(dir, 'thin.json'),
      JSON.stringify([{ species: 'red oak', grade: 'F3', netBoardFeet: 400 }])
    );
    writeFileSync(
      join(dir, 'dear.json'),
      JSON.stringify({
        ...terms,
        split: { ...terms.split, cutAndHaulPerMbf: 400 },
      })
    );
    run(['settle', '-g', 'thin.json', '-t', 'dear.json'], { context });
    expect(context.captured()).toContain('WARNING');
    expect(context.captured()).toContain('landowner');
  });

  it('does not warn when the same load pays for itself', () => {
    writeFileSync(
      join(dir, 'thin.json'),
      JSON.stringify([{ species: 'red oak', grade: 'F3', netBoardFeet: 400 }])
    );
    run(['settle', '-g', 'thin.json', '-t', 'terms.json'], { context });
    expect(context.captured()).not.toContain('WARNING');
  });

  it('writes json when asked', () => {
    call(['-f', 'json']);
    expect(JSON.parse(context.captured()).agreement).toBe('A-1');
  });

  it('writes csv when asked', () => {
    call(['-f', 'csv']);
    expect(context.captured().split('\n')[0]).toContain('species');
  });

  it('takes a statement number', () => {
    call(['--statement', 'ST-9001']);
    expect(context.captured()).toContain('ST-9001');
  });

  it('complains about a species the agreement has no rate for', () => {
    writeFileSync(
      join(dir, 'other.json'),
      JSON.stringify([{ species: 'white oak', grade: 'F1', netBoardFeet: 1000 }])
    );
    const { code } = run(['settle', '-g', 'other.json', '-t', 'terms.json'], { context });
    expect(code).toBe(EXIT.failed);
  });

  it('needs the graded lines and the terms', () => {
    expect(run(['settle'], { context }).code).toBe(EXIT.usage);
  });
});
