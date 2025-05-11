import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { ValidationError } from '../../src/errors.js';
import { IoError } from '../../src/cli/io.js';
import {
  CONFIG_NAME,
  conflictingDefaults,
  explain,
  findConfig,
  loadConfig,
  readConfig,
  resolveOptions,
} from '../../src/cli/config.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-config-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('findConfig', () => {
  it('finds a file in the directory it is given', () => {
    writeFileSync(join(dir, CONFIG_NAME), '{}');
    expect(findConfig(dir).path).toBe(join(dir, CONFIG_NAME));
  });

  it('walks up until it finds one', () => {
    writeFileSync(join(dir, CONFIG_NAME), '{}');
    const deep = join(dir, 'a', 'b');
    mkdirSync(deep, { recursive: true });
    expect(findConfig(deep).path).toBe(join(dir, CONFIG_NAME));
  });

  it('takes the nearest one when there are two', () => {
    writeFileSync(join(dir, CONFIG_NAME), '{"rule":"doyle"}');
    const deep = join(dir, 'a');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, CONFIG_NAME), '{"rule":"scribner"}');
    expect(readConfig(findConfig(deep).path).values.rule).toBe('scribner');
  });

  it('records where it looked', () => {
    expect(findConfig(dir).searched.length).toBeGreaterThan(0);
  });

  it('finds nothing when there is nothing', () => {
    expect(findConfig(dir).path).toBeNull();
  });
});

describe('readConfig', () => {
  it('reads a file', () => {
    writeFileSync(join(dir, CONFIG_NAME), '{"rule":"doyle","format":"json"}');
    expect(readConfig(join(dir, CONFIG_NAME)).values).toEqual({ rule: 'doyle', format: 'json' });
  });

  it('treats a missing file as an empty config', () => {
    expect(readConfig(join(dir, CONFIG_NAME)).values).toEqual({});
    expect(readConfig(null).path).toBeNull();
  });

  it('refuses a file that will not parse', () => {
    writeFileSync(join(dir, CONFIG_NAME), '{');
    expect(() => readConfig(join(dir, CONFIG_NAME))).toThrow(IoError);
  });

  it('refuses a format it does not write', () => {
    writeFileSync(join(dir, CONFIG_NAME), '{"format":"pdf"}');
    expect(() => readConfig(join(dir, CONFIG_NAME))).toThrow(ValidationError);
  });

  it('drops a key it does not know', () => {
    writeFileSync(join(dir, CONFIG_NAME), '{"rule":"doyle","colour":"green"}');
    expect(readConfig(join(dir, CONFIG_NAME)).values.colour).toBeUndefined();
  });
});

describe('loadConfig', () => {
  it('finds and reads in one step', () => {
    writeFileSync(join(dir, CONFIG_NAME), '{"rule":"scribner"}');
    expect(loadConfig(dir).values.rule).toBe('scribner');
  });

  it('comes back empty where there is no file', () => {
    expect(loadConfig(dir).values).toEqual({});
  });
});

describe('resolveOptions', () => {
  const config = { rule: 'scribner', format: 'json' };
  const defaults = { rule: 'doyle', format: 'text', top: '10' };

  it('puts what was typed above everything', () => {
    const resolved = resolveOptions({ rule: 'international' }, config, defaults);
    expect(resolved.values.rule).toBe('international');
    expect(resolved.sources.rule).toBe('typed');
  });

  it('puts the yard file above the default', () => {
    const resolved = resolveOptions({}, config, defaults);
    expect(resolved.values.format).toBe('json');
    expect(resolved.sources.format).toBe('yard file');
  });

  it('falls back to the default where neither says anything', () => {
    const resolved = resolveOptions({}, config, defaults);
    expect(resolved.values.top).toBe('10');
    expect(resolved.sources.top).toBe('default');
  });

  it('carries a value only the file knows about', () => {
    const resolved = resolveOptions({}, { yard: 'book.jsonl' }, {});
    expect(resolved.values.yard).toBe('book.jsonl');
  });

  it('leaves out a key nothing set', () => {
    expect(resolveOptions({}, {}, {}).values).toEqual({});
  });

  it('takes an undefined typed value as not typed', () => {
    const resolved = resolveOptions({ rule: undefined }, config, defaults);
    expect(resolved.sources.rule).toBe('yard file');
  });
});

describe('explain', () => {
  it('writes a line per value, sorted', () => {
    const rows = explain(resolveOptions({ rule: 'doyle' }, { format: 'csv' }, { top: '10' }));
    expect(rows.map((row) => row.option)).toEqual(['format', 'rule', 'top']);
    expect(rows.find((row) => row.option === 'rule').from).toBe('typed');
  });
});

describe('conflictingDefaults', () => {
  it('finds an option whose commander default would hide the yard file', () => {
    const command = new Command();
    command.option('-r, --rule <rule>', 'rule', 'doyle');
    command.option('-f, --format <format>', 'format');
    expect(conflictingDefaults(command.options, ['rule', 'format'])).toEqual(['rule']);
  });

  it('finds nothing when no option declares a default', () => {
    const command = new Command();
    command.option('-r, --rule <rule>', 'rule');
    expect(conflictingDefaults(command.options, ['rule'])).toEqual([]);
  });

  it('ignores an option the file cannot set', () => {
    const command = new Command();
    command.option('--top <inches>', 'top', '10');
    expect(conflictingDefaults(command.options, ['rule'])).toEqual([]);
  });
});
