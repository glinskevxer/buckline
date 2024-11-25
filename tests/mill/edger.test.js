import { describe, expect, it } from 'vitest';
import { MillError } from '../../src/mill/pattern.js';
import {
  availableWidths,
  bestEdging,
  costOfFixedWidth,
  edgingOptions,
  gradeAt,
  waneAt,
} from '../../src/mill/edger.js';

const prices = { FAS: 1450, F1F: 1300, SEL: 1130, '1C': 800, '2AC': 460, '3AC': 260 };

const flitch = { thicknessIn: 1, wideWidthIn: 11.5, narrowWidthIn: 8.5, lengthFt: 12 };

describe('availableWidths', () => {
  it('runs in whole inches up to the wide point', () => {
    expect(availableWidths(flitch)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('takes a different minimum', () => {
    expect(availableWidths(flitch, { minWidthIn: 6 })[0]).toBe(6);
  });
});

describe('waneAt', () => {
  it('leaves no wane inside the narrow point', () => {
    expect(waneAt(flitch, 8)).toBe(0);
    expect(waneAt(flitch, 8.5)).toBe(0);
  });

  it('leaves wane past it', () => {
    expect(waneAt(flitch, 10)).toBeCloseTo(1.5 / 10, 4);
  });

  it('leaves more wane the wider the cut', () => {
    expect(waneAt(flitch, 11)).toBeGreaterThan(waneAt(flitch, 9));
  });
});

describe('gradeAt', () => {
  it('makes the top grade on a clean width', () => {
    expect(gradeAt(flitch, 8).grade).toBe('FAS');
  });

  it('drops the grade once wane is left on', () => {
    expect(gradeAt(flitch, 10).grade).not.toBe('FAS');
  });

  it('drops further the more wane is left', () => {
    const nine = gradeAt(flitch, 9).grade;
    const eleven = gradeAt(flitch, 11).grade;
    expect(nine).not.toBe(eleven);
  });

  it('makes no grade at all on a width nothing will take', () => {
    const thin = { ...flitch, narrowWidthIn: 1, lengthFt: 3 };
    expect(gradeAt(thin, 3).grade).toBeNull();
  });

  it('never beats the grade the face itself makes', () => {
    expect(gradeAt(flitch, 8, { faceGrade: '1C' }).grade).toBe('1C');
  });
});

describe('edgingOptions', () => {
  const rows = edgingOptions(flitch, prices);

  it('prices every width the edger could cut', () => {
    expect(rows).toHaveLength(9);
  });

  it('puts the most valuable width first', () => {
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].value).toBeLessThanOrEqual(rows[i - 1].value);
    }
  });

  it('carries the grade and the wane on every row', () => {
    for (const row of rows) {
      expect(row).toHaveProperty('grade');
      expect(row).toHaveProperty('wane');
    }
  });

  it('values a width that makes no grade at nothing', () => {
    const rough = edgingOptions({ ...flitch, narrowWidthIn: 2, lengthFt: 3 }, prices);
    expect(rough.some((row) => row.value === 0)).toBe(true);
  });

  it('refuses a flitch measured the wrong way round', () => {
    expect(() => edgingOptions({ ...flitch, narrowWidthIn: 20 }, prices)).toThrow(MillError);
  });

  it('refuses a flitch with no widths on it', () => {
    expect(() => edgingOptions({ ...flitch, wideWidthIn: 0 }, prices)).toThrow(MillError);
  });
});

describe('bestEdging', () => {
  it('picks a width and names the runner up', () => {
    const result = bestEdging(flitch, prices);
    expect(result.best.widthIn).toBeGreaterThan(0);
    expect(result.runnerUp).toBeTruthy();
  });

  it('says whether the decision was close', () => {
    const result = bestEdging(flitch, prices);
    expect(typeof result.close).toBe('boolean');
    expect(result.margin).toBeGreaterThanOrEqual(0);
  });

  it('takes the wider board when the price gap is small', () => {
    const flat = { FAS: 900, F1F: 900, SEL: 900, '1C': 900, '2AC': 900, '3AC': 900 };
    expect(bestEdging(flitch, flat).best.widthIn).toBe(11);
  });

  it('takes the clean board when the top grade is worth much more', () => {
    const steep = { FAS: 4000, F1F: 500, SEL: 400, '1C': 300, '2AC': 200, '3AC': 100 };
    expect(bestEdging(flitch, steep).best.widthIn).toBe(8);
  });

  it('finds nothing worth cutting off a worthless flitch', () => {
    const result = bestEdging({ ...flitch, narrowWidthIn: 2, lengthFt: 3 }, {});
    expect(result.best).toBeNull();
  });
});

describe('costOfFixedWidth', () => {
  it('costs nothing when the fixed width is the best one', () => {
    const best = bestEdging(flitch, prices).best.widthIn;
    expect(costOfFixedWidth(flitch, prices, best).lostValue).toBe(0);
  });

  it('costs something when it is not', () => {
    expect(costOfFixedWidth(flitch, prices, 4).lostValue).toBeGreaterThan(0);
  });

  it('reports the footage as well as the money', () => {
    const result = costOfFixedWidth(flitch, prices, 4);
    expect(result.lostBoardFeet).not.toBe(0);
  });

  it('refuses a width the edger cannot cut', () => {
    expect(() => costOfFixedWidth(flitch, prices, 20)).toThrow(MillError);
  });
});
