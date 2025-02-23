import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { MillError, liveSaw } from '../../src/mill/pattern.js';
import {
  CUBIC_FEET_PER_GREEN_TON,
  STREAMS,
  barkVolume,
  chipOrBoard,
  greenTons,
  residueBalance,
  residueValue,
  sawdustVolume,
} from '../../src/mill/residue.js';

function log(species = 'red oak', axis = 21.8) {
  return makeLog({ id: 'L-1', species, axesIn: [axis, axis], measuredLengthFt: 12.25 });
}

const sawn = liveSaw(log());

describe('barkVolume', () => {
  it('finds more bark on a thick barked species', () => {
    expect(barkVolume(log('white oak'))).toBeGreaterThan(barkVolume(log('beech')));
  });

  it('finds more bark on a bigger log', () => {
    expect(barkVolume(log('red oak', 30))).toBeGreaterThan(barkVolume(log('red oak', 15)));
  });

  it('never finds negative bark', () => {
    expect(barkVolume(log())).toBeGreaterThan(0);
  });
});

describe('sawdustVolume', () => {
  it('makes more sawdust on a wider kerf', () => {
    expect(sawdustVolume(sawn, { kerfIn: 0.25 })).toBeGreaterThan(
      sawdustVolume(sawn, { kerfIn: 0.1 })
    );
  });

  it('scales with the kerf', () => {
    expect(sawdustVolume(sawn, { kerfIn: 0.25 })).toBeCloseTo(
      sawdustVolume(sawn, { kerfIn: 0.125 }) * 2,
      1
    );
  });

  it('makes more sawdust on a bigger log', () => {
    expect(sawdustVolume(liveSaw(log('red oak', 30)))).toBeGreaterThan(sawdustVolume(sawn));
  });

  it('refuses something that is not a sawing result', () => {
    expect(() => sawdustVolume({ boardFeet: 100 })).toThrow(MillError);
  });
});

describe('residueBalance', () => {
  const balance = residueBalance(log(), sawn);

  it('names all four streams', () => {
    expect(Object.keys(balance.streams).sort()).toEqual(['bark', 'chips', 'sawdust', 'trim']);
  });

  it('never reports a negative stream', () => {
    for (const value of Object.values(balance.streams)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('accounts for the lumber, the sawdust and the trim inside the log', () => {
    const inside =
      balance.lumberCubicFeet +
      balance.streams.trim +
      balance.streams.sawdust +
      balance.streams.chips;
    expect(inside).toBeCloseTo(balance.logCubicFeet, 1);
  });

  it('keeps the bark outside the log volume', () => {
    expect(balance.streams.bark).toBeGreaterThan(0);
    expect(balance.logCubicFeet).toBeLessThan(balance.logCubicFeet + balance.streams.bark);
  });

  it('reports the share that became lumber', () => {
    expect(balance.lumberShare).toBeGreaterThan(0.2);
    expect(balance.lumberShare).toBeLessThan(1);
  });

  it('makes more chips when the mill saws less lumber out', () => {
    const thick = residueBalance(log(), liveSaw(log(), { thicknessIn: 3 }));
    expect(thick.streams.chips).toBeGreaterThan(balance.streams.chips);
  });
});

describe('greenTons', () => {
  it('weighs each stream on its own bulk density', () => {
    const tons = greenTons({ chips: 100, bark: 100 });
    expect(tons.chips).toBeGreaterThan(tons.bark);
  });

  it('agrees with the published cubic feet per ton', () => {
    expect(greenTons({ chips: CUBIC_FEET_PER_GREEN_TON.chips }).chips).toBe(1);
  });

  it('refuses a stream nobody weighs', () => {
    expect(() => greenTons({ shavings: 10 })).toThrow(MillError);
  });
});

describe('residueValue', () => {
  const prices = { chips: 28, trim: 14, sawdust: 9, bark: 5 };

  it('values every stream, most valuable first', () => {
    const result = residueValue(residueBalance(log(), sawn).streams, prices);
    expect(result.lines.map((line) => line.stream)).toEqual(STREAMS);
    expect(result.total).toBeGreaterThan(0);
  });

  it('values an unpriced stream at nothing and says which', () => {
    const result = residueValue(residueBalance(log(), sawn).streams, { chips: 28 });
    expect(result.unpriced).toContain('bark');
    expect(result.lines.find((line) => line.stream === 'bark').value).toBe(0);
  });

  it('makes chips the biggest line at ordinary prices', () => {
    const result = residueValue(residueBalance(log(), sawn).streams, prices);
    const biggest = [...result.lines].sort((a, b) => b.value - a.value)[0];
    expect(biggest.stream).toBe('chips');
  });
});

describe('chipOrBoard', () => {
  const prices = { lumberPerMbf: 460, chipsPerTon: 28 };

  it('is worth far more as a board than as chips', () => {
    const result = chipOrBoard({ widthIn: 4, lengthFt: 10 }, prices);
    expect(result.takeAsBoard).toBe(true);
    expect(result.ratio).toBeGreaterThan(5);
  });

  it('flips once lumber is worth nothing', () => {
    const result = chipOrBoard({ widthIn: 4, lengthFt: 10 }, { ...prices, lumberPerMbf: 5 });
    expect(result.takeAsBoard).toBe(false);
  });

  it('reports nothing to compare against when chips are worth nothing', () => {
    expect(chipOrBoard({ widthIn: 4, lengthFt: 10 }, { lumberPerMbf: 460 }).ratio).toBeNull();
  });

  it('scales with the size of the edging', () => {
    const small = chipOrBoard({ widthIn: 3, lengthFt: 8 }, prices);
    const large = chipOrBoard({ widthIn: 6, lengthFt: 16 }, prices);
    expect(large.asBoard).toBeGreaterThan(small.asBoard);
    expect(large.ratio).toBeCloseTo(small.ratio, 0);
  });
});
