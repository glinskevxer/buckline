/**
 * The scaler register.
 *
 * A scale is only worth anything if the person who made it was allowed to make
 * it. Certification is not a formality: a scaler is certified on particular
 * rules, the certificate expires, and it can be suspended on the strength of
 * check scales without expiring.
 *
 * The distinction that matters and gets missed: a scale made by somebody not
 * certified for that rule is not a bad scale, it is not a scale. The load has
 * not been scaled and has to be scaled again. Treating it as a scale with a
 * problem is how a load gets paid on a number nobody stands behind.
 */

import { BucklineError } from '../errors.js';
import { round2, round4 } from '../num.js';
import { ruleIds } from '../scale/rules/index.js';
import { date, list, string, validateAs } from '../valid/check.js';

export class ScalerError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'SCALER', ...options });
    this.name = 'ScalerError';
  }
}

/** What a certificate can be in. */
export const CERTIFICATE_STATES = ['current', 'suspended', 'withdrawn'];

const scalerSchema = {
  id: string(),
  name: string(),
  endorsements: list(string(), { minLength: 1 }),
  certifiedFrom: date(),
  certifiedTo: date(),
  state: string({ oneOf: CERTIFICATE_STATES, default: 'current' }),
  suspendedReason: string({ optional: true }),
};

/**
 * Builds a scaler record.
 *
 * The shape is checked by the schema and the cross field rules are checked
 * here, because a schema cannot say that a suspension needs a reason or that
 * an endorsement has to name a rule this program scales under.
 */
export function makeScaler(spec) {
  const checked = validateAs(
    spec,
    scalerSchema,
    (error) => new ScalerError(error.message, { path: error.path, cause: error }),
    { label: 'scaler' }
  );

  const known = ruleIds();
  for (const rule of checked.endorsements) {
    if (!known.includes(rule)) {
      throw new ScalerError(`${checked.name} is endorsed on ${rule}, which nobody scales under`, {
        path: 'endorsements',
      });
    }
  }
  if (checked.certifiedTo < checked.certifiedFrom) {
    throw new ScalerError(`${checked.name} has a certificate that ends before it starts`, {
      path: 'certifiedTo',
    });
  }
  if (checked.state === 'suspended' && !checked.suspendedReason) {
    throw new ScalerError(`${checked.name} is suspended for no stated reason`, {
      path: 'suspendedReason',
    });
  }

  return {
    id: checked.id,
    name: checked.name,
    endorsements: [...checked.endorsements].sort(),
    certifiedFrom: checked.certifiedFrom,
    certifiedTo: checked.certifiedTo,
    state: checked.state,
    suspendedReason: checked.suspendedReason ?? null,
  };
}

/**
 * Whether this scaler could scale this load, under this rule, on this date.
 * Every reason it could not is listed, because a scaler whose certificate has
 * lapsed and who was never endorsed on the rule needs to hear both.
 */
export function admissible(scaler, ruleId, onDate) {
  const reasons = [];
  if (scaler.state === 'withdrawn') {
    reasons.push(`${scaler.name} no longer holds a certificate`);
  }
  if (scaler.state === 'suspended') {
    reasons.push(`${scaler.name} is suspended: ${scaler.suspendedReason}`);
  }
  if (!scaler.endorsements.includes(ruleId)) {
    reasons.push(
      `${scaler.name} is endorsed on ${scaler.endorsements.join(', ')}, not on ${ruleId}`
    );
  }
  if (onDate < scaler.certifiedFrom) {
    reasons.push(`${scaler.name} was not certified until ${scaler.certifiedFrom}`);
  }
  if (onDate > scaler.certifiedTo) {
    reasons.push(`${scaler.name}'s certificate lapsed on ${scaler.certifiedTo}`);
  }
  return { admissible: reasons.length === 0, reasons };
}

/** Days until a certificate lapses, negative once it has. */
export function daysToExpiry(scaler, onDate) {
  const days = (Date.parse(scaler.certifiedTo) - Date.parse(onDate)) / 86400000;
  return Number.isNaN(days) ? null : Math.round(days);
}

/** Whose certificates need renewing soon. */
export function renewalsDue(scalers, onDate, options = {}) {
  const { withinDays = 60 } = options;
  return scalers
    .map((scaler) => ({ scaler, days: daysToExpiry(scaler, onDate) }))
    .filter((row) => row.days !== null && row.days <= withinDays)
    .sort((a, b) => a.days - b.days)
    .map((row) => ({
      id: row.scaler.id,
      name: row.scaler.name,
      certifiedTo: row.scaler.certifiedTo,
      daysLeft: row.days,
      lapsed: row.days < 0,
    }));
}

/**
 * Suspends a scaler on the strength of a run of check scales. The rule the
 * yard works to: two failed check scales inside a quarter, or one that is out
 * by more than a tenth.
 */
export function reviewChecks(scaler, checks, options = {}) {
  const { failsAllowed = 1, badShare = 0.1 } = options;
  const fails = checks.filter((check) => check.verdict === 'fail');
  const bad = checks.filter((check) => Math.abs(check.differenceShare ?? 0) > badShare);

  const reasons = [];
  if (fails.length > failsAllowed) {
    reasons.push(`${fails.length} failed check scales`);
  }
  if (bad.length > 0) {
    reasons.push(`a check scale out by ${round4(Math.abs(bad[0].differenceShare)) * 100} percent`);
  }

  if (reasons.length === 0) {
    return { scaler, changed: false, reasons: [] };
  }
  return {
    scaler: { ...scaler, state: 'suspended', suspendedReason: reasons.join('; ') },
    changed: true,
    reasons,
  };
}

/** A line for the certificate board in the scale house. */
export function describeScaler(scaler, onDate) {
  const days = daysToExpiry(scaler, onDate);
  const left = days === null ? '' : days < 0 ? 'lapsed' : `${days} days left`;
  return `${scaler.name} (${scaler.id}) ${scaler.state} on ${scaler.endorsements.join('/')} ${left}`.trim();
}

/** The share of a set of check scales this scaler passed. */
export function passRate(checks) {
  if (checks.length === 0) return null;
  const passed = checks.filter((check) => check.verdict === 'pass').length;
  return round2(passed / checks.length);
}
