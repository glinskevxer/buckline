/**
 * buckline init
 *
 * Writes a working directory a yard can start from: a `buckline.json` with the
 * defaults filled in, and a starter tract, load and price list that the other
 * commands run against as they stand.
 *
 * The starter files are held here rather than copied out of `examples/`,
 * because `examples/` is not shipped in the package and a scaffold that only
 * works from a git checkout is a scaffold that fails the first time somebody
 * installs the thing. They are checked in the test suite the same way the
 * examples are: through the real constructors, and then scaled end to end.
 *
 * Nothing is overwritten. A yard file that is already there is somebody's
 * work, and a scaffold is not worth losing it over.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { document, title } from '../../report/layout.js';
import { IoError, resolvePath, writeText } from '../io.js';
import { actionCommand, optional } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';
import { CONFIG_NAME } from '../config.js';

/** The yard file a new directory starts with. */
export const STARTER_CONFIG = {
  rule: 'doyle',
  format: 'text',
  tract: 'tract.json',
  prices: 'prices.json',
  yard: 'book.jsonl',
};

/** A tract with a contract on it, ready to scale against. */
export const STARTER_TRACT = {
  id: 'T-1',
  name: 'Home place',
  owner: 'change me',
  contract: {
    rule: 'doyle',
    sweepAllowance: 'quarter',
    cullShare: 0.5,
    trimPolicy: 'hardwood',
  },
};

/** One truckload, with a defect on it so the deduction shows. */
export const STARTER_LOAD = {
  id: 'LD-1',
  tractId: 'T-1',
  scaledBy: 'change me',
  logs: [
    {
      id: 'L-1',
      species: 'red oak',
      position: 'butt',
      axesIn: [17.4, 18.1],
      measuredLengthFt: 16.25,
    },
    {
      id: 'L-2',
      species: 'white oak',
      position: 'second',
      axesIn: [21.8, 21.2],
      measuredLengthFt: 12.25,
    },
    {
      id: 'L-3',
      species: 'yellow poplar',
      position: 'upper',
      axesIn: [13.7, 14.2],
      measuredLengthFt: 10.25,
      defects: [{ type: 'sweep', depthIn: 5, lengthFt: 10 }],
    },
  ],
};

/** A price list with a base per species, which is enough to value a load. */
export const STARTER_PRICES = {
  id: 'PL-1',
  effectiveFrom: '2025-01-01',
  base: {
    'red oak': 1400,
    'white oak': 1500,
    'yellow poplar': 700,
  },
};

/** What init writes, in the order it writes it. */
export const STARTER_FILES = [
  { name: CONFIG_NAME, body: STARTER_CONFIG, what: 'the yard file' },
  { name: 'tract.json', body: STARTER_TRACT, what: 'a tract and its contract' },
  { name: 'load.json', body: STARTER_LOAD, what: 'one truckload' },
  { name: 'prices.json', body: STARTER_PRICES, what: 'a price list' },
];

/** Writes the scaffold. */
export function runInit(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const into = options.dir ? resolvePath(context, options.dir) : context.cwd;

  const existing = STARTER_FILES.filter((file) => existsSync(join(into, file.name)));
  if (existing.length > 0 && !options.force) {
    throw new IoError(
      `${existing.map((file) => file.name).join(', ')} already there, and init will not write over it`,
      { path: into, hint: 'run it in an empty directory, or pass --force' }
    );
  }

  const written = STARTER_FILES.map((file) => ({
    file: file.name,
    what: file.what,
    path: writeText(context, join(into, file.name), JSON.stringify(file.body, null, 2)),
  }));

  return render(format, {
    json: { directory: into, written },
    csv: written,
    text: () =>
      document([
        title('A yard to start from'),
        { fields: { directory: into, files: written.length } },
        {
          rows: written,
          columns: [
            { key: 'file', header: 'file' },
            { key: 'what', header: 'what it is' },
          ],
        },
        {
          title: 'Try',
          lines: [
            '  buckline scale -l load.json -t tract.json',
            '  buckline grade -i load.json',
            '  buckline rules --rule doyle',
            '',
            `The rule, the tract and the price list are set in ${CONFIG_NAME},`,
            'so a command that needs one does not have to be told.',
          ],
        },
      ]),
  });
}

/** Registers the init command on a program. */
export function registerInit(program, context) {
  actionCommand(program, context, {
    name: 'init',
    description: 'write a yard file and a starter tract, load and price list',
    formats: true,
    options: [
      optional('-d, --dir <dir>', 'where to write them', undefined),
      optional('--force', 'write over files that are already there'),
    ],
    run: runInit,
  });
}
