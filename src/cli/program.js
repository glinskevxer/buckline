/**
 * The command line.
 *
 * Commander does the parsing and nothing else. Every command is a function
 * that takes the parsed options and a context, and returns text; the program
 * layer decides where that text goes and what the process exits with. That
 * split is what makes the commands testable, and it is also what stops a
 * command deciding on its own to call process.exit halfway through writing a
 * report.
 *
 * The exit code carries the meaning: two for a usage mistake, three for bad
 * data, four for a file that is not there, five for anything else. A script
 * driving this needs to tell a bad ticket from a missing file, and the message
 * text is not a stable interface.
 */

import { Command } from 'commander';
import { formatError } from '../errors.js';
import { EXIT, exitCodeFor, makeContext } from './io.js';
export { FORMATS, requireFormat } from './render/index.js';
import { registerBuck } from './commands/buck.js';
import { registerDeck } from './commands/deck.js';
import { registerGrade } from './commands/grade.js';
import { registerKiln } from './commands/kiln.js';
import { registerPeriod } from './commands/period.js';
import { registerReport } from './commands/report.js';
import { registerRules } from './commands/rules.js';
import { registerScale } from './commands/scale.js';
import { registerSettle } from './commands/settle.js';
import { registerYard } from './commands/yard.js';

export const VERSION = '0.5.0';

/** Builds the program. Nothing is parsed and nothing is written yet. */
export function buildProgram(context) {
  const program = new Command();

  program
    .name('buckline')
    .description('log scaling, grading and settlement for a hardwood mill')
    .version(VERSION)
    .configureOutput({
      writeOut: (text) => context.out(text.replace(/\n$/, '')),
      writeErr: (text) => context.err(text.replace(/\n$/, '')),
    })
    .exitOverride();

  registerScale(program, context);
  registerGrade(program, context);
  registerBuck(program, context);
  registerSettle(program, context);
  registerRules(program, context);
  registerYard(program, context);
  registerReport(program, context);
  registerKiln(program, context);
  registerDeck(program, context);
  registerPeriod(program, context);
  return program;
}

/**
 * Runs an argument vector and returns an exit code. Nothing throws out of
 * here: a command line that throws a stack trace at a scaler is a command line
 * nobody uses twice.
 */
export function run(argv, options = {}) {
  const context = options.context ?? makeContext(options);
  const program = buildProgram(context);

  try {
    program.parse(argv, { from: 'user' });
    return { code: EXIT.ok, context };
  } catch (error) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
      return { code: EXIT.ok, context };
    }
    if (error.code === 'commander.help') {
      return { code: EXIT.ok, context };
    }
    if (typeof error.code === 'string' && error.code.startsWith('commander.')) {
      return { code: EXIT.usage, context };
    }
    context.err(formatError(error));
    return { code: exitCodeFor(error), context };
  }
}
