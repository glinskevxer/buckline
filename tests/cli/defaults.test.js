/**
 * The default paths.
 *
 * Every command has options with defaults, and commander fills those in before
 * the command ever sees them. That means the `?? default` in the command
 * itself is only reached when the command is called directly, which is exactly
 * what an embedding program does. Those branches were untested for months and
 * one of them was wrong.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeContext } from '../../src/cli/io.js';
import { runScale } from '../../src/cli/commands/scale.js';
import { runGrade } from '../../src/cli/commands/grade.js';
import { runBuck } from '../../src/cli/commands/buck.js';
import { runRules } from '../../src/cli/commands/rules.js';
import { runSettle } from '../../src/cli/commands/settle.js';
import { runDeckAging, runDeckList } from '../../src/cli/commands/deck.js';
import { runKilnPlan, runKilnSchedule } from '../../src/cli/commands/kiln.js';
import { runReconcile, runStudy } from '../../src/cli/commands/report.js';
import { runYardStatus, runYardTract } from '../../src/cli/commands/yard.js';
import { runAccount, runPeriod } from '../../src/cli/commands/period.js';

const tract = {
  id: 'T-7',
  name: 'Culpeper 40',
  owner: 'E. Whitlock',
  contract: { rule: 'doyle' },
};

const load = {
  id: 'LD-19',
  tractId: 'T-7',
  logs: [{ id: 'L-1', species: 'red oak', axesIn: [17.4, 17.4], measuredLengthFt: 16.25 }],
};

const stem = {
  id: 'S-1',
  species: 'red oak',
  profile: [
    { atFt: 0, diameterIn: 26 },
    { atFt: 20, diameterIn: 18 },
    { atFt: 44, diameterIn: 8 },
  ],
};

const prices = { id: 'PL-1', effectiveFrom: '2024-01-01', base: { 'red oak': 1400 } };

const units = [{ unitId: 'U-1', species: 'yellow poplar', quarters: 4, boardFeet: 30000 }];

const deck = [
  {
    logId: 'L-1',
    species: 'red oak',
    diameterIn: 16,
    lengthFt: 12,
    arrivedOn: '2020-01-01',
    netBoardFeet: 200,
    sawnOn: null,
  },
];

const terms = {
  landowner: 'E. Whitlock',
  agreement: {
    id: 'A-1',
    tractId: 'T-7',
    landowner: 'E. Whitlock',
    rates: [{ species: 'red oak', perMbf: 380 }],
  },
  split: { kind: 'residual', cutAndHaulPerMbf: 120 },
  deductions: [],
  scaledOn: '2025-02-05',
};

const graded = [{ species: 'red oak', grade: 'F1', netBoardFeet: 4200 }];

let dir;
let context;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-defaults-'));
  for (const [name, value] of Object.entries({
    'tract.json': tract,
    'load.json': load,
    'logs.json': load.logs,
    'stem.json': stem,
    'prices.json': prices,
    'units.json': units,
    'deck.json': deck,
    'terms.json': terms,
    'graded.json': graded,
  })) {
    writeFileSync(join(dir, name), JSON.stringify(value));
  }
  context = makeContext({ cwd: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('called with only the required options', () => {
  it('scales, defaulting the format and the ticket number', () => {
    const out = runScale({ load: 'load.json', tract: 'tract.json' }, context);
    expect(out).toContain('Scale ticket S-LD-19');
  });

  it('grades, defaulting the format and the markets', () => {
    const out = runGrade({ input: 'logs.json' }, context);
    expect(out).toContain('Log grades');
  });

  it('bucks, defaulting the top, the trim policy and the log limit', () => {
    const out = runBuck({ stem: 'stem.json', prices: 'prices.json', rule: 'doyle' }, context);
    expect(out).toContain('Cutting card for stem S-1');
    expect(out).toContain('10 in');
  });

  it('prints the rules, defaulting the length and the range', () => {
    const out = runRules({});
    expect(out).toContain('Every rule at 16 feet');
  });

  it('settles, defaulting the statement number and the load', () => {
    const out = runSettle({ graded: 'graded.json', terms: 'terms.json' }, context);
    expect(out).toContain('Settlement');
  });

  it('lists the deck, defaulting the date and the breakdown', () => {
    const out = runDeckList({ deck: 'deck.json' }, context);
    expect(out).toContain('Log deck as of');
    expect(out).toContain('red oak');
  });

  it('ages the deck, defaulting the price, the storage and the threshold', () => {
    const out = runDeckAging({ deck: 'deck.json' }, context);
    expect(out).toContain('Wood that has been waiting');
    expect(out).toContain('open');
  });

  it('plans the kilns, defaulting the capacity', () => {
    const out = runKilnPlan({ units: 'units.json' }, context);
    expect(out).toContain('40000');
  });

  it('reads a schedule, defaulting the sticker spacing', () => {
    const out = runKilnSchedule({ species: 'red oak', thickness: '1' });
    expect(out).toContain('Risk as loaded');
  });

  it('reconciles, defaulting the format and taking no check scale', () => {
    const out = runReconcile(
      { logs: 'logs.json', rule: 'doyle', scaled: '140', tallied: '150' },
      context
    );
    expect(out).toContain('no check scale');
  });

  it('studies a deck, defaulting the format', () => {
    const out = runStudy({ logs: 'logs.json', prices: 'prices.json', rule: 'doyle' }, context);
    expect(out).toContain('Recovery study');
  });

  it('rolls a period up, defaulting the period and the advance', () => {
    writeFileSync(
      join(dir, 'statements.json'),
      JSON.stringify([
        JSON.parse(
          runSettle({ graded: 'graded.json', terms: 'terms.json', format: 'json' }, context)
        ),
      ])
    );
    const out = runPeriod({ statements: 'statements.json', terms: 'terms.json' }, context);
    expect(out).toContain('Statement of account');
  });

  it('runs an account, defaulting the advance', () => {
    writeFileSync(
      join(dir, 'statements.json'),
      JSON.stringify([
        JSON.parse(
          runSettle({ graded: 'graded.json', terms: 'terms.json', format: 'json' }, context)
        ),
      ])
    );
    const out = runAccount({ statements: 'statements.json', terms: 'terms.json' }, context);
    expect(out).toContain('E. Whitlock');
  });

  it('writes to the yard book, defaulting the actor', () => {
    const yardPath = join(dir, 'book.jsonl');
    expect(runYardTract({ yard: yardPath, file: 'tract.json' }, context)).toContain('saved tract');
    expect(runYardStatus({ yard: yardPath }, context)).toContain('Yard book');
  });
});

describe('the same commands with everything named', () => {
  it('takes a ticket number, a market list and a format', () => {
    const out = runScale(
      { load: 'load.json', tract: 'tract.json', ticket: 'S-1', format: 'json' },
      context
    );
    expect(JSON.parse(out).ticketId).toBe('S-1');
  });

  it('takes a market list', () => {
    const out = runGrade({ input: 'logs.json', markets: 'factory, pulp', format: 'json' }, context);
    expect(JSON.parse(out).results[0].attempts.map((a) => a.market)).toEqual(['factory', 'pulp']);
  });

  it('takes a log limit and a trim policy', () => {
    const out = runBuck(
      {
        stem: 'stem.json',
        prices: 'prices.json',
        rule: 'doyle',
        top: '12',
        maxLogs: '1',
        trim: 'softwood',
        format: 'json',
      },
      context
    );
    expect(JSON.parse(out).logCount).toBeLessThanOrEqual(1);
  });

  it('takes a market index and a statement number', () => {
    const out = runSettle(
      {
        graded: 'graded.json',
        terms: 'terms.json',
        statement: 'ST-9',
        index: '130',
        format: 'json',
      },
      context
    );
    expect(JSON.parse(out).statementId).toBe('ST-9');
    expect(JSON.parse(out).marketIndex).toBe(130);
  });
});
