import { describe, expect, it } from 'vitest';
import {
  TallyError,
  buildUnits,
  describeUnit,
  packingEfficiency,
  parseUnitKey,
  unitKey,
} from '../../src/tally/unit.js';

function entry(grade, quarters, lengthFt, boardFeet, id = 'B') {
  return { id, grade, quarters, lengthFt, boardFeet };
}

function many(count, grade, quarters, lengthFt, boardFeet) {
  return Array.from({ length: count }, (_, i) =>
    entry(grade, quarters, lengthFt, boardFeet, `B-${i}`)
  );
}

describe('unitKey', () => {
  it('keys on grade, thickness and length', () => {
    expect(unitKey(entry('FAS', 4, 12, 10))).toBe('FAS|4|12');
  });

  it('round trips', () => {
    expect(parseUnitKey(unitKey(entry('1C', 8, 10, 10)))).toEqual({
      grade: '1C',
      quarters: 8,
      lengthFt: 10,
    });
  });
});

describe('buildUnits', () => {
  it('fills a package to the target', () => {
    const result = buildUnits(many(100, 'FAS', 4, 12, 10));
    expect(result.units).toHaveLength(1);
    expect(result.units[0].boardFeet).toBe(1000);
    expect(result.units[0].pieceCount).toBe(100);
  });

  it('starts a second package once the first is full', () => {
    const result = buildUnits(many(150, 'FAS', 4, 12, 10));
    expect(result.units).toHaveLength(1);
    expect(result.odds).toHaveLength(50);
  });

  it('makes two packages when there is enough for two', () => {
    const result = buildUnits(many(200, 'FAS', 4, 12, 10));
    expect(result.units).toHaveLength(2);
    expect(result.unitBoardFeet).toBe(2000);
  });

  it('never mixes grades in one package', () => {
    const result = buildUnits([...many(100, 'FAS', 4, 12, 10), ...many(100, '1C', 4, 12, 10)]);
    expect(result.units).toHaveLength(2);
    expect(new Set(result.units.map((unit) => unit.grade)).size).toBe(2);
  });

  it('never mixes thicknesses or lengths', () => {
    const result = buildUnits([
      ...many(100, 'FAS', 4, 12, 10),
      ...many(100, 'FAS', 8, 12, 10),
      ...many(100, 'FAS', 4, 10, 10),
    ]);
    expect(result.units).toHaveLength(3);
  });

  it('sends a part package to the odds pile', () => {
    const result = buildUnits(many(30, 'FAS', 4, 12, 10));
    expect(result.units).toHaveLength(0);
    expect(result.odds).toHaveLength(30);
    expect(result.oddsBoardFeet).toBe(300);
  });

  it('keeps a package that reaches the minimum', () => {
    const result = buildUnits(many(70, 'FAS', 4, 12, 10));
    expect(result.units).toHaveLength(1);
    expect(result.units[0].boardFeet).toBe(700);
  });

  it('can be told a different target and minimum', () => {
    const result = buildUnits(many(30, 'FAS', 4, 12, 10), {
      targetBoardFeet: 300,
      minimumBoardFeet: 200,
    });
    expect(result.units).toHaveLength(1);
  });

  it('holds ungraded boards out of every package', () => {
    const result = buildUnits([...many(100, 'FAS', 4, 12, 10), entry(null, 4, 12, 10)]);
    expect(result.ungraded).toHaveLength(1);
    expect(result.ungradedBoardFeet).toBe(10);
    expect(result.units[0].pieceCount).toBe(100);
  });

  it('numbers packages in order', () => {
    const result = buildUnits(many(200, 'FAS', 4, 12, 10));
    expect(result.units.map((unit) => unit.unitId)).toEqual(['U-0001', 'U-0002']);
  });

  it('never overfills a package', () => {
    const result = buildUnits([...many(99, 'FAS', 4, 12, 10), entry('FAS', 4, 12, 40)]);
    for (const unit of result.units) {
      expect(unit.boardFeet).toBeLessThanOrEqual(1000);
    }
  });

  it('accounts for every board somewhere', () => {
    const entries = [...many(150, 'FAS', 4, 12, 10), entry(null, 4, 12, 10)];
    const result = buildUnits(entries);
    const placed =
      result.units.reduce((sum, unit) => sum + unit.boards.length, 0) +
      result.odds.length +
      result.ungraded.length;
    expect(placed).toBe(entries.length);
  });

  it('refuses a nonsense target', () => {
    expect(() => buildUnits([], { targetBoardFeet: 0 })).toThrow(TallyError);
    expect(() => buildUnits([], { targetBoardFeet: 500, minimumBoardFeet: 900 })).toThrow(
      TallyError
    );
  });

  it('builds nothing out of nothing', () => {
    const result = buildUnits([]);
    expect(result.units).toEqual([]);
    expect(result.unitBoardFeet).toBe(0);
  });
});

describe('packingEfficiency', () => {
  it('is one when every package is full', () => {
    expect(packingEfficiency(buildUnits(many(200, 'FAS', 4, 12, 10)))).toBe(1);
  });

  it('falls when a package is short', () => {
    expect(packingEfficiency(buildUnits(many(70, 'FAS', 4, 12, 10)))).toBe(0.7);
  });

  it('is zero when nothing was packed', () => {
    expect(packingEfficiency(buildUnits([]))).toBe(0);
  });
});

describe('describeUnit', () => {
  it('writes a strap tag', () => {
    const unit = buildUnits(many(100, 'FAS', 4, 12, 10)).units[0];
    expect(describeUnit(unit)).toBe('U-0001 FAS 4/4 12ft 1000bf 100pc');
  });
});
