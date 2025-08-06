import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { loadsFrom } from '../../../src/cli/commands/forecast.js';

const statements = [
  {
    statementId: 'ST-1',
    scaledOn: '2025-06-04',
    netMbf: 12.4,
    division: { landowner: { net: 3100 } },
  },
  {
    statementId: 'ST-2',
    scaledOn: '2025-06-18',
    netMbf: 11.8,
    division: { landowner: { net: 2900 } },
  },
  {
    statementId: 'ST-3',
    scaledOn: '2025-07-02',
    netMbf: 13.1,
    division: { landowner: { net: 3400 } },
  },
];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-forecast-'));
  writeFileSync(join(dir, 'statements.json'), JSON.stringify(statements));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(args = []) {
  return run(['forecast', '-s', 'statements.json', '-c', '100', ...args], { context });
}

describe('loadsFrom', () => {
  it('reads the volume and what the landowner was paid', () => {
    const loads = loadsFrom(context, 'statements.json');
    expect(loads).toHaveLength(3);
    expect(loads[0].netMbf).toBe(12.4);
    expect(loads[0].landownerNet).toBe(3100);
  });

  it('reads a period off the scale date', () => {
    expect(loadsFrom(context, 'statements.json')[0].period).toBe('2025-06');
  });

  it('reads a statement with nothing on it as nothing', () => {
    writeFileSync(join(dir, 'thin.json'), JSON.stringify([{ statementId: 'X' }]));
    expect(loadsFrom(context, 'thin.json')[0]).toEqual({
      period: null,
      netMbf: 0,
      landownerNet: 0,
    });
  });
});

describe('buckline forecast', () => {
  it('reports what is left', () => {
    const { code } = call();
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('What is left in this sale');
    expect(context.captured()).toContain('left on the cruise');
  });

  it('says it is a ratio and not a trend', () => {
    call();
    expect(context.captured()).toContain('not a trend');
  });

  it('takes the cruise as written with no finished block', () => {
    call();
    expect(context.captured()).toContain('taken as written');
  });

  it('adjusts once a finished block is given', () => {
    call(['--block-cruised', '40', '--block-scaled', '46']);
    expect(context.captured()).toContain('cruise was light');
    expect(context.captured()).toContain('a ratio of 1.15');
  });

  it('warns when the sale has already cut past its cruise', () => {
    run(['forecast', '-s', 'statements.json', '-c', '10'], { context });
    expect(context.captured()).toContain('already cut past its cruise');
  });

  it('does not warn on a sale with plenty left', () => {
    call();
    expect(context.captured()).not.toContain('already cut past');
  });

  it('writes json when asked', () => {
    call(['-f', 'json']);
    expect(JSON.parse(context.captured()).value.loads).toBe(3);
  });

  it('needs the statements and the cruise', () => {
    expect(run(['forecast'], { context }).code).toBe(EXIT.usage);
  });

  it('complains about a cruise of nothing', () => {
    expect(run(['forecast', '-s', 'statements.json', '-c', '0'], { context }).code).toBe(
      EXIT.failed
    );
  });
});
