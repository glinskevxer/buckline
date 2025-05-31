/**
 * The species register.
 *
 * Species is not decoration. It picks the bark deduction, it picks the grading
 * rule book, it decides how much a board shrinks between the green chain and
 * the shed, and it decides whether a defect is a defect at all. Mineral streak
 * is a grading defect in hard maple and nobody looks twice at it in red oak.
 *
 * Shrinkage figures are green to oven dry, as a percentage of the green
 * dimension, taken tangentially and radially. Boards shrink mostly across the
 * width, so the tangential figure is the one that moves a grade.
 */

import { ContractError } from '../errors.js';

/** The two rule books. A species belongs to exactly one. */
export const RULE_BOOKS = {
  hardwood: 'nhla',
  softwood: 'structural',
};

const REGISTER = {
  'red oak': {
    group: 'hardwood',
    common: 'red oak',
    botanical: 'Quercus rubra',
    densityLbPerFt3: 44,
    shrinkTangentialPct: 8.6,
    shrinkRadialPct: 4.0,
    veneerCandidate: true,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  'white oak': {
    group: 'hardwood',
    common: 'white oak',
    botanical: 'Quercus alba',
    densityLbPerFt3: 47,
    shrinkTangentialPct: 10.5,
    shrinkRadialPct: 5.6,
    veneerCandidate: true,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  'hard maple': {
    group: 'hardwood',
    common: 'hard maple',
    botanical: 'Acer saccharum',
    densityLbPerFt3: 44,
    shrinkTangentialPct: 9.9,
    shrinkRadialPct: 4.8,
    veneerCandidate: true,
    mineralStreakCounts: true,
    heartRotProne: false,
  },
  'soft maple': {
    group: 'hardwood',
    common: 'soft maple',
    botanical: 'Acer rubrum',
    densityLbPerFt3: 38,
    shrinkTangentialPct: 8.2,
    shrinkRadialPct: 4.0,
    veneerCandidate: false,
    mineralStreakCounts: true,
    heartRotProne: false,
  },
  'yellow poplar': {
    group: 'hardwood',
    common: 'yellow poplar',
    botanical: 'Liriodendron tulipifera',
    densityLbPerFt3: 30,
    shrinkTangentialPct: 8.2,
    shrinkRadialPct: 4.6,
    veneerCandidate: false,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  'black cherry': {
    group: 'hardwood',
    common: 'black cherry',
    botanical: 'Prunus serotina',
    densityLbPerFt3: 35,
    shrinkTangentialPct: 7.1,
    shrinkRadialPct: 3.7,
    veneerCandidate: true,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  'black walnut': {
    group: 'hardwood',
    common: 'black walnut',
    botanical: 'Juglans nigra',
    densityLbPerFt3: 38,
    shrinkTangentialPct: 7.8,
    shrinkRadialPct: 5.5,
    veneerCandidate: true,
    mineralStreakCounts: false,
    heartRotProne: true,
  },
  ash: {
    group: 'hardwood',
    common: 'white ash',
    botanical: 'Fraxinus americana',
    densityLbPerFt3: 41,
    shrinkTangentialPct: 7.8,
    shrinkRadialPct: 4.9,
    veneerCandidate: false,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  hickory: {
    group: 'hardwood',
    common: 'hickory',
    botanical: 'Carya ovata',
    densityLbPerFt3: 51,
    shrinkTangentialPct: 10.5,
    shrinkRadialPct: 7.0,
    veneerCandidate: false,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  beech: {
    group: 'hardwood',
    common: 'american beech',
    botanical: 'Fagus grandifolia',
    densityLbPerFt3: 45,
    shrinkTangentialPct: 11.9,
    shrinkRadialPct: 5.5,
    veneerCandidate: false,
    mineralStreakCounts: false,
    heartRotProne: true,
  },
  basswood: {
    group: 'hardwood',
    common: 'basswood',
    botanical: 'Tilia americana',
    densityLbPerFt3: 26,
    shrinkTangentialPct: 9.3,
    shrinkRadialPct: 6.6,
    veneerCandidate: false,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  'shortleaf pine': {
    group: 'softwood',
    common: 'shortleaf pine',
    botanical: 'Pinus echinata',
    densityLbPerFt3: 35,
    shrinkTangentialPct: 7.7,
    shrinkRadialPct: 4.6,
    veneerCandidate: false,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  'loblolly pine': {
    group: 'softwood',
    common: 'loblolly pine',
    botanical: 'Pinus taeda',
    densityLbPerFt3: 36,
    shrinkTangentialPct: 7.4,
    shrinkRadialPct: 4.8,
    veneerCandidate: false,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
  'eastern hemlock': {
    group: 'softwood',
    common: 'eastern hemlock',
    botanical: 'Tsuga canadensis',
    densityLbPerFt3: 28,
    shrinkTangentialPct: 6.8,
    shrinkRadialPct: 3.0,
    veneerCandidate: false,
    mineralStreakCounts: false,
    heartRotProne: false,
  },
};

/** Canonical key for a species written any of the usual ways. */
export function normalizeSpecies(name) {
  if (typeof name !== 'string') {
    throw new ContractError(`species must be text, got ${typeof name}`);
  }
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Returns the register entry, or throws if the yard does not buy the species. */
export function lookupSpecies(name) {
  const key = normalizeSpecies(name);
  if (!Object.prototype.hasOwnProperty.call(REGISTER, key)) {
    throw new ContractError(`no species register entry for ${key}`, {
      path: 'species',
      hint: `the yard buys ${speciesKeys().slice(0, 4).join(', ')} and nine more`,
    });
  }
  return { key, ...REGISTER[key] };
}

/** True when the yard buys the species at all. */
export function knownSpecies(name) {
  try {
    lookupSpecies(name);
    return true;
  } catch {
    return false;
  }
}

/** Every species key the register carries, sorted. */
export function speciesKeys() {
  return Object.keys(REGISTER).sort();
}

/** Every species in a group, sorted. */
export function speciesInGroup(group) {
  return speciesKeys().filter((key) => REGISTER[key].group === group);
}

/**
 * Which rule book grades this species. This is the first link in the grading
 * chain: the species picks the book, the book picks which measurement decides
 * the grade, and only then does anything get measured.
 */
export function ruleBookFor(name) {
  const entry = lookupSpecies(name);
  return RULE_BOOKS[entry.group];
}
