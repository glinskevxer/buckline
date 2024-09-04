import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const stem = {
  id: 'S-1',
  species: 'red oak',
  profile: [
    { atFt: 0, diameterIn: 26 },
    { atFt: 4, diameterIn: 22 },
    { atFt: 20, diameterIn: 18 },
    { atFt: 40, diameterIn: 12 },
    { atFt: 52, diameterIn: 6 },
  ],
  defects: [{ type: 'catface', atFt: 24, lengthFt: 2 }],
};

const prices = {
  id: 'PL-1',
  effectiveFrom: '2024-01-01',
  base: { 'red oak': 1400 },
};

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-buck-'));
  writeFileSync(join(dir, 'stem.json'), JSON.stringify(stem));
  writeFileSync(join(dir, 'prices.json'), JSON.stringify(prices));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(args = []) {
  return run(
    ['buck', '-s', 'stem.json', '-p', 'prices.json', '-r', 'doyle', '--top', '12', ...args],
    { context }
  );
}

describe('buckline buck', () => {
  it('prints a cutting card', () => {
    const { code } = call();
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Cutting card for stem S-1');
    expect(context.captured()).toContain('from last cut');
  });

  it('says what it was worked out against', () => {
    call();
    expect(context.captured()).toContain('doyle');
    expect(context.captured()).toContain('PL-1');
  });

  it('lists what the stem should produce', () => {
    call();
    expect(context.captured()).toContain('Expected off this stem');
  });

  it('reports what was left behind', () => {
    call();
    expect(context.captured()).toContain('left behind');
  });

  it('takes fewer logs when told to', () => {
    call(['--max-logs', '1']);
    const one = context.captured();
    const other = makeContext({ cwd: dir });
    run(['buck', '-s', 'stem.json', '-p', 'prices.json', '-r', 'doyle', '--top', '12'], {
      context: other,
    });
    expect(one).not.toBe(other.captured());
  });

  it('gives a different card under a different rule', () => {
    call();
    const doyle = context.captured();
    const other = makeContext({ cwd: dir });
    run(['buck', '-s', 'stem.json', '-p', 'prices.json', '-r', 'international', '--top', '12'], {
      context: other,
    });
    expect(other.captured()).not.toBe(doyle);
  });

  it('writes csv when asked', () => {
    call(['-f', 'csv']);
    expect(context.captured().split('\n')[0]).toContain('logNumber');
  });

  it('writes json when asked', () => {
    call(['-f', 'json']);
    const parsed = JSON.parse(context.captured());
    expect(parsed.stemId).toBe('S-1');
    expect(parsed.card.length).toBeGreaterThan(0);
  });

  it('complains about a rule nobody scales under', () => {
    const { code } = run(['buck', '-s', 'stem.json', '-p', 'prices.json', '-r', 'cubic'], {
      context,
    });
    expect(code).toBe(EXIT.data);
  });

  it('complains about a stem profile that climbs the wrong way', () => {
    writeFileSync(
      join(dir, 'bad.json'),
      JSON.stringify({
        ...stem,
        profile: [
          { atFt: 0, diameterIn: 10 },
          { atFt: 10, diameterIn: 20 },
        ],
      })
    );
    const { code } = run(['buck', '-s', 'bad.json', '-p', 'prices.json', '-r', 'doyle'], {
      context,
    });
    expect(code).toBe(EXIT.failed);
  });

  it('needs a stem, a price list and a rule', () => {
    expect(run(['buck'], { context }).code).toBe(EXIT.usage);
  });
});
