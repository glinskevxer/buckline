/**
 * buckline doctor
 *
 * Runs the self checks, and the yard book too when one is named. This is what
 * a yard runs after somebody edits a table and before anybody scales a load
 * against it.
 *
 * The exit code is what a cron job reads, so a problem exits non zero even
 * though the report printed successfully. A check command that always exits
 * zero is a check command nobody notices failing.
 */

import { selfCheck } from '../../selfcheck.js';
import { openJournal } from '../../store/journal.js';
import { kindCensus } from '../../store/query.js';
import { document, title } from '../../report/layout.js';
import { IoError, resolvePath } from '../io.js';
import { actionCommand, optional } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

/** Checks a yard book loads and reports what is in it. */
export function checkBook(context, path) {
  const full = resolvePath(context, path);
  try {
    const journal = openJournal(full, { sync: false });
    return {
      check: 'yard book',
      looked: journal.length,
      problems: [],
      detail: { path: full, kinds: kindCensus(journal), versions: journal.census() },
    };
  } catch (error) {
    return {
      check: 'yard book',
      looked: 0,
      problems: [`${full} will not load: ${error.message}`],
      detail: { path: full },
    };
  }
}

/** Runs the checks. */
export function runDoctor(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const result = selfCheck();
  const checks = [...result.checks];
  if (options.yard) {
    checks.push(checkBook(context, options.yard));
  }

  const problems = checks.flatMap((check) => check.problems);
  const text = document([
    title('Self check'),
    {
      rows: checks.map((check) => ({
        check: check.check,
        looked: check.looked,
        problems: check.problems.length,
        verdict: check.problems.length === 0 ? 'clean' : 'see below',
      })),
      columns: ['check', 'looked', 'problems', 'verdict'],
    },
    {
      title: 'Problems',
      lines: problems.map((problem) => `- ${problem}`),
      empty: 'nothing to report',
    },
  ]);

  if (problems.length > 0) {
    context.out(text);
    throw new IoError(`${problems.length} problems found`, {
      path: 'doctor',
      details: { code: 5, problems },
    });
  }

  return render(format, {
    json: { ...result, checks },
    csv: checks.map((check) => ({
      check: check.check,
      looked: check.looked,
      problems: check.problems.length,
    })),
    text: () => text,
  });
}

/** Registers the doctor command on a program. */
export function registerDoctor(program, context) {
  actionCommand(program, context, {
    name: 'doctor',
    description: 'check the tables against each other, and the yard book if one is named',
    formats: true,
    options: [optional('-y, --yard <file>', 'a yard book to load as well')],
    run: runDoctor,
  });
}
