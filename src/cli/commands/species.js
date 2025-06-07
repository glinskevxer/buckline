/**
 * buckline species
 *
 * The reference tables, printed. A scaler who has to look up whether mineral
 * streak counts in soft maple is not going to open a source file, and a
 * printed sheet on the scale house wall is out of date the day a table is
 * edited. This prints the table the program is actually using.
 */

import { lookupSpecies, ruleBookFor, speciesInGroup, speciesKeys } from '../../model/species.js';
import { defectIds, defectType } from '../../scale/defect/types.js';
import { methodFor } from '../../scale/defect/policy.js';
import { ruleIds } from '../../scale/rules/index.js';
import { scheduleFor } from '../../kiln/schedule.js';
import { barkFraction } from '../../measure/diameter.js';
import { document, title } from '../../report/layout.js';
import { readData } from '../io.js';
import { optional, reportCommand } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

/** The species table. */
export function runSpecies(options) {
  const format = requireFormat(options.format ?? 'text');
  const keys = options.group ? speciesInGroup(options.group) : speciesKeys();
  if (keys.length === 0) {
    throw new TypeError(`no species are in a group called ${options.group}`);
  }

  const rows = keys.map((key) => {
    const entry = lookupSpecies(key);
    return {
      species: key,
      group: entry.group,
      book: ruleBookFor(key),
      density: entry.densityLbPerFt3,
      bark: `${Math.round(barkFraction(key) * 100)}%`,
      tangential: entry.shrinkTangentialPct,
      radial: entry.shrinkRadialPct,
      veneer: entry.veneerCandidate,
      streak: entry.mineralStreakCounts,
      kiln: scheduleFor(key, Number(options.thickness ?? 1)).schedule.id,
    };
  });

  return render(format, {
    json: rows,
    csv: rows,
    text: () =>
      document([
        title('The species the yard buys'),
        {
          fields: {
            species: rows.length,
            'kiln schedule at': `${options.thickness ?? 1} inch`,
          },
        },
        {
          rows,
          columns: [
            { key: 'species', header: 'species' },
            { key: 'book', header: 'book' },
            { key: 'density', header: 'lb/ft3' },
            { key: 'bark', header: 'bark' },
            { key: 'tangential', header: 'tang %' },
            { key: 'radial', header: 'rad %' },
            { key: 'veneer', header: 'veneer' },
            { key: 'streak', header: 'streak counts' },
            { key: 'kiln', header: 'kiln' },
          ],
        },
      ]),
  });
}

/** The defect table, and how each one is deducted under a rule. */
export function runDefects(options) {
  const format = requireFormat(options.format ?? 'text');
  const rules = options.rule ? [options.rule] : ruleIds();

  const rows = defectIds().map((id) => {
    const entry = defectType(id);
    const row = {
      defect: id,
      kind: entry.kind,
      extent: entry.extent,
      sound: entry.sound,
      visible: entry.surfaceVisible,
    };
    for (const rule of rules) {
      row[rule] = methodFor(id, rule).method;
    }
    return row;
  });

  return render(format, {
    json: rows,
    csv: rows,
    text: () =>
      document([
        title('The defect catalogue'),
        {
          rows,
          columns: [
            { key: 'defect', header: 'defect' },
            { key: 'kind', header: 'kind' },
            { key: 'extent', header: 'extent' },
            { key: 'sound', header: 'sound' },
            { key: 'visible', header: 'visible' },
            ...rules.map((rule) => ({ key: rule, header: rule })),
          ],
        },
        {
          lines: [
            'The rule columns say how the defect is deducted under that rule.',
            'A defect the rule cannot measure falls back to what the defect prefers.',
          ],
        },
      ]),
  });
}

/** Registers the reference commands on a program. */
export function registerSpecies(program, context) {
  reportCommand(program, context, {
    name: 'species',
    description: 'the species table the program is using',
    options: [
      optional('-g, --group <group>', 'hardwood or softwood'),
      optional('-t, --thickness <inches>', 'thickness to read the kiln schedule at', '1'),
    ],
    run: (options) => runSpecies(options),
  });

  reportCommand(program, context, {
    name: 'defects',
    description: 'the defect catalogue and how each is deducted',
    options: [optional('-r, --rule <rule>', 'one rule instead of all of them')],
    run: (options) => runDefects(options),
  });
}

/** Reads a species name off a file, for the commands that take one. */
export function speciesFromFile(context, path) {
  const records = readData(context, path);
  return [...new Set((Array.isArray(records) ? records : [records]).map((r) => r.species))].filter(
    Boolean
  );
}
