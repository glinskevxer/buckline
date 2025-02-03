import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { makeAgreement } from '../../../src/settle/stumpage.js';
import { makeSplit } from '../../../src/settle/split.js';
import { settle } from '../../../src/settle/statement.js';

const terms = {
  landowner: 'E. Whitlock',
  agreement: {
    id: 'A-1',
    tractId: 'T-7',
    landowner: 'E. Whitlock',
    rates: [
      { species: 'red oak', grade: 'F1', perMbf: 620 },
      { species: 'red oak', perMbf: 380 },
    ],
    minimumVolumeMbf: 30,
    advance: 5000,
    advanceRecoveryShare: 0.2,
  },
};

const agreement = makeAgreement(terms.agreement);
const split = makeSplit({ kind: 'residual', cutAndHaulPerMbf: 120 });

function statement(id, scaledOn, netBoardFeet) {
  return settle({
    statementId: id,
    loadId: `LD-${id}`,
    scaledOn,
    graded: [{ species: 'red oak', grade: 'F1', netBoardFeet }],
    agreement,
    split,
    deductionSchedule: [
      { name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 },
    ],
  });
}

const statements = [
  statement('ST-1', '2025-01-06', 4200),
  statement('ST-2', '2025-01-14', 5100),
  statement('ST-3', '2025-02-04', 3900),
];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-period-'));
  writeFileSync(join(dir, 'statements.json'), JSON.stringify(statements));
  writeFileSync(join(dir, 'terms.json'), JSON.stringify(terms));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function call(args = []) {
  return run(['period', 'statement', '-s', 'statements.json', '-t', 'terms.json', ...args], {
    context,
  });
}

describe('buckline period statement', () => {
  it('rolls a named period up', () => {
    const { code } = call(['-p', '2025-01']);
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Statement of account, 2025-01');
    expect(context.captured()).toContain('LD-ST-1');
  });

  it('leaves out loads from another period', () => {
    call(['-p', '2025-01']);
    expect(context.captured()).not.toContain('LD-ST-3');
  });

  it('complains when nothing was scaled in the period', () => {
    expect(call(['-p', '2025-06']).code).toBe(EXIT.usage);
  });

  it('shows the advance when one is brought forward', () => {
    call(['-p', '2025-01', '--advance', '5000']);
    expect(context.captured()).toContain('advance brought forward');
  });

  it('shows no advance lines when none is owed', () => {
    call(['-p', '2025-01']);
    expect(context.captured()).not.toContain('advance brought forward');
  });

  it('addresses it to whoever was named', () => {
    call(['-p', '2025-01', '--landowner', 'M. Coleman']);
    expect(context.captured()).toContain('M. Coleman');
  });

  it('writes json and csv', () => {
    call(['-p', '2025-01', '-f', 'json']);
    expect(JSON.parse(context.captured()).loadCount).toBe(2);
    const other = makeContext({ cwd: dir });
    run(
      [
        'period',
        'statement',
        '-s',
        'statements.json',
        '-t',
        'terms.json',
        '-p',
        '2025-01',
        '-f',
        'csv',
      ],
      { context: other }
    );
    expect(other.captured().split('\n')[0]).toContain('loadId');
  });

  it('refuses a file that is not settled statements', () => {
    writeFileSync(join(dir, 'raw.json'), JSON.stringify([{ statementId: 'X' }]));
    const { code } = run(['period', 'statement', '-s', 'raw.json', '-t', 'terms.json'], {
      context,
    });
    expect(code).toBe(EXIT.usage);
  });

  it('needs the statements and the terms', () => {
    expect(run(['period', 'statement'], { context }).code).toBe(EXIT.usage);
  });
});

describe('buckline period account', () => {
  it('lists a line per period, oldest first', () => {
    const { code } = run(['period', 'account', '-s', 'statements.json', '-t', 'terms.json'], {
      context,
    });
    expect(code).toBe(EXIT.ok);
    const lines = context.captured().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('2025-01');
  });

  it('carries the advance from one period into the next', () => {
    run(
      [
        'period',
        'account',
        '-s',
        'statements.json',
        '-t',
        'terms.json',
        '--advance',
        '5000',
        '-f',
        'json',
      ],
      { context }
    );
    const rows = JSON.parse(context.captured());
    const january = rows.find((row) => row.period === '2025-01');
    const february = rows.find((row) => row.period === '2025-02');
    expect(february.advanceOwing).toBeLessThan(january.advanceOwing);
  });

  it('owes nothing when no advance was brought forward', () => {
    run(['period', 'account', '-s', 'statements.json', '-t', 'terms.json', '-f', 'json'], {
      context,
    });
    expect(JSON.parse(context.captured()).every((row) => row.advanceOwing === 0)).toBe(true);
  });
});
