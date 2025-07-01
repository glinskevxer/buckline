/**
 * buckline commands
 *
 * Every command with one line about it, in one place. Commander's own help
 * lists the top level and then makes you ask each group separately, which is
 * fine at a prompt and useless when somebody wants to know what the program
 * can do.
 *
 * It walks the program it is registered on rather than a list written by hand,
 * so a command that is added and not documented cannot happen.
 */

import { document, title } from '../../report/layout.js';
import { actionCommand, optional } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

/** Walks a commander program into a flat list of commands. */
export function walk(command, prefix = '') {
  const rows = [];
  for (const child of command.commands) {
    if (child.name() === 'help') continue;
    const name = prefix ? `${prefix} ${child.name()}` : child.name();
    if (child.commands.length > 0) {
      rows.push(...walk(child, name));
    } else {
      rows.push({
        command: name,
        description: child.description(),
        options: child.options
          .filter((option) => option.mandatory)
          .map((option) => option.flags)
          .join(' '),
      });
    }
  }
  return rows.sort((a, b) => a.command.localeCompare(b.command));
}

/** Prints the whole command list. */
export function runCommands(options, context, program) {
  const format = requireFormat(options.format ?? 'text');
  const rows = walk(program).filter((row) => !options.match || row.command.includes(options.match));

  return render(format, {
    json: rows,
    csv: rows,
    text: () =>
      document([
        title('Every command'),
        {
          rows,
          columns: [
            { key: 'command', header: 'command' },
            { key: 'description', header: 'does' },
            { key: 'options', header: 'needs' },
          ],
          empty: 'nothing matched',
        },
        {
          lines: [
            'Anything that produces a report also takes -f text|csv|json and -o <file>.',
            'A buckline.json in the working directory can set yard, prices, rule, terms,',
            'tract, format and actor, and anything typed beats it.',
          ],
        },
      ]),
  });
}

/** Registers the command list on a program. */
export function registerCommands(program, context) {
  actionCommand(program, context, {
    name: 'commands',
    description: 'every command with one line about it',
    formats: true,
    options: [optional('-m, --match <text>', 'only the commands whose name contains this')],
    run: (options) => runCommands(options, context, program),
  });
}
