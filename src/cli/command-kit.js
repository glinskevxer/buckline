/**
 * Registering a command.
 *
 * Eight commands had grown the same twelve lines: name it, describe it, hang
 * the required options on it, add the format and output options, and wire an
 * action that runs the command and emits what came back. Two of them had
 * drifted, so one command wrote to a file with a different flag and another
 * defaulted to json.
 *
 * A command is now a description of itself and a function, and the wiring
 * happens once. The rule that fell out of doing it: every command that
 * produces a report gets exactly the same two output options, and a command
 * that does not produce a report does not get them at all.
 */

import { emit } from './io.js';

/** Hangs a list of options on a command. */
export function addOptions(command, options = []) {
  for (const option of options) {
    if (option.required) {
      command.requiredOption(option.flags, option.description);
    } else if (option.default !== undefined) {
      command.option(option.flags, option.description, option.default);
    } else {
      command.option(option.flags, option.description);
    }
  }
  return command;
}

/**
 * A command that produces a report. It gets the format and output options
 * whether it wants them or not, because a report nobody can write to a file is
 * a report somebody will screenshot.
 */
export function reportCommand(parent, context, spec) {
  const command = parent.command(spec.name).description(spec.description);
  addOptions(command, spec.options);
  addOptions(command, [
    { flags: '-f, --format <format>', description: 'text, csv or json', default: 'text' },
    { flags: '-o, --output <file>', description: 'write to a file instead of the screen' },
  ]);
  command.action((options) => {
    emit(context, spec.run(options, context), options);
  });
  return command;
}

/** A command that does something and reports a line about it. */
export function actionCommand(parent, context, spec) {
  const command = parent.command(spec.name).description(spec.description);
  addOptions(command, spec.options);
  if (spec.formats) {
    addOptions(command, [
      { flags: '-f, --format <format>', description: 'text or json', default: 'text' },
    ]);
  }
  command.action((options) => {
    emit(context, spec.run(options, context), options);
  });
  return command;
}

/** Shorthand for a required option. */
export function required(flags, description) {
  return { flags, description, required: true };
}

/** Shorthand for an optional one. */
export function optional(flags, description, value) {
  return { flags, description, default: value };
}
