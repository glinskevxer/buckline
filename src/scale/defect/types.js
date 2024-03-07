/**
 * The defect catalogue.
 *
 * A defect is described by what it does to the wood, not by how much volume it
 * costs. How much it costs depends on the rule in force, and that lives in the
 * deduction code. What lives here is the part that does not change: whether
 * the fault runs through the log or sits on the surface, whether it is a
 * matter of form rather than soundness, and whether it destroys wood or merely
 * downgrades it.
 *
 * The distinction that matters most is `extent`. A fault that occupies a
 * definite volume can be deducted by squaring it out. A fault that spoils
 * everything it passes through has to be deducted by taking length or diameter
 * off the whole log, and no amount of measuring the fault itself will get the
 * right answer.
 */

const CATALOGUE = {
  sweep: {
    id: 'sweep',
    label: 'sweep',
    kind: 'form',
    extent: 'whole log',
    sound: true,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'percentage',
  },
  crook: {
    id: 'crook',
    label: 'crook',
    kind: 'form',
    extent: 'local',
    sound: true,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'length',
  },
  'butt flare': {
    id: 'butt flare',
    label: 'butt flare',
    kind: 'form',
    extent: 'local',
    sound: true,
    surfaceVisible: true,
    affectsLogGrade: false,
    prefers: 'diameter',
  },
  crotch: {
    id: 'crotch',
    label: 'crotch',
    kind: 'form',
    extent: 'local',
    sound: true,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'length',
  },
  'heart rot': {
    id: 'heart rot',
    label: 'heart rot',
    kind: 'decay',
    extent: 'interior',
    sound: false,
    surfaceVisible: false,
    affectsLogGrade: true,
    prefers: 'squared',
  },
  'sap rot': {
    id: 'sap rot',
    label: 'sap rot',
    kind: 'decay',
    extent: 'shell',
    sound: false,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'diameter',
  },
  punk: {
    id: 'punk',
    label: 'punk knot',
    kind: 'decay',
    extent: 'local',
    sound: false,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'squared',
  },
  'ring shake': {
    id: 'ring shake',
    label: 'ring shake',
    kind: 'separation',
    extent: 'whole log',
    sound: false,
    surfaceVisible: false,
    affectsLogGrade: true,
    prefers: 'percentage',
  },
  'heart check': {
    id: 'heart check',
    label: 'heart check',
    kind: 'separation',
    extent: 'interior',
    sound: true,
    surfaceVisible: false,
    affectsLogGrade: false,
    prefers: 'squared',
  },
  seam: {
    id: 'seam',
    label: 'bark seam',
    kind: 'separation',
    extent: 'local',
    sound: true,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'length',
  },
  catface: {
    id: 'catface',
    label: 'catface',
    kind: 'wound',
    extent: 'local',
    sound: false,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'squared',
  },
  hole: {
    id: 'hole',
    label: 'hole',
    kind: 'wound',
    extent: 'local',
    sound: false,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'squared',
  },
  'sound knot': {
    id: 'sound knot',
    label: 'sound knot',
    kind: 'knot',
    extent: 'local',
    sound: true,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'none',
  },
  'unsound knot': {
    id: 'unsound knot',
    label: 'unsound knot',
    kind: 'knot',
    extent: 'local',
    sound: false,
    surfaceVisible: true,
    affectsLogGrade: true,
    prefers: 'squared',
  },
  'metal in log': {
    id: 'metal in log',
    label: 'metal in log',
    kind: 'foreign',
    extent: 'local',
    sound: true,
    surfaceVisible: false,
    affectsLogGrade: true,
    prefers: 'length',
  },
};

/** Every defect id the catalogue knows, sorted. */
export function defectIds() {
  return Object.keys(CATALOGUE).sort();
}

/** The catalogue entry for a defect, or null if it is not one we record. */
export function defectType(id) {
  if (typeof id !== 'string') return null;
  const key = id.trim().toLowerCase().replace(/\s+/g, ' ');
  return Object.prototype.hasOwnProperty.call(CATALOGUE, key) ? { ...CATALOGUE[key] } : null;
}

/** True when the defect leaves the wood it touches usable. */
export function isSound(id) {
  const entry = defectType(id);
  return entry ? entry.sound : false;
}

/** True when a scaler standing beside the log can see it. */
export function isVisible(id) {
  const entry = defectType(id);
  return entry ? entry.surfaceVisible : false;
}

/** Every defect of one kind, sorted. */
export function defectsOfKind(kind) {
  return defectIds().filter((id) => CATALOGUE[id].kind === kind);
}

/** Every kind the catalogue uses, sorted. */
export function defectKinds() {
  return [...new Set(defectIds().map((id) => CATALOGUE[id].kind))].sort();
}
