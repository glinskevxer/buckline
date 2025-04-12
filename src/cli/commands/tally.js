/**
 * buckline tally
 *
 * The green chain and the shed. Takes a tally of graded boards and does the
 * two things the yard does with one: builds it into packages, and reads what
 * came off the saw.
 *
 * The recovery report prints both recovery figures side by side and refuses to
 * be asked for one. Quoting a footage recovery as though it were a piece
 * recovery is the commonest way a mill talks itself into believing a bad week
 * was a good one.
 */

import { makeBoard } from '../../model/board.js';
import { gradeTally } from '../../grade/index.js';
import { buildUnits, describeUnit, packingEfficiency } from '../../tally/unit.js';
import { againstTarget, byGrade, byThickness, recovery } from '../../tally/summary.js';
import { bindingLimit, loadShipment } from '../../tally/shipment.js';
import { document, title } from '../../report/layout.js';
import { money } from '../render/table.js';
import { readData } from '../io.js';
import { optional, reportCommand, required } from '../command-kit.js';
import { render, requireFormat } from '../render/index.js';

function gradedRows(context, path) {
  const records = readData(context, path);
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError('the tally file holds no boards');
  }
  const boards = records.map((record) => makeBoard(record));
  const graded = gradeTally(boards, {});
  return boards.map((board, index) => ({
    id: board.id,
    species: board.species,
    grade: graded.results[index].grade,
    quarters: board.quarters,
    lengthFt: board.lengthFt,
    boardFeet: board.boardFeet,
  }));
}

/** Builds the tally into packages. */
export function runTallyUnits(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const rows = gradedRows(context, options.tally);
  const target = Number(options.target ?? 1000);
  const result = buildUnits(rows, {
    targetBoardFeet: target,
    minimumBoardFeet: Number(options.minimum ?? target * 0.6),
  });

  return render(format, {
    json: result,
    csv: result.units.map((unit) => ({
      unitId: unit.unitId,
      grade: unit.grade,
      quarters: unit.quarters,
      lengthFt: unit.lengthFt,
      boardFeet: unit.boardFeet,
      pieces: unit.pieceCount,
    })),
    text: () =>
      document([
        title('Packages built'),
        {
          fields: {
            boards: rows.length,
            packages: result.units.length,
            'in packages': result.unitBoardFeet,
            odds: result.oddsBoardFeet,
            ungraded: result.ungradedBoardFeet,
            'packing efficiency': packingEfficiency(result, target),
          },
        },
        { lines: result.units.map((unit) => describeUnit(unit)) },
      ]),
  });
}

/** Reads what came off the saw. */
export function runTallyRecovery(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const rows = gradedRows(context, options.tally);
  const onGrade = (options.onGrade ?? 'FAS,F1F,SEL').split(',').map((name) => name.trim());
  const result = recovery(rows, onGrade);
  const target = options.target ? JSON.parse(options.target) : null;

  return render(format, {
    json: { byGrade: byGrade(rows), byThickness: byThickness(rows), recovery: result },
    csv: byGrade(rows),
    text: () =>
      document([
        title('Grade recovery'),
        {
          rows: byGrade(rows),
          columns: [
            { key: 'grade', header: 'grade' },
            { key: 'pieces', header: 'pieces' },
            { key: 'boardFeet', header: 'bd ft' },
            { key: 'footageShare', header: 'footage share' },
            { key: 'pieceShare', header: 'piece share' },
          ],
        },
        {
          title: 'On grade',
          fields: {
            'counted as on grade': onGrade.join(', '),
            'footage recovery': result.footageRecovery,
            'piece recovery': result.pieceRecovery,
          },
        },
        {
          title: 'By thickness',
          rows: byThickness(rows),
          columns: [
            { key: 'quarters', header: 'quarters' },
            { key: 'pieces', header: 'pieces' },
            { key: 'boardFeet', header: 'bd ft' },
          ],
        },
        {
          title: 'Against target',
          rows: target ? againstTarget(rows, target).rows : [],
          columns: [
            { key: 'grade', header: 'grade' },
            { key: 'expectedShare', header: 'expected' },
            { key: 'actualShare', header: 'actual' },
            { key: 'gap', header: 'gap' },
          ],
        },
      ]),
  });
}

/** Loads the packages onto a truck. */
export function runTallyShip(options, context) {
  const format = requireFormat(options.format ?? 'text');
  const rows = gradedRows(context, options.tally);
  const target = Number(options.target ?? 1000);
  const built = buildUnits(rows, { targetBoardFeet: target, minimumBoardFeet: target * 0.6 });
  const units = built.units.map((unit) => ({
    unitId: unit.unitId,
    species: unit.boards[0].species,
    boardFeet: unit.boardFeet,
  }));

  if (units.length === 0) {
    throw new TypeError('nothing was packaged, so there is nothing to load');
  }

  const shipment = loadShipment(units, {
    maxWeightLb: Number(options.maxWeight ?? 48000),
    maxBoardFeet: Number(options.maxDeck ?? 12000),
    moisturePct: Number(options.moisture ?? 8),
    shipmentId: options.shipment ?? null,
  });
  const binding = bindingLimit(units, { moisturePct: Number(options.moisture ?? 8) });

  return render(format, {
    json: { shipment, binding },
    csv: shipment.loaded,
    text: () =>
      document([
        title(`Shipment ${shipment.shipmentId ?? ''}`.trim()),
        {
          fields: {
            packages: shipment.unitCount,
            'board feet': shipment.boardFeet,
            weight: `${money(shipment.weightLb, 0)} lb`,
            'bound by': shipment.boundBy,
            full: shipment.full,
            'would bind on': binding.binding,
          },
        },
        {
          rows: shipment.loaded,
          columns: [
            { key: 'unitId', header: 'package' },
            { key: 'species', header: 'species' },
            { key: 'boardFeet', header: 'bd ft' },
            { key: 'weightLb', header: 'lb' },
          ],
        },
        {
          title: 'Left behind',
          rows: shipment.left,
          columns: [
            { key: 'unitId', header: 'package' },
            { key: 'boardFeet', header: 'bd ft' },
            { key: 'why', header: 'why' },
          ],
        },
      ]),
  });
}

/** Registers the tally commands on a program. */
export function registerTally(program, context) {
  const tally = program.command('tally').description('the green chain and the shed');

  reportCommand(tally, context, {
    name: 'units',
    description: 'build a tally into packages',
    options: [
      required('-i, --tally <file>', 'the boards'),
      optional('--target <boardFeet>', 'package target', '1000'),
      optional('--minimum <boardFeet>', 'smallest package worth strapping'),
    ],
    run: runTallyUnits,
  });

  reportCommand(tally, context, {
    name: 'recovery',
    description: 'what came off the saw, on footage and on pieces',
    options: [
      required('-i, --tally <file>', 'the boards'),
      optional('--on-grade <list>', 'grades that count as on grade'),
      optional('--target <json>', 'an expected grade mix'),
    ],
    run: runTallyRecovery,
  });

  reportCommand(tally, context, {
    name: 'ship',
    description: 'load the packages onto a truck',
    options: [
      required('-i, --tally <file>', 'the boards'),
      optional('--target <boardFeet>', 'package target', '1000'),
      optional('--max-weight <lb>', 'weight limit', '48000'),
      optional('--max-deck <boardFeet>', 'deck limit', '12000'),
      optional('--moisture <pct>', 'moisture content', '8'),
      optional('--shipment <id>', 'shipment number'),
    ],
    run: runTallyShip,
  });
}
