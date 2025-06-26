import { describe, expect, it } from 'vitest';
import { SettleError, makeAgreement } from '../../src/settle/stumpage.js';
import { makeSplit } from '../../src/settle/split.js';
import { settle } from '../../src/settle/statement.js';
import { rollUp } from '../../src/settle/period.js';
import { makeJurisdiction } from '../../src/settle/tax.js';
import {
  duplicateLoads,
  invoiceReference,
  overdue,
  selfBilledInvoice,
} from '../../src/settle/invoice.js';

const agreement = makeAgreement({
  id: 'A-1',
  tractId: 'T-7',
  landowner: 'E. Whitlock',
  rates: [{ species: 'red oak', perMbf: 380 }],
  minimumVolumeMbf: 5,
});

const split = makeSplit({ kind: 'residual', cutAndHaulPerMbf: 120 });

function statement(id, scaledOn, netBoardFeet) {
  return settle({
    statementId: id,
    loadId: `LD-${id}`,
    scaledOn,
    graded: [{ species: 'red oak', grade: 'F1', netBoardFeet }],
    agreement,
    split,
    deductionSchedule: [],
  });
}

const period = rollUp(
  [statement('ST-1', '2025-06-04', 4200), statement('ST-2', '2025-06-18', 5100)],
  agreement,
  { period: '2025-06' }
);

const virginia = makeJurisdiction({
  id: 'VA',
  basis: 'stumpage value',
  rate: 0.0285,
  remitter: 'buyer',
});

describe('invoiceReference', () => {
  it('is stable and readable', () => {
    expect(invoiceReference('2025-06', 'A-1', 3)).toBe('SB-A-1-202506-003');
  });

  it('refuses a reference with nothing to key on', () => {
    expect(() => invoiceReference('', 'A-1', 1)).toThrow(SettleError);
    expect(() => invoiceReference('2025-06', '', 1)).toThrow(SettleError);
  });

  it('refuses a sequence that is not a whole number from one', () => {
    expect(() => invoiceReference('2025-06', 'A-1', 0)).toThrow(SettleError);
    expect(() => invoiceReference('2025-06', 'A-1', 1.5)).toThrow(SettleError);
  });
});

describe('selfBilledInvoice', () => {
  const invoice = selfBilledInvoice(period, { issuedOn: '2025-07-01' });

  it('traces every line to a ticket', () => {
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[0].ticket).toBe('ST-1');
    expect(invoice.lines[0].scaledOn).toBe('2025-06-04');
  });

  it('recomputes nothing', () => {
    expect(invoice.netTotal).toBeCloseTo(period.landownerNet, 2);
  });

  it('works out a due date from the terms', () => {
    expect(invoice.dueOn).toBe('2025-07-31');
    expect(selfBilledInvoice(period, { issuedOn: '2025-07-01', terms: 14 }).dueOn).toBe(
      '2025-07-15'
    );
  });

  it('leaves the due date open when it was never issued', () => {
    expect(selfBilledInvoice(period).dueOn).toBeNull();
  });

  it('shows the tax separately when a jurisdiction is named', () => {
    const taxed = selfBilledInvoice(period, { jurisdiction: virginia });
    expect(taxed.tax.tax).toBeGreaterThan(0);
    expect(taxed.payable).toBeLessThan(taxed.netTotal);
  });

  it('does not take the tax off when the seller remits it', () => {
    const seller = makeJurisdiction({
      id: 'WV',
      basis: 'volume',
      rate: 4.5,
      remitter: 'seller',
    });
    const taxed = selfBilledInvoice(period, { jurisdiction: seller });
    expect(taxed.tax.tax).toBeGreaterThan(0);
    expect(taxed.payable).toBeCloseTo(taxed.netTotal + taxed.minimumVolume, 2);
  });

  it('shows no tax at all when no jurisdiction was named', () => {
    expect(invoice.tax).toBeNull();
  });

  it('carries a supplier reference when the landowner gave one', () => {
    expect(selfBilledInvoice(period, { supplierReference: 'W-2025-06' }).supplierReference).toBe(
      'W-2025-06'
    );
  });

  it('refuses a period with no loads', () => {
    expect(() => selfBilledInvoice({ ...period, loads: [] })).toThrow(SettleError);
    expect(() => selfBilledInvoice(null)).toThrow(SettleError);
  });

  it('refuses terms that are not days', () => {
    expect(() => selfBilledInvoice(period, { terms: 0 })).toThrow(SettleError);
  });
});

describe('duplicateLoads', () => {
  const first = selfBilledInvoice(period, { sequence: 1 });
  const second = selfBilledInvoice(period, { sequence: 2 });

  it('finds nothing wrong with one invoice', () => {
    expect(duplicateLoads([first]).clean).toBe(true);
  });

  it('finds a load paid twice', () => {
    const result = duplicateLoads([first, second]);
    expect(result.clean).toBe(false);
    expect(result.duplicates).toHaveLength(2);
    expect(result.duplicates[0].on).toEqual([first.reference, second.reference]);
  });

  it('counts the distinct loads', () => {
    expect(duplicateLoads([first]).loads).toBe(2);
  });
});

describe('overdue', () => {
  const invoice = selfBilledInvoice(period, { issuedOn: '2025-07-01' });

  it('is not overdue before the due date', () => {
    expect(overdue(invoice, '2025-07-15').overdue).toBe(false);
  });

  it('is overdue after it and says by how long', () => {
    const result = overdue(invoice, '2025-08-15');
    expect(result.overdue).toBe(true);
    expect(result.days).toBe(15);
    expect(result.reason).toContain('days ago');
  });

  it('says so when there is no due date to read', () => {
    expect(overdue(selfBilledInvoice(period), '2025-08-15').reason).toContain('no issue date');
  });
});
