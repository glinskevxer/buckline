import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { speciesFromFile } from '../../../src/cli/commands/species.js';

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-species-'));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buckline species', () => {
  it('prints the whole table', () => {
    const { code } = run(['species'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('The species the yard buys');
    expect(context.captured()).toContain('red oak');
    expect(context.captured()).toContain('loblolly pine');
  });

  it('says which book each species grades on', () => {
    run(['species'], { context });
    expect(context.captured()).toContain('nhla');
    expect(context.captured()).toContain('structural');
  });

  it('prints the kiln schedule at the thickness asked for', () => {
    run(['species', '-t', '2'], { context });
    expect(context.captured()).toContain('2 inch');
    expect(context.captured()).toContain('T2-C1');
  });

  it('filters to a group', () => {
    run(['species', '-g', 'softwood'], { context });
    expect(context.captured()).not.toContain('red oak');
    expect(context.captured()).toContain('loblolly pine');
  });

  it('complains about a group nobody uses', () => {
    expect(run(['species', '-g', 'bamboo'], { context }).code).toBe(EXIT.usage);
  });

  it('writes csv when asked', () => {
    run(['species', '-f', 'csv'], { context });
    expect(context.captured().split('\n')[0]).toContain('species');
  });
});

describe('buckline defects', () => {
  it('prints the catalogue with a column per rule', () => {
    const { code } = run(['defects'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('The defect catalogue');
    expect(context.captured()).toContain('doyle');
    expect(context.captured()).toContain('scribner');
  });

  it('shows one defect deducted three different ways', () => {
    run(['defects', '-f', 'json'], { context });
    const rows = JSON.parse(context.captured());
    const rot = rows.find((row) => row.defect === 'heart rot');
    expect(new Set([rot.doyle, rot.international, rot.scribner]).size).toBe(3);
  });

  it('prints one rule when asked', () => {
    run(['defects', '-r', 'doyle'], { context });
    expect(context.captured()).not.toContain('scribner');
  });

  it('explains the fallback', () => {
    run(['defects'], { context });
    expect(context.captured()).toContain('falls back');
  });

  it('complains about a rule nobody scales under', () => {
    expect(run(['defects', '-r', 'cubic'], { context }).code).toBe(EXIT.data);
  });
});

describe('speciesFromFile', () => {
  it('reads the distinct species off a file', () => {
    writeFileSync(
      join(dir, 'logs.json'),
      JSON.stringify([{ species: 'red oak' }, { species: 'red oak' }, { species: 'ash' }])
    );
    expect(speciesFromFile(context, 'logs.json').sort()).toEqual(['ash', 'red oak']);
  });

  it('reads one off a single record', () => {
    writeFileSync(join(dir, 'log.json'), JSON.stringify({ species: 'beech' }));
    expect(speciesFromFile(context, 'log.json')).toEqual(['beech']);
  });

  it('leaves out records with no species on them', () => {
    writeFileSync(join(dir, 'logs.json'), JSON.stringify([{ id: 'L-1' }]));
    expect(speciesFromFile(context, 'logs.json')).toEqual([]);
  });
});
