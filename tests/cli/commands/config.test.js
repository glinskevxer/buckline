import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-configcmd-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(args = []) {
  return run(['config', ...args], { cwd: dir, out: () => {}, err: () => {} });
}

describe('buckline config', () => {
  it('says when there is no file', () => {
    const { code, context } = run(['config'], { cwd: dir });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('none found');
    expect(context.captured()).toContain('nothing is set');
  });

  it('lists what a file sets', () => {
    writeFileSync(join(dir, 'buckline.json'), '{"rule":"scribner","format":"text"}');
    const { context } = run(['config'], { cwd: dir });
    expect(context.captured()).toContain('scribner');
    expect(context.captured()).toContain('yard file');
  });

  it('names the keys a file may set', () => {
    const { context } = run(['config'], { cwd: dir });
    expect(context.captured()).toContain('What a yard file may set');
    expect(context.captured()).toContain('- prices');
  });

  it('lists where it looked when asked', () => {
    const { context } = run(['config', '--searched'], { cwd: dir });
    expect(context.captured()).toContain('Where it looked');
    expect(context.captured()).toContain('buckline.json');
  });

  it('finds a file two directories up', () => {
    writeFileSync(join(dir, 'buckline.json'), '{"rule":"doyle"}');
    const deep = join(dir, 'a', 'b');
    mkdirSync(deep, { recursive: true });
    const { context } = run(['config'], { cwd: deep });
    expect(context.captured()).toContain('doyle');
  });

  it('writes json when asked', () => {
    writeFileSync(join(dir, 'buckline.json'), '{"rule":"doyle"}');
    const { context } = run(['config', '-f', 'json'], { cwd: dir });
    expect(JSON.parse(context.captured()).values.rule).toBe('doyle');
  });

  it('refuses a file it cannot read', () => {
    writeFileSync(join(dir, 'buckline.json'), '{');
    expect(call().code).toBe(EXIT.data);
  });
});

describe('a command reading the yard file', () => {
  it('takes the rule from the file when none was typed', () => {
    writeFileSync(join(dir, 'buckline.json'), '{"rule":"scribner"}');
    const { code, context } = run(['rules'], { cwd: dir });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Scribner Decimal C scale stick');
  });

  it('lets what was typed beat the file', () => {
    writeFileSync(join(dir, 'buckline.json'), '{"rule":"scribner"}');
    const { context } = run(['rules', '-r', 'doyle'], { cwd: dir });
    expect(context.captured()).toContain('Doyle scale stick');
  });

  it('takes the format from the file', () => {
    writeFileSync(join(dir, 'buckline.json'), '{"format":"json"}');
    const { context } = run(['rules', '-r', 'doyle'], { cwd: dir });
    expect(JSON.parse(context.captured()).policy.id).toBe('doyle');
  });
});
