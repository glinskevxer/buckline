/**
 * A week at the yard, end to end.
 *
 * Every other test checks one thing. This one runs the whole sequence a yard
 * runs in a week and checks the numbers agree between the steps, which is the
 * only place a mistake in how two modules join up can show.
 *
 * It uses the example files, so the walkthrough and the documentation are the
 * same thing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeTract, measurementOptions, scalingOptions } from '../../src/model/tract.js';
import { makeLoad } from '../../src/model/load.js';
import { scaleTicket } from '../../src/scale/ticket.js';
import { gradeLoad } from '../../src/grade/log/index.js';
import { makePriceList } from '../../src/price/list.js';
import { valueLoad, withAveragePrice } from '../../src/price/value.js';
import { makeAgreement } from '../../src/settle/stumpage.js';
import { makeSplit } from '../../src/settle/split.js';
import { makeRateCard } from '../../src/settle/haul.js';
import { auditStatement, settle } from '../../src/settle/statement.js';
import { rollUp } from '../../src/settle/period.js';
import { selfBilledInvoice, duplicateLoads } from '../../src/settle/invoice.js';
import { openYard } from '../../src/store/repo.js';
import { reconcile } from '../../src/report/reconciliation.js';
import { deckEntry, deckVolume } from '../../src/inventory/deck.js';

const examples = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
const read = (name) => JSON.parse(readFileSync(join(examples, name), 'utf8'));

const rateCard = makeRateCard({
  carrier: 'Beazley Hauling',
  minimumPerLoad: 180,
  zones: [{ id: 'zone 2', minMiles: 26, maxMiles: 60, basis: 'per mbf', rate: 62 }],
});

let dir;
let yard;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-week-'));
  yard = openYard(join(dir, 'book.jsonl'), { sync: false });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('monday to friday', () => {
  it('runs the whole sequence and the numbers agree at every join', () => {
    const tract = makeTract(read('tract.json'));
    const rawLoad = read('load.json');

    // Monday: the tract goes in the book and a load arrives.
    yard.saveTract(read('tract.json'), { actor: 'mw' });
    const received = yard.receiveLoad(rawLoad, { actor: 'cb' });
    expect(received.logs).toHaveLength(rawLoad.logs.length);

    // Tuesday: the load is scaled, and the ticket agrees with a scale done
    // outside the book from the same files.
    const fromBook = yard.scaleLoad(rawLoad.id, { actor: 'dr' });
    const standalone = scaleTicket(
      {
        ticketId: fromBook.ticketId,
        loadId: rawLoad.id,
        tractId: rawLoad.tractId,
        rule: tract.contract.rule,
        logs: makeLoad(rawLoad, measurementOptions(tract)).logs,
      },
      scalingOptions(tract)
    );
    expect(standalone.netBoardFeet).toBe(fromBook.netBoardFeet);
    expect(standalone.grossBoardFeet).toBe(fromBook.grossBoardFeet);

    // Wednesday: the logs are graded and valued, and the value adds up from
    // the same net scale the ticket carries.
    const logs = makeLoad(rawLoad, measurementOptions(tract)).logs;
    const graded = gradeLoad(logs, scalingOptions(tract));
    expect(graded.results).toHaveLength(logs.length);

    const prices = makePriceList(read('prices.json'));
    const valued = withAveragePrice(
      valueLoad(logs, tract.contract.rule, prices, scalingOptions(tract))
    );
    const earning = valued.lines.filter((line) => line.value > 0);
    expect(valued.netBoardFeet).toBe(
      Math.round(earning.reduce((total, line) => total + line.netBoardFeet, 0) * 100) / 100
    );

    // Thursday: the load is settled, and the statement reconciles.
    const terms = read('terms.json');
    const statement = settle({
      statementId: 'ST-1',
      loadId: rawLoad.id,
      scaledOn: terms.scaledOn,
      graded: read('graded.json'),
      agreement: makeAgreement(terms.agreement),
      split: makeSplit(terms.split),
      rateCard,
      haulZone: terms.haulZone,
      deductionSchedule: terms.deductions,
      marketIndex: terms.marketIndex,
      outstanding: terms.outstanding,
    });
    expect(auditStatement(statement).clean).toBe(true);
    expect(statement.haul.total).toBeGreaterThan(0);

    // Friday: the period rolls up and the invoice traces back to the ticket.
    const period = rollUp([statement], makeAgreement(terms.agreement), {
      period: '2025-06',
      openingAdvance: terms.outstanding.advance,
    });
    const invoice = selfBilledInvoice(period, { sequence: 1, issuedOn: '2025-07-01' });
    expect(invoice.lines[0].ticket).toBe('ST-1');
    expect(invoice.netTotal).toBeCloseTo(period.landownerNet, 2);
    expect(duplicateLoads([invoice]).clean).toBe(true);

    // And the mill reconciles what it sawed against what it bought.
    const gap = reconcile({
      logs,
      contractRule: tract.contract.rule,
      contractNetBoardFeet: fromBook.netBoardFeet,
      tallyBoardFeet: fromBook.netBoardFeet * 1.25,
    });
    const buckets = gap.buckets.reduce((total, bucket) => total + bucket.boardFeet, 0);
    expect(buckets).toBeCloseTo(gap.gapBoardFeet, 1);
  });

  it('reads the same answers back out of the book in a new process', () => {
    yard.saveTract(read('tract.json'));
    yard.receiveLoad(read('load.json'));
    const ticket = yard.scaleLoad('LD-19');

    const reopened = openYard(join(dir, 'book.jsonl'), { sync: false });
    expect(reopened.getTicket('LD-19').netBoardFeet).toBe(ticket.netBoardFeet);
    expect(reopened.tractTotals()[0].netBoardFeet).toBe(ticket.netBoardFeet);
  });

  it('puts the same load on the deck and takes it off again', () => {
    yard.saveTract(read('tract.json'));
    const load = yard.receiveLoad(read('load.json'));
    const ticket = yard.scaleLoad('LD-19');

    const deck = load.logs.map((log, index) =>
      deckEntry(log, '2025-06-25', ticket.lines[index].netBoardFeet)
    );
    expect(deckVolume(deck, '2025-06-26')).toBeCloseTo(
      Math.round(ticket.lines.reduce((total, line) => total + line.netBoardFeet, 0) * 100) / 100,
      1
    );
  });

  it('refuses to scale the load twice, whichever process asks', () => {
    yard.saveTract(read('tract.json'));
    yard.receiveLoad(read('load.json'));
    yard.scaleLoad('LD-19');

    const other = openYard(join(dir, 'book.jsonl'), { sync: false });
    expect(() => other.scaleLoad('LD-19')).toThrow();
  });
});
