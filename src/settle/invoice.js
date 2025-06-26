/**
 * The self billed invoice.
 *
 * A landowner does not send the mill an invoice. The mill works out what it
 * owes and sends the landowner a document that is an invoice in everything but
 * who wrote it, and that arrangement has one consequence that matters: the
 * party being paid never sees the calculation until after it is done.
 *
 * So the document has to be arguable. Every line has to trace to a ticket, the
 * tax has to be shown separately whoever remits it, and the reference has to
 * be stable so the same load cannot be paid twice under two numbers.
 */

import { round2, sum } from '../num.js';
import { SettleError } from './stumpage.js';
import { taxOn } from './tax.js';

/** Builds the reference a self billed invoice is filed under. */
export function invoiceReference(period, agreementId, sequence) {
  if (!period || !agreementId) {
    throw new SettleError('an invoice reference needs a period and an agreement', {
      path: 'reference',
    });
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new SettleError('an invoice reference needs a whole sequence number from one', {
      path: 'sequence',
    });
  }
  return `SB-${agreementId}-${period.replace('-', '')}-${String(sequence).padStart(3, '0')}`;
}

/**
 * Builds the invoice from a rolled up period. Nothing is recomputed: the
 * period statement is the calculation and this is the document.
 */
export function selfBilledInvoice(period, options = {}) {
  const {
    sequence = 1,
    jurisdiction = null,
    supplierReference = null,
    issuedOn = null,
    terms = 30,
  } = options;

  if (!period || !Array.isArray(period.loads) || period.loads.length === 0) {
    throw new SettleError('an invoice needs a period with loads on it', { path: 'period' });
  }
  if (!(terms > 0)) {
    throw new SettleError('payment terms have to be a number of days', { path: 'terms' });
  }

  const reference = invoiceReference(period.period ?? 'unknown', period.agreement, sequence);
  const lines = period.loads.map((load) => ({
    ticket: load.statementId,
    load: load.loadId,
    scaledOn: load.scaledOn,
    mbf: load.netMbf,
    gross: load.gross,
    deductions: load.deductions,
    net: load.landowner,
  }));

  const netTotal = round2(
    sum(
      lines.map((line) => line.net),
      2
    )
  );
  let tax = null;
  if (jurisdiction) {
    tax = taxOn(jurisdiction, {
      stumpageValue: netTotal,
      netMbf: period.netMbf,
      product: 'sawlog',
      assessedValue: options.assessedValue,
    });
  }

  return {
    reference,
    supplierReference,
    issuedOn,
    dueOn: issuedOn ? addDays(issuedOn, terms) : null,
    terms,
    period: period.period ?? null,
    agreement: period.agreement,
    supplier: period.landowner,
    lines,
    netTotal,
    minimumVolume: period.minimumVolume.charge,
    advanceRecovered: period.advance.recovered,
    tax,
    payable: round2(
      netTotal +
        period.minimumVolume.charge -
        period.advance.recovered -
        (tax && tax.remitter === 'buyer' ? tax.tax : 0)
    ),
  };
}

/**
 * Checks two invoices do not pay for the same load. A self billed run repeats
 * every month and the failure mode is a load that slipped a period boundary
 * being picked up twice.
 */
export function duplicateLoads(invoices) {
  const seen = new Map();
  const duplicates = [];
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      const before = seen.get(line.load);
      if (before) {
        duplicates.push({ load: line.load, on: [before, invoice.reference] });
      } else {
        seen.set(line.load, invoice.reference);
      }
    }
  }
  return { clean: duplicates.length === 0, duplicates, loads: seen.size };
}

/** Whether an invoice is overdue on a date. */
export function overdue(invoice, onDate) {
  if (!invoice.dueOn) return { overdue: false, days: null, reason: 'no issue date on the invoice' };
  const days = Math.round((Date.parse(onDate) - Date.parse(invoice.dueOn)) / 86400000);
  return {
    overdue: days > 0,
    days,
    reason: days > 0 ? `due ${invoice.dueOn}, ${days} days ago` : null,
  };
}

function addDays(isoDate, days) {
  return new Date(Date.parse(isoDate) + days * 86400000).toISOString().slice(0, 10);
}
