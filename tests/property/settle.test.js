import { describe, expect, it } from 'vitest';
import { applyDeductions } from '../../src/settle/deductions.js';
import { divide, makeSplit } from '../../src/settle/split.js';
import { makeAgreement, rateFor, slideRate } from '../../src/settle/stumpage.js';
import { auditStatement, settle } from '../../src/settle/statement.js';
import { intBetween, numberBetween, oneOf, rng } from './generators.js';

const agreement = makeAgreement({
  id: 'A-1',
  tractId: 'T-7',
  landowner: 'E. Whitlock',
  rates: [
    { species: 'red oak', grade: 'F1', perMbf: 620 },
    { species: 'red oak', perMbf: 380 },
    { species: 'yellow poplar', perMbf: 210 },
  ],
  slidingScale: { baseIndex: 100, triggerIndex: 110, share: 0.5 },
});

const schedule = [
  { name: 'severance tax', class: 'statutory', basis: 'gross', rate: 0.0285 },
  { name: 'insurance', class: 'contractual', basis: 'gross', rate: 0.02 },
  { name: 'road maintenance', class: 'contractual', basis: 'flat', amount: 150 },
  { name: 'advance', class: 'advance', basis: 'running', rate: 0.25 },
];

function someStatement(next, index) {
  const lines = [];
  const count = intBetween(next, 1, 4);
  for (let i = 0; i < count; i += 1) {
    const species = oneOf(next, ['red oak', 'yellow poplar']);
    lines.push({
      species,
      grade: oneOf(next, ['F1', 'F2', 'F3']),
      netBoardFeet: numberBetween(next, 100, 9000, 0),
    });
  }
  return {
    statementId: `ST-${index}`,
    loadId: `LD-${index}`,
    scaledOn: '2025-03-05',
    graded: lines,
    agreement,
    split: makeSplit({
      kind: oneOf(next, ['residual', 'share']),
      cutAndHaulPerMbf: numberBetween(next, 80, 320, 0),
      landownerShare: 0.45,
      loggerShare: 0.55,
      bears: { insurance: 'logger' },
    }),
    deductionSchedule: schedule,
    marketIndex: numberBetween(next, 80, 150, 0),
    outstanding: { advance: numberBetween(next, 0, 6000, 0) },
  };
}

describe('the sliding scale', () => {
  it('never cuts a rate however far the market falls', () => {
    const next = rng(41);
    for (let i = 0; i < 500; i += 1) {
      const base = numberBetween(next, 100, 900, 0);
      const index = numberBetween(next, 10, 300, 0);
      expect(slideRate(agreement, base, index).perMbf).toBeGreaterThanOrEqual(base);
    }
  });

  it('never moves a rate at or under the trigger', () => {
    const next = rng(43);
    for (let i = 0; i < 200; i += 1) {
      const base = numberBetween(next, 100, 900, 0);
      const index = numberBetween(next, 10, 110, 0);
      expect(slideRate(agreement, base, index).perMbf).toBe(base);
    }
  });

  it('is monotone in the index above the trigger', () => {
    let previous = 0;
    for (let index = 110; index <= 200; index += 1) {
      const rate = rateFor(agreement, 'red oak', 'F1', index).perMbf;
      expect(rate).toBeGreaterThanOrEqual(previous);
      previous = rate;
    }
  });
});

describe('deductions', () => {
  it('never take a settlement negative', () => {
    const next = rng(47);
    for (let i = 0; i < 400; i += 1) {
      const gross = numberBetween(next, 0, 40000, 2);
      const result = applyDeductions(gross, gross / 500, schedule, {
        outstanding: { advance: numberBetween(next, 0, 20000, 2) },
      });
      expect(result.net).toBeGreaterThanOrEqual(0);
    }
  });

  it('always reconcile against the gross', () => {
    const next = rng(53);
    for (let i = 0; i < 400; i += 1) {
      const gross = numberBetween(next, 0, 40000, 2);
      const result = applyDeductions(gross, gross / 500, schedule);
      expect(result.gross - result.totalDeducted).toBeCloseTo(result.net, 1);
    }
  });

  it('never recover more advance than was outstanding', () => {
    const next = rng(59);
    for (let i = 0; i < 300; i += 1) {
      const outstanding = numberBetween(next, 0, 20000, 2);
      const result = applyDeductions(numberBetween(next, 0, 40000, 2), 20, schedule, {
        outstanding: { advance: outstanding },
      });
      const taken = result.lines.find((line) => line.name === 'advance').amount;
      expect(taken).toBeLessThanOrEqual(outstanding + 1e-6);
    }
  });
});

describe('the split', () => {
  it('always allocates the whole gross', () => {
    const next = rng(61);
    for (let i = 0; i < 300; i += 1) {
      const split = makeSplit({
        kind: oneOf(next, ['residual', 'share']),
        cutAndHaulPerMbf: numberBetween(next, 80, 320, 0),
        landownerShare: 0.4,
        loggerShare: 0.6,
      });
      const gross = numberBetween(next, 0, 30000, 2);
      const result = divide(split, gross, numberBetween(next, 1, 40, 2));
      expect(result.unallocated).toBeCloseTo(0, 1);
    }
  });

  it('never pays a residual logger more than the whole settlement', () => {
    const next = rng(67);
    for (let i = 0; i < 300; i += 1) {
      const split = makeSplit({
        kind: 'residual',
        cutAndHaulPerMbf: numberBetween(next, 80, 900, 0),
      });
      const gross = numberBetween(next, 0, 30000, 2);
      const result = divide(split, gross, numberBetween(next, 1, 40, 2));
      expect(result.logger.gross).toBeLessThanOrEqual(gross + 1e-6);
      expect(result.landowner.gross).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('whole statements', () => {
  it('always reconcile against themselves', () => {
    const next = rng(71);
    for (let i = 0; i < 200; i += 1) {
      const statement = settle(someStatement(next, i));
      const audit = auditStatement(statement);
      if (!audit.clean) {
        throw new Error(`statement ${i} did not reconcile: ${audit.problems.join('; ')}`);
      }
      expect(audit.clean).toBe(true);
    }
  });

  it('never gross more than the lines add to', () => {
    const next = rng(73);
    for (let i = 0; i < 200; i += 1) {
      const statement = settle(someStatement(next, i));
      const lineTotal = statement.lines.reduce((sum, line) => sum + line.value, 0);
      expect(statement.gross).toBeCloseTo(lineTotal, 1);
    }
  });

  it('never carry a negative volume or a negative gross', () => {
    const next = rng(79);
    for (let i = 0; i < 200; i += 1) {
      const statement = settle(someStatement(next, i));
      expect(statement.netMbf).toBeGreaterThanOrEqual(0);
      expect(statement.gross).toBeGreaterThanOrEqual(0);
    }
  });

  it('settle the same input the same way twice', () => {
    const next = rng(83);
    for (let i = 0; i < 60; i += 1) {
      const input = someStatement(next, i);
      expect(settle(input).payable).toBe(settle(input).payable);
    }
  });
});
