/**
 * Deductions.
 *
 * Money that comes off a settlement between the gross and the cheque. They are
 * not a list to be summed, because they are taken in a fixed order and some of
 * them are worked out on the running balance rather than on the gross.
 *
 * The order is statutory, then contractual, then advances:
 *
 *   statutory     severance tax and the like, computed on the gross, because
 *                 the state does not care what the parties agreed between
 *                 themselves
 *   contractual   insurance, road maintenance, equipment rental, computed on
 *                 the gross unless the contract says otherwise
 *   advances      recouped out of what is left, never taking the settlement
 *                 negative and never taking more than is outstanding
 *
 * Taking an advance before a statutory deduction produces a smaller tax and a
 * bigger cheque, and it is wrong. Taking a percentage deduction on the running
 * balance instead of the gross produces a smaller deduction, and whether that
 * is wrong depends on the contract, which is why the basis is on every line
 * rather than assumed.
 */

import { round2 } from '../num.js';
import { SettleError } from './stumpage.js';

/** The three classes, in the order they are taken. */
export const DEDUCTION_CLASSES = ['statutory', 'contractual', 'advance'];

/** What a deduction is worked out on. */
export const DEDUCTION_BASES = ['gross', 'running', 'flat', 'per mbf'];

/** Checks one deduction line makes sense on its own. */
export function checkDeduction(line) {
  if (!DEDUCTION_CLASSES.includes(line.class)) {
    throw new SettleError(`${line.name} is in an unknown class ${line.class}`, { path: 'class' });
  }
  if (!DEDUCTION_BASES.includes(line.basis)) {
    throw new SettleError(`${line.name} is worked out on an unknown basis ${line.basis}`, {
      path: 'basis',
    });
  }
  if (line.basis === 'flat' && !(line.amount >= 0)) {
    throw new SettleError(`${line.name} is a flat charge with no amount`, { path: 'amount' });
  }
  if (line.basis !== 'flat' && !(line.rate >= 0)) {
    throw new SettleError(`${line.name} has no rate`, { path: 'rate' });
  }
  if (line.class === 'advance' && line.basis !== 'running') {
    throw new SettleError('an advance is recouped out of what is left, so it runs on the balance', {
      path: 'basis',
    });
  }
  return true;
}

function amountFor(line, gross, running, netMbf) {
  switch (line.basis) {
    case 'gross':
      return gross * line.rate;
    case 'running':
      return running * line.rate;
    case 'flat':
      return line.amount;
    case 'per mbf':
      return netMbf * line.rate;
    default:
      throw new SettleError(`cannot compute a ${line.basis} deduction`, { path: 'basis' });
  }
}

/**
 * Runs a whole deduction schedule against a gross settlement.
 *
 * `outstanding` maps an advance name to what is still owed on it. Advances are
 * capped at what is outstanding and at what is left in the settlement.
 */
export function applyDeductions(gross, netMbf, lines, options = {}) {
  const { outstanding = {} } = options;
  if (gross < 0) {
    throw new SettleError('a settlement gross cannot be negative', { path: 'gross' });
  }
  for (const line of lines) checkDeduction(line);

  const ordered = DEDUCTION_CLASSES.flatMap((cls) => lines.filter((line) => line.class === cls));

  let running = gross;
  const applied = [];
  const remaining = { ...outstanding };

  for (const line of ordered) {
    let amount = amountFor(line, gross, running, netMbf);
    let capped = false;
    let reason = null;

    if (line.class === 'advance') {
      const owed = remaining[line.name] ?? 0;
      if (owed <= 0) {
        applied.push({ ...summary(line), amount: 0, capped: false, reason: 'nothing outstanding' });
        continue;
      }
      if (amount > owed) {
        amount = owed;
        capped = true;
        reason = 'capped at what is outstanding';
      }
      remaining[line.name] = round2(owed - Math.min(amount, running));
    }

    if (amount > running) {
      amount = running;
      capped = true;
      reason = 'capped at what was left in the settlement';
    }

    amount = round2(Math.max(0, amount));
    running = round2(running - amount);
    applied.push({ ...summary(line), amount, capped, reason });
  }

  return {
    gross: round2(gross),
    lines: applied,
    totalDeducted: round2(gross - running),
    net: running,
    outstanding: remaining,
  };
}

function summary(line) {
  return {
    name: line.name,
    class: line.class,
    basis: line.basis,
    rate: line.rate ?? null,
  };
}

/** Groups the applied lines by class, for the statement. */
export function byClass(result) {
  return DEDUCTION_CLASSES.map((cls) => {
    const lines = result.lines.filter((line) => line.class === cls);
    return {
      class: cls,
      lines,
      total: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
    };
  }).filter((group) => group.lines.length > 0);
}
