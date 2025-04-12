import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

function board(id, widthIn, lengthFt, defects = []) {
  return { id, species: 'red oak', thicknessIn: 1, widthIn, lengthFt, defects };
}

const knot = [{ type: 'knot', face: 0, startFt: 5, lengthFt: 1, fromEdgeIn: 3, widthIn: 2 }];

const tally = [
  ...Array.from({ length: 120 }, (_, i) => board(`B-${i}`, 8, 12)),
  ...Array.from({ length: 40 }, (_, i) => board(`K-${i}`, 8, 12, knot)),
];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-tally-'));
  writeFileSync(join(dir, 'tally.json'), JSON.stringify(tally));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buckline tally units', () => {
  it('builds packages', () => {
    const { code } = run(['tally', 'units', '-i', 'tally.json'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Packages built');
    expect(context.captured()).toContain('U-0001');
  });

  it('reports the packing efficiency and the odds', () => {
    run(['tally', 'units', '-i', 'tally.json'], { context });
    expect(context.captured()).toContain('packing efficiency');
    expect(context.captured()).toContain('odds');
  });

  it('takes a different package target', () => {
    run(['tally', 'units', '-i', 'tally.json', '--target', '400'], { context });
    const small = context.captured();
    const other = makeContext({ cwd: dir });
    run(['tally', 'units', '-i', 'tally.json'], { context: other });
    expect(small).not.toBe(other.captured());
  });

  it('writes csv when asked', () => {
    run(['tally', 'units', '-i', 'tally.json', '-f', 'csv'], { context });
    expect(context.captured().split('\n')[0]).toContain('unitId');
  });

  it('complains about an empty tally', () => {
    writeFileSync(join(dir, 'none.json'), '[]');
    expect(run(['tally', 'units', '-i', 'none.json'], { context }).code).toBe(EXIT.usage);
  });
});

describe('buckline tally recovery', () => {
  it('reports both recoveries side by side', () => {
    const { code } = run(['tally', 'recovery', '-i', 'tally.json'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('footage recovery');
    expect(context.captured()).toContain('piece recovery');
  });

  it('breaks the tally down by grade and by thickness', () => {
    run(['tally', 'recovery', '-i', 'tally.json'], { context });
    expect(context.captured()).toContain('Grade recovery');
    expect(context.captured()).toContain('By thickness');
  });

  it('takes a different set of on grade grades', () => {
    run(['tally', 'recovery', '-i', 'tally.json', '--on-grade', '1C'], { context });
    expect(context.captured()).toContain('counted as on grade');
    expect(context.captured()).toContain('1C');
  });

  it('compares against a target mix when one is given', () => {
    run(['tally', 'recovery', '-i', 'tally.json', '--target', '{"FAS":0.9,"1C":0.1}'], { context });
    expect(context.captured()).toContain('Against target');
  });

  it('leaves the target section out when there is none', () => {
    run(['tally', 'recovery', '-i', 'tally.json'], { context });
    expect(context.captured()).not.toContain('Against target');
  });

  it('writes json when asked', () => {
    run(['tally', 'recovery', '-i', 'tally.json', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).recovery.totalPieces).toBe(160);
  });
});

describe('buckline tally ship', () => {
  it('loads a truck and says what bound it', () => {
    const { code } = run(['tally', 'ship', '-i', 'tally.json'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('bound by');
    expect(context.captured()).toContain('would bind on');
  });

  it('lists what was left behind when the truck fills', () => {
    run(['tally', 'ship', '-i', 'tally.json', '--target', '400', '--max-deck', '600'], {
      context,
    });
    expect(context.captured()).toContain('Left behind');
  });

  it('leaves that section out when everything fits', () => {
    run(['tally', 'ship', '-i', 'tally.json'], { context });
    expect(context.captured()).not.toContain('Left behind');
  });

  it('takes a shipment number', () => {
    run(['tally', 'ship', '-i', 'tally.json', '--shipment', 'SH-9'], { context });
    expect(context.captured()).toContain('Shipment SH-9');
  });

  it('changes what binds when the stock is wet', () => {
    run(['tally', 'ship', '-i', 'tally.json', '--moisture', '70', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).binding.binding).toBe('weight');
  });
});
