import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import {
  STARTER_FILES,
  STARTER_LOAD,
  STARTER_PRICES,
  STARTER_TRACT,
  runInit,
} from '../../../src/cli/commands/init.js';
import { makeTract, measurementOptions, scalingOptions } from '../../../src/model/tract.js';
import { makeLoad } from '../../../src/model/load.js';
import { makePriceList } from '../../../src/price/list.js';
import { scaleTicket } from '../../../src/scale/ticket.js';
import { valueLoad } from '../../../src/price/value.js';

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-init-'));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the starter files', () => {
  it('all load through the real constructors', () => {
    expect(() => makeTract(STARTER_TRACT)).not.toThrow();
    expect(() => makePriceList(STARTER_PRICES)).not.toThrow();
    const tract = makeTract(STARTER_TRACT);
    expect(() => makeLoad(STARTER_LOAD, measurementOptions(tract))).not.toThrow();
  });

  it('scale to something, which is the whole point of a scaffold', () => {
    const tract = makeTract(STARTER_TRACT);
    const load = makeLoad(STARTER_LOAD, measurementOptions(tract));
    const ticket = scaleTicket(
      { ticketId: 'S-1', rule: tract.contract.rule, logs: load.logs },
      scalingOptions(tract)
    );
    expect(ticket.netBoardFeet).toBeGreaterThan(0);
    expect(ticket.logCount).toBe(STARTER_LOAD.logs.length);
  });

  it('carry a defect, so the deduction shows on the first ticket', () => {
    const tract = makeTract(STARTER_TRACT);
    const load = makeLoad(STARTER_LOAD, measurementOptions(tract));
    const ticket = scaleTicket(
      { ticketId: 'S-1', rule: tract.contract.rule, logs: load.logs },
      scalingOptions(tract)
    );
    expect(ticket.deductionBoardFeet).toBeGreaterThan(0);
  });

  it('price every species the starter load carries', () => {
    const tract = makeTract(STARTER_TRACT);
    const load = makeLoad(STARTER_LOAD, measurementOptions(tract));
    const valued = valueLoad(load.logs, tract.contract.rule, makePriceList(STARTER_PRICES));
    expect(valued.value).toBeGreaterThan(0);
    expect(valued.earningCount).toBe(load.logs.length);
  });

  it('name the rule the yard file names', () => {
    const config = STARTER_FILES[0].body;
    expect(config.rule).toBe(STARTER_TRACT.contract.rule);
  });
});

describe('buckline init', () => {
  it('writes every starter file', () => {
    const { code } = run(['init'], { context });
    expect(code).toBe(EXIT.ok);
    for (const file of STARTER_FILES) {
      expect(existsSync(join(dir, file.name)), file.name).toBe(true);
    }
  });

  it('writes readable json', () => {
    run(['init'], { context });
    for (const file of STARTER_FILES) {
      expect(() => JSON.parse(readFileSync(join(dir, file.name), 'utf8'))).not.toThrow();
    }
  });

  it('says what it wrote and what to run next', () => {
    run(['init'], { context });
    expect(context.captured()).toContain('A yard to start from');
    expect(context.captured()).toContain('buckline scale -l load.json -t tract.json');
  });

  it('writes into a directory it is given', () => {
    run(['init', '-d', 'yard'], { context });
    expect(existsSync(join(dir, 'yard', 'buckline.json'))).toBe(true);
    expect(existsSync(join(dir, 'buckline.json'))).toBe(false);
  });

  it('makes the directory when it is not there', () => {
    run(['init', '-d', 'a/b/c'], { context });
    expect(existsSync(join(dir, 'a/b/c/tract.json'))).toBe(true);
  });

  it('refuses to write over work that is already there', () => {
    writeFileSync(join(dir, 'tract.json'), '{"mine":true}');
    const { code } = run(['init'], { context });
    expect(code).not.toBe(EXIT.ok);
    expect(context.capturedErrors()).toContain('will not write over it');
    expect(JSON.parse(readFileSync(join(dir, 'tract.json'), 'utf8')).mine).toBe(true);
  });

  it('names what was in the way and how to get past it', () => {
    writeFileSync(join(dir, 'tract.json'), '{}');
    run(['init'], { context });
    expect(context.capturedErrors()).toContain('tract.json');
    expect(context.capturedErrors()).toContain('--force');
  });

  it('writes over it when told to', () => {
    writeFileSync(join(dir, 'tract.json'), '{"mine":true}');
    const { code } = run(['init', '--force'], { context });
    expect(code).toBe(EXIT.ok);
    expect(JSON.parse(readFileSync(join(dir, 'tract.json'), 'utf8')).id).toBe('T-1');
  });

  it('writes json when asked', () => {
    const out = runInit({ dir: 'yard', format: 'json' }, context);
    expect(JSON.parse(out).written).toHaveLength(STARTER_FILES.length);
  });
});

describe('what init leaves behind actually runs', () => {
  it('scales the load it wrote against the tract it wrote', () => {
    run(['init'], { context });
    const fresh = makeContext({ cwd: dir });
    const { code } = run(['scale', '-l', 'load.json', '-t', 'tract.json'], { context: fresh });
    expect(code).toBe(EXIT.ok);
    expect(fresh.captured()).toContain('Scale ticket');
    expect(fresh.captured()).toContain('Doyle');
  });

  it('leaves a yard file the next command reads', () => {
    run(['init'], { context });
    // Run without handing a context in, so the program loads the yard file
    // itself the way it does at a prompt. A context that is passed in carries
    // its own config and this would prove nothing.
    const { context: fresh } = run(['config'], { cwd: dir });
    expect(fresh.captured()).toContain('doyle');
    expect(fresh.captured()).toContain('yard file');
  });

  it('leaves a yard file that supplies the rule to a command that needs one', () => {
    run(['init'], { context });
    const { context: fresh } = run(['rules'], { cwd: dir });
    expect(fresh.captured()).toContain('Doyle scale stick');
  });

  it('grades the load it wrote', () => {
    run(['init'], { context });
    const fresh = makeContext({ cwd: dir });
    writeFileSync(join(dir, 'logs.json'), JSON.stringify(STARTER_LOAD.logs));
    const { code } = run(['grade', '-i', 'logs.json'], { context: fresh });
    expect(code).toBe(EXIT.ok);
    expect(fresh.captured()).toContain('Log grades');
  });
});
