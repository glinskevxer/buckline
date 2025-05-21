/**
 * Checking the program against itself.
 *
 * Most of this program is tables: log rules, species, defects, grades, kiln
 * schedules, prices. Tables get edited, and an edit that breaks the join
 * between two of them does not fail until somebody scales a load of the one
 * species that fell through the gap.
 *
 * These checks walk every table against every table it joins to and report
 * what does not line up. They are cheap, they run on demand, and they are the
 * first thing to run after anybody edits a table.
 *
 * Each check answers one question and says what it looked at, because a check
 * that passes silently is indistinguishable from a check that did not run.
 */

import { RULE_BOOKS, lookupSpecies, ruleBookFor, speciesKeys } from './model/species.js';
import { getRule, rulePolicy, ruleIds } from './scale/rules/index.js';
import { defectIds, defectType } from './scale/defect/types.js';
import { isMeasurable, methodNames } from './scale/defect/policy.js';
import { GRADE_MULTIPLIER } from './price/list.js';
import { LUMBER_GRADES } from './grade/lumber/spec.js';
import { FACTORY_GRADES } from './grade/log/usfs.js';
import { schedule, scheduleFor, scheduleIds } from './kiln/schedule.js';

/** Every rule module exports what the register expects of it. */
export function checkRules() {
  const problems = [];
  const ids = ruleIds();
  for (const id of ids) {
    const rule = getRule(id);
    for (const name of ['gross', 'scale', 'column']) {
      if (typeof rule[name] !== 'function') {
        problems.push(`${id} has no ${name}`);
      }
    }
    const policy = rulePolicy(id);
    if (!methodNames().includes(policy.deductionMethod)) {
      problems.push(`${id} takes deductions on ${policy.deductionMethod}, which is not a method`);
    }
    if (!(policy.roundsTo > 0)) {
      problems.push(`${id} rounds to ${policy.roundsTo}`);
    }
    if (rule.scale(20, 16) <= 0) {
      problems.push(`${id} finds nothing in a twenty inch log`);
    }
  }
  return { check: 'log rules', looked: ids.length, problems };
}

/** Every species maps to a rule book that has a grader behind it. */
export function checkSpecies() {
  const problems = [];
  const keys = speciesKeys();
  const books = new Set(Object.values(RULE_BOOKS));
  for (const key of keys) {
    const entry = lookupSpecies(key);
    const book = ruleBookFor(key);
    if (!books.has(book)) {
      problems.push(`${key} grades on ${book}, which has no rule book`);
    }
    if (!(entry.densityLbPerFt3 > 0)) {
      problems.push(`${key} has no density`);
    }
    if (entry.shrinkTangentialPct <= entry.shrinkRadialPct) {
      problems.push(`${key} shrinks no more tangentially than radially`);
    }
  }
  return { check: 'species register', looked: keys.length, problems };
}

/** Every defect can be measured the way it says it prefers. */
export function checkDefects() {
  const problems = [];
  const ids = defectIds();
  for (const id of ids) {
    const entry = defectType(id);
    if (entry.prefers !== 'none' && !isMeasurable(entry.prefers, entry.extent)) {
      problems.push(`${id} prefers ${entry.prefers}, which cannot measure a ${entry.extent} fault`);
    }
    if (!entry.sound && entry.prefers === 'none') {
      problems.push(`${id} is unsound and costs nothing, which cannot both be true`);
    }
  }
  return { check: 'defect catalogue', looked: ids.length, problems };
}

/** Every grade anything can produce has a price multiplier. */
export function checkGrades() {
  const problems = [];
  const produced = [...LUMBER_GRADES, ...FACTORY_GRADES, 'veneer', 'pulpwood'];
  for (const grade of produced) {
    if (GRADE_MULTIPLIER[grade] === undefined) {
      problems.push(`${grade} can be produced and has no price multiplier`);
    }
  }
  for (const grade of Object.keys(GRADE_MULTIPLIER)) {
    if (!(GRADE_MULTIPLIER[grade] > 0)) {
      problems.push(`${grade} has a multiplier of ${GRADE_MULTIPLIER[grade]}`);
    }
  }
  return { check: 'grade prices', looked: produced.length, problems };
}

/** Every kiln schedule covers a continuous range and gets drier as it runs. */
export function checkSchedules() {
  const problems = [];
  const ids = scheduleIds();
  for (const id of ids) {
    const steps = schedule(id).steps;
    for (let i = 1; i < steps.length; i += 1) {
      if (steps[i].fromMc !== steps[i - 1].toMc) {
        problems.push(`${id} has a gap between step ${i - 1} and step ${i}`);
      }
      if (steps[i].depressionF <= steps[i - 1].depressionF) {
        problems.push(`${id} does not get drier at step ${i}`);
      }
    }
    if (steps.at(-1).toMc > 12) {
      problems.push(`${id} stops at ${steps.at(-1).toMc} percent, which is not dry`);
    }
  }
  return { check: 'kiln schedules', looked: ids.length, problems };
}

/** Every species and thickness the yard handles picks a schedule. */
export function checkScheduleCoverage() {
  const problems = [];
  const keys = speciesKeys();
  let looked = 0;
  for (const key of keys) {
    for (const thicknessIn of [0.75, 1, 1.25, 1.5, 2, 3]) {
      looked += 1;
      try {
        scheduleFor(key, thicknessIn);
      } catch (error) {
        problems.push(`${key} at ${thicknessIn} inch has no schedule: ${error.message}`);
      }
    }
  }
  return { check: 'schedule coverage', looked, problems };
}

/** Everything, in order. */
export function selfCheck() {
  const checks = [
    checkRules(),
    checkSpecies(),
    checkDefects(),
    checkGrades(),
    checkSchedules(),
    checkScheduleCoverage(),
  ];
  return {
    checks,
    looked: checks.reduce((total, check) => total + check.looked, 0),
    problems: checks.flatMap((check) => check.problems),
    clean: checks.every((check) => check.problems.length === 0),
  };
}
