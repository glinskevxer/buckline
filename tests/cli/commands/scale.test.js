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
    {
      id: 'L-3',
      species: 'yellow poplar',
      axesIn: [13.7, 13.7],
      measuredLengthFt: 10.25,
      defects: [{ type: 'heart rot', widthIn: 10, depthIn: 10, lengthFt: 10 }],
    },
  ],
};

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-scale-'));
  writeFileSync(join(dir, 'tract.json'), JSON.stringify(tract));
  writeFileSync(join(dir, 'load.json'), JSON.stringify(load));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(args) {
  return run(['scale', '-l', 'load.json', '-t', 'tract.json', ...args], { context });
}

describe('buckline scale', () => {
  it('prints a ticket', () => {
    const { code } = call([]);
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Scale ticket');
    expect(context.captured()).toContain('L-1');
  });

  it('names the rule from the contract', () => {
    call([]);
    expect(context.captured()).toContain('Doyle');
  });

  it('totals the load', () => {
    call([]);
    expect(context.captured()).toContain('total');
  });

  it('lists the culls separately', () => {
    call([]);
    expect(context.captured()).toContain('Culled');
    expect(context.captured()).toContain('L-3');
  });

  it('writes csv when asked', () => {
    call(['-f', 'csv']);
    expect(context.captured().split('\n')[0]).toBe('log,gross,net,cull,reason');
  });

  it('writes json when asked', () => {
    call(['-f', 'json']);
    expect(JSON.parse(context.captured()).rule).toBe('doyle');
  });

  it('refuses a format it does not write', () => {
    const { code } = call(['-f', 'pdf']);
    expect(code).toBe(EXIT.usage);
    expect(context.capturedErrors()).toContain('unknown format');
  });

  it('writes to a file when told to', () => {
    call(['-o', 'out/ticket.txt']);
    expect(context.captured()).toContain('written to');
  });

  it('takes a ticket number', () => {
    call(['--ticket', 'S-9001']);
    expect(context.captured()).toContain('S-9001');
  });

  it('complains about a load file that is not there', () => {
    const { code } = run(['scale', '-l', 'nope.json', '-t', 'tract.json'], { context });
    expect(code).toBe(EXIT.notFound);
    expect(context.capturedErrors()).toContain('no file at');
  });

  it('complains about a contract with a rule nobody scales under', () => {
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ ...tract, contract: { rule: 'cubic' } }));
    const { code } = run(['scale', '-l', 'load.json', '-t', 'bad.json'], { context });
    expect(code).toBe(EXIT.data);
  });

  it('changes the numbers when the contract changes', () => {
    call([]);
    const doyle = context.captured();
    const other = makeContext({ cwd: dir });
    writeFileSync(
      join(dir, 'intl.json'),
      JSON.stringify({ ...tract, contract: { rule: 'international' } })
    );
    run(['scale', '-l', 'load.json', '-t', 'intl.json'], { context: other });
    expect(other.captured()).not.toBe(doyle);
  });
});

describe('the program itself', () => {
  it('answers to version', () => {
    const { code } = run(['--version'], { context });
    expect(code).toBe(EXIT.ok);
  });

  it('answers to help', () => {
    const { code } = run(['--help'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('buckline');
  });

  it('reports a usage error for an unknown command', () => {
    const { code } = run(['polish'], { context });
    expect(code).toBe(EXIT.usage);
  });

  it('reports a usage error for a missing required option', () => {
    const { code } = run(['scale'], { context });
    expect(code).toBe(EXIT.usage);
  });
});
