/**
 * buckline kiln
 *
 * What the dry kiln operator needs before loading: which packages can share a
 * kiln, what the schedule will be, and what the charge is going to risk.
 *
 * The plan command answers the question the yard actually asks, which is not
 * "what schedule does this package need" but "what can I run today". Those are
 * different questions and only the second one has a wrong answer that costs
 * money.
 */

import { planCharges, schedulePiles } from '../../kiln/charge.js';
import { chargeRisk } from '../../kiln/degrade.js';
import { scheduleFor } from '../../kiln/schedule.js';
import { block, heading, table } from '../render/table.js';
import { csv } from '../render/csv.js';
import { json } from '../render/json.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { requireFormat } from '../render/index.js';

/** What can be run today, fullest kiln first. */
export function runKilnPlan(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const units = readData(context, options.units);
  const capacityBoardFeet = Number(options.capacity ?? 40000);
  const charges = planCharges(units, { capacityBoardFeet });

  if (format === 'json') return json({ piles: schedulePiles(units), charges });
  const rows = charges.map((charge) => ({
    schedule: charge.schedule,
    packages: charge.unitCount,
    boardFeet: charge.boardFeet,
    fill: `${Math.round(charge.fillShare * 100)}%`,
    mixed: charge.mixedSpecies || charge.mixedThickness ? 'yes' : 'no',
    verdict: charge.runnable ? 'run it' : charge.reason,
  }));
  if (format === 'csv') return csv(rows);

  return [
    heading('What the kilns could run'),
    block({ packages: units.length, 'kiln capacity': capacityBoardFeet }),
    '',
    table(rows, ['schedule', 'packages', 'boardFeet', 'fill', 'mixed', 'verdict']),
  ].join('\n');
}

/** The schedule one package needs, and why. */
export function runKilnSchedule(options) {
  const format = requireFormat(options.format ?? 'text');
  const thicknessIn = Number(options.thickness);
  const chosen = scheduleFor(options.species, thicknessIn);
  const risk = chargeRisk(
    { species: options.species, thicknessIn, scheduleId: chosen.schedule.id },
    {
      stickerSpacingIn: Number(options.stickers ?? 24),
      weightedTop: options.weighted !== false,
    }
  );

  if (format === 'json') return json({ schedule: chosen.schedule, because: chosen.because, risk });
  if (format === 'csv') return csv(chosen.schedule.steps);

  return [
    heading(`${chosen.schedule.label} for ${options.species} at ${thicknessIn} inch`),
    block({ schedule: chosen.schedule.id, reason: chosen.because }),
    '',
    table(
      chosen.schedule.steps.map((step, index) => ({ step: index, ...step })),
      [
        { key: 'step', header: 'step' },
        { key: 'fromMc', header: 'from mc' },
        { key: 'toMc', header: 'to mc' },
        { key: 'dryBulbF', header: 'dry bulb' },
        { key: 'depressionF', header: 'depression' },
      ]
    ),
    '',
    heading('Risk as loaded', { rule: '-' }),
    block({
      stress: `${risk.stress.band} (${risk.stress.risk})`,
      shape: `${risk.shape.band} (${risk.shape.risk})`,
      worst: risk.worst,
    }),
    risk.remedies.length > 0
      ? risk.remedies.map((line) => `- ${line}`).join('\n')
      : 'nothing to fix',
  ].join('\n');
}

/** Registers the kiln commands on a program. */
export function registerKiln(program, context) {
  const kiln = program.command('kiln').description('dry kiln planning');

  reportCommand(kiln, context, {
    name: 'plan',
    description: 'what the kilns could run today',
    options: [
      required('-u, --units <file>', 'the packages waiting to dry'),
      optional('--capacity <boardFeet>', 'kiln capacity', '40000'),
    ],
    run: runKilnPlan,
  });

  reportCommand(kiln, context, {
    name: 'schedule',
    description: 'the schedule a package needs and the risk it carries',
    options: [
      required('-s, --species <species>', 'the species'),
      required('-t, --thickness <inches>', 'the thickness'),
      optional('--stickers <inches>', 'sticker spacing', '24'),
    ],
    run: (options) => runKilnSchedule(options),
  });
}
