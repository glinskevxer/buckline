import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, makeContext } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const ticket = {
  ticketId: 'S-4417',
  rule: 'doyle',
  logCount: 10,
  lines: Array.from({ length: 10 }, (_, i) => ({
    logId: `L-${i + 1}`,
    netBoardFeet: 200 + i * 10,
    cull: false,
  })),
};

const check = ticket.lines.slice(0, 6).map((line) => ({
  logId: line.logId,
  netBoardFeet: line.netBoardFeet + 2,
}));

const scaler = {
  id: 'SC-1',
  name: 'D. Rakes',
  endorsements: ['doyle'],
  certifiedFrom: '2024-01-01',
  certifiedTo: '2026-06-30',
};

const checks = [
  { verdict: 'pass', differenceShare: 0.01 },
  { verdict: 'pass', differenceShare: 0.012 },
  { verdict: 'pass', differenceShare: 0.008 },
];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-audit-'));
  writeFileSync(join(dir, 'ticket.json'), JSON.stringify(ticket));
  writeFileSync(join(dir, 'check.json'), JSON.stringify(check));
  writeFileSync(join(dir, 'scaler.json'), JSON.stringify(scaler));
  writeFileSync(join(dir, 'checks.json'), JSON.stringify(checks));
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buckline audit check', () => {
  it('compares the check scale against the ticket', () => {
    const { code } = run(['audit', 'check', '-t', 'ticket.json', '-c', 'check.json'], { context });
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Check scale on ticket S-4417');
    expect(context.captured()).toContain('pass');
  });

  it('reports the direction and the sample', () => {
    run(['audit', 'check', '-t', 'ticket.json', '-c', 'check.json'], { context });
    expect(context.captured()).toContain('check found more');
    expect(context.captured()).toContain('60 percent');
  });

  it('names the logs outside tolerance', () => {
    const wide = [{ logId: 'L-1', netBoardFeet: 400 }, ...check.slice(1)];
    writeFileSync(join(dir, 'wide.json'), JSON.stringify(wide));
    run(['audit', 'check', '-t', 'ticket.json', '-c', 'wide.json'], { context });
    expect(context.captured()).toContain('Outside tolerance: L-1');
  });

  it('takes a tighter tolerance', () => {
    run(['audit', 'check', '-t', 'ticket.json', '-c', 'check.json', '--per-log', '0.001'], {
      context,
    });
    expect(context.captured()).toContain('review');
  });

  it('reads a check scale from csv', () => {
    writeFileSync(
      join(dir, 'check.csv'),
      `logId,netBoardFeet\n${check.map((l) => `${l.logId},${l.netBoardFeet}`).join('\n')}\n`
    );
    expect(run(['audit', 'check', '-t', 'ticket.json', '-c', 'check.csv'], { context }).code).toBe(
      EXIT.ok
    );
  });

  it('complains about a check naming a log that is not on the ticket', () => {
    writeFileSync(join(dir, 'odd.json'), JSON.stringify([{ logId: 'L-99', netBoardFeet: 200 }]));
    expect(run(['audit', 'check', '-t', 'ticket.json', '-c', 'odd.json'], { context }).code).toBe(
      EXIT.failed
    );
  });

  it('writes json when asked', () => {
    run(['audit', 'check', '-t', 'ticket.json', '-c', 'check.json', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).verdict).toBe('pass');
  });
});

describe('buckline audit scaler', () => {
  it('reviews a scaler and leaves a clean record alone', () => {
    const { code } = run(
      ['audit', 'scaler', '-s', 'scaler.json', '-c', 'checks.json', '--as-of', '2025-03-10'],
      { context }
    );
    expect(code).toBe(EXIT.ok);
    expect(context.captured()).toContain('Review of D. Rakes');
    expect(context.captured()).toContain('No change to the certificate');
  });

  it('suspends a scaler after a bad run and says so', () => {
    writeFileSync(
      join(dir, 'bad.json'),
      JSON.stringify([
        { verdict: 'fail', differenceShare: -0.04 },
        { verdict: 'fail', differenceShare: -0.05 },
      ])
    );
    run(['audit', 'scaler', '-s', 'scaler.json', '-c', 'bad.json', '--as-of', '2025-03-10'], {
      context,
    });
    expect(context.captured()).toContain('SUSPENDED');
    expect(context.captured()).toContain('Not admissible');
  });

  it('says a lapsed certificate is not admissible', () => {
    run(['audit', 'scaler', '-s', 'scaler.json', '-c', 'checks.json', '--as-of', '2027-01-01'], {
      context,
    });
    expect(context.captured()).toContain('lapsed');
  });

  it('tests admissibility against a named rule', () => {
    run(
      [
        'audit',
        'scaler',
        '-s',
        'scaler.json',
        '-c',
        'checks.json',
        '-r',
        'scribner',
        '--as-of',
        '2025-03-10',
      ],
      { context }
    );
    expect(context.captured()).toContain('not on scribner');
  });

  it('reports the bias and the pass rate', () => {
    run(['audit', 'scaler', '-s', 'scaler.json', '-c', 'checks.json', '--as-of', '2025-03-10'], {
      context,
    });
    expect(context.captured()).toContain('pass rate');
    expect(context.captured()).toContain('check found more');
  });

  it('writes json when asked', () => {
    run(['audit', 'scaler', '-s', 'scaler.json', '-c', 'checks.json', '-f', 'json'], { context });
    expect(JSON.parse(context.captured()).scaler.id).toBe('SC-1');
  });
});
