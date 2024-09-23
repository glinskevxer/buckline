/**
 * A recovery study.
 *
 * Take a set of logs, saw them on paper under every pattern the mill can run,
 * grade what comes off, price it, and say which pattern makes the most money
 * on this class of log. The answer is not the same for every log and that is
 * the whole point: a mill running one pattern all week is right about half its
 * deck and wrong about the other half.
 *
 * The study is on paper because the alternative is sawing the same log four
 * ways, which nobody can do. That means the numbers are only as good as the
 * grade lift each pattern claims, and those are the mill's own measured
 * figures rather than anything universal. The study says what it assumed.
 */

import { round2, round4, sum } from '../num.js';
import { PATTERNS, saw } from '../mill/pattern.js';
import { lumberRecoveryFactor, overrun } from '../mill/recovery.js';
import { priceFor, valueOf } from '../price/list.js';
import { BucklineError } from '../errors.js';

export class StudyError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'STUDY', ...options });
    this.name = 'StudyError';
  }
}

/**
 * Sawing one log under one pattern, priced. The grade the boards make is
 * modelled as the pattern's grade lift applied to a base grade, because
 * grading imagined boards from a defect map the log does not carry would be
 * inventing precision.
 */
export function studyLog(log, pattern, priceList, options = {}) {
  const { baseGrade = '1C', liftGrade = 'FAS' } = options;
  const result = saw(log, pattern, options);
  const lift = result.settings.gradeLift ?? 0;

  const liftedFeet = round2(result.boardFeet * lift);
  const baseFeet = round2(result.boardFeet - liftedFeet);

  const basePrice = priceFor(priceList, log.species, baseGrade);
  const liftPrice = priceFor(priceList, log.species, liftGrade);

  return {
    logId: log.id,
    pattern,
    boardFeet: result.boardFeet,
    boardCount: result.boardCount,
    averageWidthIn: result.averageWidthIn,
    gradeLift: lift,
    liftedBoardFeet: liftedFeet,
    baseBoardFeet: baseFeet,
    value: round2(valueOf(baseFeet, basePrice.perMbf) + valueOf(liftedFeet, liftPrice.perMbf)),
  };
}

/** Every pattern on one log, most valuable first. */
export function studyPatterns(log, priceList, options = {}) {
  const rows = PATTERNS.map((pattern) => studyLog(log, pattern, priceList, options));
  return rows.sort((a, b) => b.value - a.value);
}

/**
 * A whole deck. Each log is studied under every pattern and the best is taken,
 * so the study says what the deck is worth if the mill picks per log rather
 * than running one pattern all week.
 */
export function studyDeck(logs, priceList, options = {}) {
  if (!Array.isArray(logs) || logs.length === 0) {
    throw new StudyError('a study needs at least one log', { path: 'logs' });
  }

  const perLog = logs.map((log) => {
    const rows = studyPatterns(log, priceList, options);
    return { log, best: rows[0], rows };
  });

  const byPattern = PATTERNS.map((pattern) => {
    const rows = perLog.map((entry) => entry.rows.find((row) => row.pattern === pattern));
    return {
      pattern,
      boardFeet: sum(
        rows.map((row) => row.boardFeet),
        2
      ),
      value: sum(
        rows.map((row) => row.value),
        2
      ),
      bestForLogs: perLog.filter((entry) => entry.best.pattern === pattern).length,
    };
  }).sort((a, b) => b.value - a.value);

  const perLogValue = sum(
    perLog.map((entry) => entry.best.value),
    2
  );
  const oneSize = byPattern[0];

  return {
    logCount: logs.length,
    perLog,
    byPattern,
    bestSinglePattern: oneSize.pattern,
    singlePatternValue: oneSize.value,
    perLogValue,
    uplift: round2(perLogValue - oneSize.value),
    upliftShare: oneSize.value > 0 ? round4((perLogValue - oneSize.value) / oneSize.value) : 0,
  };
}

/**
 * The mill's own numbers alongside the study: recovery factor and overrun
 * against the rule the wood was bought on.
 */
export function studySummary(logs, study, contractRule, options = {}) {
  const boardFeet = sum(
    study.perLog.map((entry) => entry.best.boardFeet),
    2
  );
  return {
    ...lumberRecoveryFactor(logs, boardFeet),
    ...overrun(logs, boardFeet, contractRule, options),
    valuePerMbf: boardFeet > 0 ? round2((study.perLogValue / boardFeet) * 1000) : 0,
  };
}

/** What the study assumed, printed so nobody mistakes it for a measurement. */
export function studyAssumptions(options = {}) {
  const { baseGrade = '1C', liftGrade = 'FAS', thicknessIn = 1, kerfIn = 0.125 } = options;
  return [
    `boards fall to ${baseGrade} unless the pattern lifts them to ${liftGrade}`,
    `grade lift per pattern is the mill's own measured figure, not a published one`,
    `sawn at ${thicknessIn} inch with a ${kerfIn} inch kerf`,
    'no defect map is used, so no board is downgraded for what is actually in it',
  ];
}
