import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const units = [
  { unitId: 'U-1', species: 'yellow poplar', quarters: 4, boardFeet: 18000 },
  { unitId: 'U-2', species: 'yellow poplar', quarters: 4, boardFeet: 16000 },
  { unitId: 'U-3', species: 'white oak', quarters: 4, boardFeet: 9000 },
  { unitId: 'U-4', species: 'loblolly pine', quarters: 4, boardFeet: 30000 },
];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-kiln-'));
  writeFileSync(join(dir, 'units.json'), JSON.stringify(units));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buckline kiln plan', () => {
  it('lists a charge per schedule', () => {
    const { code } = run(['kiln', 'plan', '-u', 'units.json'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('What the kilns could run');
    expect(context.captured()).toContain('T4-C2');
    expect(context.captured()).toContain('T8-D4');
  });

  it('gives a verdict per charge', () => {
    run(['kiln', 'plan', '-u', 'units.json'], { context });
    expect(context.captured()).toMatch(/run it|percent full/);
  });

  it('changes what is runnable when the kiln is bigger', () => {
    run(['kiln', 'plan', '-u', 'units.json', '--capacity', '80000'], { context });
    const big = context.captured();
    const other = makeContext({ cwd: dir });
    run(['kiln', 'plan', '-u', 'units.json'], { context: other });
    expect(other.captured()).not.toBe(big);
  });

  it('writes json and csv', () => {
    run(['kiln', 'plan', '-u', 'units.json', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).charges.length).toBeGreaterThan(0);
    const other = makeContext({ cwd: dir });
    run(['kiln', 'plan', '-u', 'units.json', '-f', 'csv'], { context: other });
    expect(other.captured().split('\n')[0]).toContain('schedule');
  });

  it('complains about a package with no species', () => {
    writeFileSync(join(dir, 'bad.json'), JSON.stringify([{ unitId: 'U-9', quarters: 4 }]));
    expect(run(['kiln', 'plan', '-u', 'bad.json'], { context }).code).toBe(EXIT.failed);
  });
});

describe('buckline kiln schedule', () => {
  it('names the schedule and why it was chosen', () => {
    const { code } = run(['kiln', 'schedule', '-s', 'white oak', '-t', '1'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('T2-C1');
    expect(context.captured()).toContain('dense');
  });

  it('picks a different schedule for a light thin species', () => {
    run(['kiln', 'schedule', '-s', 'yellow poplar', '-t', '1'], { context });
    expect(context.captured()).toContain('T4-C2');
  });

  it('prints the steps', () => {
    run(['kiln', 'schedule', '-s', 'yellow poplar', '-t', '1'], { context });
    expect(context.captured()).toContain('dry bulb');
    expect(context.captured()).toContain('depression');
  });

  it('reports the risk as loaded', () => {
    run(['kiln', 'schedule', '-s', 'yellow poplar', '-t', '1'], { context });
    expect(context.captured()).toContain('Risk as loaded');
  });

  it('suggests a restack when the stickers are too far apart', () => {
    run(['kiln', 'schedule', '-s', 'yellow poplar', '-t', '1', '--stickers', '60'], { context });
    expect(context.captured()).toContain('restack');
  });

  it('complains about a species nobody buys', () => {
    expect(run(['kiln', 'schedule', '-s', 'teak', '-t', '1'], { context }).code).toBe(EXIT.data);
  });

  it('needs a species and a thickness', () => {
    expect(run(['kiln', 'schedule'], { context }).code).toBe(EXIT.usage);
  });
});
