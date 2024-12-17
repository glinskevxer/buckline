import { describe, expect, it } from 'vitest';
import { SettleError, makeAgreement } from '../../src/settle/stumpage.js';
import { makeSplit } from '../../src/settle/split.js';
import { settle } from '../../src/settle/statement.js';
import { periodBySpecies, periodOf, rollUp } from '../../src/settle/period.js';

const agreement = makeAgreement({
  id: 'A-1',
  tractId: 'T-7',
  landowner: 'E. Whitlock',
  rates: [
    { species: 'red oak', grade: 'F1', perMbf: 620 },
    { species: 'red oak', perMbf: 380 },
    { species: 'yellow poplar', perMbf: 210 },
  ],
  minimumVolumeMbf: 30,
  advance: 5000,
  advanceRecoveryShare: 0.2,
});

const split = makeSplit({ kind: 'residual', cutAndHaulPerMbf: 120 });

function statement(id, scaledOn, lines) {
  return settle({
    statementId: id,
    loadId: `LD-${id}`,
    scaledOn,
    graded: lines,
    agreement,
    split,
    deductionSchedule: [
      { name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 },
    ],
  });
}

const statements = [
  statement('ST-1', '2024-12-03', [
    { species: 'red oak', grade: 'F1', netBoardFeet: 4200 },
    { species: 'yellow poplar', grade: 'F2', netBoardFeet: 1100 },
  ]),
  statement('ST-2', '2024-12-11', [{ species: 'red oak', grade: 'F1', netBoardFeet: 5100 }]),
  statement('ST-3', '2024-12-19', [{ species: 'red oak', grade: 'F3', netBoardFeet: 3800 }]),
];

describe('periodOf', () => {
  it('reads the month off a date', () => {
    expect(periodOf('2024-12-19')).toBe('2024-12');
  });

  it('refuses something that is not a date', () => {
    expect(() => periodOf('later')).toThrow(SettleError);
    expect(() => periodOf(null)).toThrow(SettleError);
  });
});

describe('rollUp', () => {
  const period = rollUp(statements, agreement, { period: '2024-12', openingAdvance: 5000 });

  it('lists the loads rather than summing them away', () => {
    expect(period.loads).toHaveLength(3);
    expect(period.loads[0].statementId).toBe('ST-1');
  });

  it('totals the volume and the gross', () => {
    expect(period.netMbf).toBeCloseTo(14.2, 3);
    expect(period.gross).toBeGreaterThan(0);
  });

  it('applies the minimum volume against the whole period', () => {
    expect(period.minimumVolume.applies).toBe(true);
    expect(period.minimumVolume.shortfallMbf).toBeCloseTo(15.8, 2);
    expect(period.minimumVolume.charge).toBeGreaterThan(0);
  });

  it('finds no shortfall once the period cuts its minimum', () => {
    const big = rollUp(statements, makeAgreement({ ...agreementSpec(), minimumVolumeMbf: 5 }), {
      period: '2024-12',
    });
    expect(big.minimumVolume.applies).toBe(false);
    expect(big.minimumVolume.charge).toBe(0);
  });

  it('recovers the advance once across the period', () => {
    expect(period.advance.recovered).toBeGreaterThan(0);
    expect(period.advance.remaining).toBeLessThan(5000);
  });

  it('recovers nothing when nothing is outstanding', () => {
    const clear = rollUp(statements, agreement, { period: '2024-12', openingAdvance: 0 });
    expect(clear.advance.recovered).toBe(0);
  });

  it('nets the period down to what is payable', () => {
    expect(period.payable).toBeCloseTo(
      period.landownerNet + period.minimumVolume.charge - period.advance.recovered,
      2
    );
  });

  it('refuses a statement from another period', () => {
    expect(() => rollUp(statements, agreement, { period: '2024-11' })).toThrow(SettleError);
  });

  it('refuses an empty period', () => {
    expect(() => rollUp([], agreement, { period: '2024-12' })).toThrow(SettleError);
  });

  it('rolls up without a period when none is named', () => {
    expect(rollUp(statements, agreement, {}).loadCount).toBe(3);
  });
});

describe('periodBySpecies', () => {
  const rows = periodBySpecies(statements);

  it('totals by species', () => {
    expect(rows.map((row) => row.species).sort()).toEqual(['red oak', 'yellow poplar']);
  });

  it('puts the most valuable species first', () => {
    expect(rows[0].species).toBe('red oak');
  });

  it('works out the realised rate per thousand', () => {
    const oak = rows.find((row) => row.species === 'red oak');
    expect(oak.perMbf).toBeGreaterThan(380);
    expect(oak.perMbf).toBeLessThan(620);
  });
});

function agreementSpec() {
  return {
    id: 'A-1',
    tractId: 'T-7',
    landowner: 'E. Whitlock',
    rates: [
      { species: 'red oak', grade: 'F1', perMbf: 620 },
      { species: 'red oak', perMbf: 380 },
      { species: 'yellow poplar', perMbf: 210 },
    ],
    advance: 5000,
    advanceRecoveryShare: 0.2,
  };
}
