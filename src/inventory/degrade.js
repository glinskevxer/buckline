/**
 * What happens to a log while it waits.
 *
 * Three things attack a log on a deck and they arrive in a different order for
 * different species, which is why "how long can I hold this" has no single
 * answer.
 *
 * Sap stain is a fungus in the sapwood and it needs warmth and free water. It
 * is fastest in the light coloured species where it also matters most: nobody
 * can see stain in walnut heartwood and everybody can see it in maple.
 *
 * End checking is the ends drying faster than the middle and splitting back.
 * It is worst in the species that shrink hardest and it is the one thing on
 * this list that end sealing actually stops.
 *
 * Ambrosia beetles bore in and bring their own fungus. They fly in warm
 * weather and they will not touch a log under water spray, which is why a mill
 * that holds logs through July owns a sprinkler.
 */

import { round2, round4 } from '../num.js';
import { lookupSpecies } from '../model/species.js';
import { DeckError } from './deck.js';

/** How wood is held on the deck. */
export const STORAGE = ['open', 'end sealed', 'sprinkled', 'ponded'];

/** How fast things move, by season. */
const SEASON_RATE = { winter: 0.15, spring: 0.8, summer: 1, autumn: 0.6 };

/** What each way of holding wood does to each defect. */
const STORAGE_EFFECT = {
  open: { stain: 1, check: 1, beetle: 1 },
  'end sealed': { stain: 1, check: 0.15, beetle: 1 },
  sprinkled: { stain: 0.2, check: 0.1, beetle: 0 },
  ponded: { stain: 0.05, check: 0.05, beetle: 0 },
};

/** The season a date falls in, on a northern hardwood calendar. */
export function seasonOf(isoDate) {
  const month = Number(String(isoDate).slice(5, 7));
  if (Number.isNaN(month) || month < 1 || month > 12) {
    throw new DeckError(`cannot read a month out of ${isoDate}`, { path: 'isoDate' });
  }
  if (month <= 2 || month === 12) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

/**
 * Per day rates for one species under one way of holding it. Sapwood heavy
 * light coloured species stain fast; heavy shrinking species check fast.
 */
export function degradeRates(species, options = {}) {
  const { season = 'summer', storage = 'open' } = options;
  const entry = lookupSpecies(species);
  const effect = STORAGE_EFFECT[storage];
  if (!effect) {
    throw new DeckError(`nobody holds logs ${storage}`, { path: 'storage' });
  }
  const seasonRate = SEASON_RATE[season];
  if (seasonRate === undefined) {
    throw new DeckError(`there is no season called ${season}`, { path: 'season' });
  }

  const stainProne = entry.mineralStreakCounts || entry.densityLbPerFt3 < 40 ? 1.4 : 0.8;
  const checkProne = entry.shrinkTangentialPct / 8;

  return {
    species: entry.key,
    season,
    storage,
    stainPerDay: round4(0.012 * stainProne * seasonRate * effect.stain),
    checkPerDay: round4(0.008 * checkProne * seasonRate * effect.check),
    beetlePerDay: round4(0.006 * seasonRate * effect.beetle),
  };
}

/**
 * How far each defect has got after a number of days, as a share of the log
 * that is affected, capped at everything.
 */
export function degradeAfter(species, days, options = {}) {
  if (!(days >= 0)) {
    throw new DeckError('days on the deck cannot be negative', { path: 'days' });
  }
  const rates = degradeRates(species, options);
  const shares = {
    stain: Math.min(1, rates.stainPerDay * days),
    check: Math.min(1, rates.checkPerDay * days),
    beetle: Math.min(1, rates.beetlePerDay * days),
  };

  const worst = Object.entries(shares).sort((a, b) => b[1] - a[1])[0];
  return {
    ...rates,
    days,
    shares: {
      stain: round4(shares.stain),
      check: round4(shares.check),
      beetle: round4(shares.beetle),
    },
    firstToShow: worst[1] > 0 ? worst[0] : null,
    worstShare: round4(worst[1]),
  };
}

/**
 * What the waiting cost. Stain and beetle downgrade the wood; checking takes
 * length off both ends and that is a volume loss rather than a grade one, so
 * they are reported separately and never added together.
 */
export function holdingCost(species, days, netBoardFeet, perMbf, options = {}) {
  const state = degradeAfter(species, days, options);
  const gradeLoss = Math.min(0.6, state.shares.stain * 0.35 + state.shares.beetle * 0.45);
  const volumeLoss = Math.min(0.15, state.shares.check * 0.15);

  const startValue = (netBoardFeet / 1000) * perMbf;
  const afterVolume = netBoardFeet * (1 - volumeLoss);
  const endValue = (afterVolume / 1000) * perMbf * (1 - gradeLoss);

  return {
    days,
    startValue: round2(startValue),
    endValue: round2(endValue),
    lostValue: round2(startValue - endValue),
    lostBoardFeet: round2(netBoardFeet - afterVolume),
    gradeLossShare: round4(gradeLoss),
    volumeLossShare: round4(volumeLoss),
    firstToShow: state.firstToShow,
  };
}

/**
 * The most days a log can sit before the holding cost passes a limit. Answered
 * by walking a day at a time, because the two losses compound differently and
 * the closed form is not worth the mistake.
 */
export function safeHoldingDays(species, perMbf, options = {}) {
  const { limitShare = 0.05, maxDays = 365 } = options;
  for (let days = 1; days <= maxDays; days += 1) {
    const cost = holdingCost(species, days, 1000, perMbf, options);
    if (cost.lostValue / cost.startValue > limitShare) return days - 1;
  }
  return maxDays;
}
