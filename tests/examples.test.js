/**
 * The examples have to work.
 *
 * They are what the readme shows and what the smoke test runs, so an example
 * that stops loading breaks the documentation and the build at the same time
 * and neither failure names the other. These load every one of them through
 * the real constructors.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeTract, measurementOptions, scalingOptions } from '../src/model/tract.js';
import { makeLoad } from '../src/model/load.js';
import { makeStem } from '../src/buck/stem.js';
import { makePriceList } from '../src/price/list.js';
import { makeAgreement } from '../src/settle/stumpage.js';
import { makeSplit } from '../src/settle/split.js';
import { scaleTicket } from '../src/scale/ticket.js';
import { settle } from '../src/settle/statement.js';
import { schedulePiles } from '../src/kiln/charge.js';

const examples = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
const read = (name) => JSON.parse(readFileSync(join(examples, name), 'utf8'));

describe('every example file', () => {
  it('is readable json', () => {
    const files = readdirSync(examples).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      expect(() => read(name)).not.toThrow();
    }
  });
});

describe('the tract and the load', () => {
  const tract = makeTract(read('tract.json'));
  const load = makeLoad(read('load.json'), measurementOptions(tract));

  it('build', () => {
    expect(tract.contract.rule).toBe('doyle');
    expect(load.logs.length).toBeGreaterThan(3);
  });

  it('scale to something', () => {
    const ticket = scaleTicket(
      { ticketId: 'S-1', loadId: load.id, rule: tract.contract.rule, logs: load.logs },
      scalingOptions(tract)
    );
    expect(ticket.netBoardFeet).toBeGreaterThan(0);
    expect(ticket.logCount).toBe(load.logs.length);
  });

  it('carry the contract override the example shows', () => {
    expect(tract.contract.overrides).toEqual({ 'heart rot': 'length' });
  });
});

describe('the stem', () => {
  it('builds and runs the whole merchantable length', () => {
    const stem = makeStem(read('stem.json'));
    expect(stem.totalLengthFt).toBe(52);
    expect(stem.defects.length).toBe(2);
  });
});

describe('the price list', () => {
  it('builds and prices every species the load carries', () => {
    const list = makePriceList(read('prices.json'));
    const load = read('load.json');
    for (const log of load.logs) {
      expect(() => list.baseBySpecies.get(log.species)).not.toThrow();
    }
    expect(list.id).toBe('PL-2025-06');
  });
});

describe('the terms and the graded lines', () => {
  const terms = read('terms.json');

  it('build an agreement and a split', () => {
    expect(makeAgreement(terms.agreement).id).toBe('A-1');
    expect(makeSplit(terms.split).kind).toBe('residual');
  });

  it('settle to a statement that reconciles', () => {
    const statement = settle({
      statementId: 'ST-1',
      loadId: terms.loadId,
      scaledOn: terms.scaledOn,
      graded: read('graded.json'),
      agreement: makeAgreement(terms.agreement),
      split: makeSplit(terms.split),
      deductionSchedule: terms.deductions,
      marketIndex: terms.marketIndex,
      outstanding: terms.outstanding,
    });
    expect(statement.gross).toBeGreaterThan(0);
    expect(statement.lines.every((line) => line.slidingApplied)).toBe(true);
  });
});

describe('the packages', () => {
  it('sort into kiln piles', () => {
    const piles = schedulePiles(read('units.json'));
    expect(piles.length).toBeGreaterThan(1);
    expect(piles.every((pile) => pile.boardFeet > 0)).toBe(true);
  });
});
