/**
 * buckline config
 *
 * Says what the yard file is setting and where it was found. This is the
 * command somebody runs after a report came out wrong, and the answer is
 * usually a file two directories up that nobody remembered writing.
 */

import { CONFIG_KEYS, explain, findConfig, resolveOptions } from '../config.js';
import { document, title } from '../../report/layout.js';
import { actionCommand, optional } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

/** What the yard file says and where it came from. */
export function runConfig(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const found = findConfig(context.cwd);
  const values = context.config?.values ?? {};
  const resolved = resolveOptions({}, values, {});

  return render(format, {
    json: { path: found.path, searched: found.searched, values, keys: CONFIG_KEYS },
    csv: explain(resolved),
    text: () =>
      document([
        title('Yard file'),
        {
          fields: {
            file: found.path ?? 'none found',
            'looked in': found.searched.length,
            'settings in force': Object.keys(values).length,
          },
        },
        {
          title: 'Settings',
          rows: explain(resolved),
          columns: [
            { key: 'option', header: 'option' },
            { key: 'value', header: 'value' },
            { key: 'from', header: 'from' },
          ],
          empty: 'nothing is set, so every command is on its own defaults',
        },
        {
          title: 'What a yard file may set',
          lines: CONFIG_KEYS.map((key) => `- ${key}`),
        },
        options.searched ? document([{ title: 'Where it looked', lines: found.searched }]) : '',
      ]),
  });
}

/** Registers the config command on a program. */
export function registerConfig(program, context) {
  actionCommand(program, context, {
    name: 'config',
    description: 'what the yard file is setting and where it was found',
    formats: true,
    options: [optional('--searched', 'list every directory that was looked in')],
    run: runConfig,
  });
}
