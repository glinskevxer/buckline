/**
 * Severance tax.
 *
 * A state taxes timber when it is cut, and no two states do it the same way.
 * Some tax the stumpage value, some tax the volume, some tax an assessed value
 * per acre that has nothing to do with either. Some exempt small landowners
 * and some exempt nobody. Some make the buyer remit it and some make the
 * seller, which decides who is in trouble when it is not paid.
 *
 * All four of those vary independently, so the jurisdiction is a record rather
 * than a rate. Writing it as a rate is how a mill operating across a state line
 * pays one state's rate on the other state's basis for a year before anybody
 * notices.
 */

import { round2, round4 } from '../num.js';
import { SettleError } from './stumpage.js';

/** What a tax is worked out on. */
export const TAX_BASES = ['stumpage value', 'volume', 'assessed value'];

/** Who sends the money. */
export const REMITTERS = ['buyer', 'seller'];

/** Builds a jurisdiction. */
export function makeJurisdiction(spec) {
  const {
    id,
    name,
    basis,
    rate,
    remitter = 'buyer',
    exemptBelowValue = 0,
    exemptBelowMbf = 0,
    appliesToPulpwood = true,
  } = spec;

  if (!id) {
    throw new SettleError('a jurisdiction needs an identifier', { path: 'id' });
  }
  if (!TAX_BASES.includes(basis)) {
    throw new SettleError(`${id} taxes on an unknown basis ${basis}`, { path: 'basis' });
  }
  if (!REMITTERS.includes(remitter)) {
    throw new SettleError(`${id} says ${remitter} remits, which is nobody`, { path: 'remitter' });
  }
  if (!(rate >= 0)) {
    throw new SettleError(`${id} has no rate`, { path: 'rate' });
  }

  return {
    id,
    name: name ?? id,
    basis,
    rate,
    remitter,
    exemptBelowValue,
    exemptBelowMbf,
    appliesToPulpwood,
  };
}

/**
 * Whether a cut is exempt, and why. Both thresholds are checked because a
 * jurisdiction can set either or both, and a cut clears only if it clears
 * every threshold that jurisdiction set.
 */
export function exemption(jurisdiction, cut) {
  const reasons = [];
  if (jurisdiction.exemptBelowValue > 0 && cut.stumpageValue < jurisdiction.exemptBelowValue) {
    reasons.push(`under the ${jurisdiction.exemptBelowValue} value threshold`);
  }
  if (jurisdiction.exemptBelowMbf > 0 && cut.netMbf < jurisdiction.exemptBelowMbf) {
    reasons.push(`under the ${jurisdiction.exemptBelowMbf} thousand board foot threshold`);
  }
  if (!jurisdiction.appliesToPulpwood && cut.product === 'pulpwood') {
    reasons.push('pulpwood is not taxed here');
  }
  return { exempt: reasons.length > 0, reasons };
}

/** The tax on one cut. */
export function taxOn(jurisdiction, cut) {
  const relief = exemption(jurisdiction, cut);
  if (relief.exempt) {
    return {
      jurisdiction: jurisdiction.id,
      basis: jurisdiction.basis,
      taxable: 0,
      tax: 0,
      remitter: jurisdiction.remitter,
      exempt: true,
      reasons: relief.reasons,
    };
  }

  let taxable;
  switch (jurisdiction.basis) {
    case 'stumpage value':
      taxable = cut.stumpageValue;
      break;
    case 'volume':
      taxable = cut.netMbf;
      break;
    case 'assessed value':
      if (!(cut.assessedValue >= 0)) {
        throw new SettleError(`${jurisdiction.id} taxes assessed value and this cut carries none`, {
          path: 'assessedValue',
        });
      }
      taxable = cut.assessedValue;
      break;
    default:
      throw new SettleError(`cannot tax on ${jurisdiction.basis}`, { path: 'basis' });
  }

  return {
    jurisdiction: jurisdiction.id,
    basis: jurisdiction.basis,
    taxable: round2(taxable),
    tax: round2(taxable * jurisdiction.rate),
    remitter: jurisdiction.remitter,
    exempt: false,
    reasons: [],
  };
}

/**
 * The same cut under two jurisdictions. A mill buying across a state line
 * needs this, and it needs it before the load is bought rather than after.
 */
export function compareJurisdictions(a, b, cut) {
  const left = taxOn(a, cut);
  const right = taxOn(b, cut);
  return {
    left,
    right,
    difference: round2(right.tax - left.tax),
    sameBasis: a.basis === b.basis,
    sameRemitter: a.remitter === b.remitter,
  };
}

/**
 * A deduction line the settlement can take, or null when the seller remits it
 * themselves. This is the join with the deduction schedule and it is the place
 * the remitter field earns its keep.
 */
export function asDeduction(jurisdiction, cut, options = {}) {
  const { name = 'severance tax' } = options;
  const result = taxOn(jurisdiction, cut);
  if (result.exempt || result.tax === 0) return null;
  if (jurisdiction.remitter === 'seller') return null;
  return {
    name,
    class: 'statutory',
    basis: 'flat',
    amount: result.tax,
  };
}

/** The effective rate against the stumpage value, whatever the basis. */
export function effectiveRate(jurisdiction, cut) {
  const result = taxOn(jurisdiction, cut);
  if (!(cut.stumpageValue > 0)) return 0;
  return round4(result.tax / cut.stumpageValue);
}
