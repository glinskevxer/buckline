import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import { makeLog } from '../../../src/model/log.js';
import {
  DEFAULT_MARKET_ORDER,
  gradeLoad,
  gradeLog,
  speciesDowngrades,
} from '../../../src/grade/log/index.js';

function log(species, axis, lengthFt, defects = [], extra = {}) {
  return makeLog({
    id: 'L-1',
    species,
    position: 'butt',
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
    defects,
    ...extra,
  });
}

describe('gradeLog', () => {
  it('sends a clean walnut butt to veneer', () => {
    const result = gradeLog(log('black walnut', 22, 12));
    expect(result.market).toBe('veneer');
    expect(result.grade).toBe('veneer');
  });

  it('sends a poplar of the same size to the factory', () => {
    const result = gradeLog(log('yellow poplar', 22, 12));
    expect(result.market).toBe('factory');
    expect(result.grade).toBe('F1');
  });

  it('keeps what every other market said', () => {
    const result = gradeLog(log('yellow poplar', 22, 12));
    expect(result.attempts.map((a) => a.market)).toEqual(DEFAULT_MARKET_ORDER);
    expect(result.attempts[0].grade).toBeNull();
    expect(result.attempts[0].reasons.join(' ')).toContain('not a veneer species');
  });

  it('sends a knotty but sound log to the tie market', () => {
    const knotty = [0, 1, 2, 3].map((faceIndex) => ({
      type: 'sound knot',
      faceIndex,
      startFt: 0,
      lengthFt: 12,
    }));
    const result = gradeLog(log('white oak', 20, 12, knotty));
    expect(result.attempts.find((a) => a.market === 'factory').grade).toBeNull();
    expect(result.market).toBe('tie');
  });

  it('falls all the way to pulp once the heart is gone as well', () => {
    const knotty = [0, 1, 2, 3].map((faceIndex) => ({
      type: 'sound knot',
      faceIndex,
      startFt: 0,
      lengthFt: 12,
    }));
    const rotten = [...knotty, { type: 'heart rot', widthIn: 4, depthIn: 4 }];
    const result = gradeLog(log('white oak', 20, 12, rotten));
    expect(result.market).toBe('pulp');
    expect(result.grade).toBe('pulpwood');
  });

  it('takes nothing at all from an unmerchantable stick', () => {
    const short = makeLog({
      id: 'L-9',
      species: 'white oak',
      axesIn: [20, 20],
      measuredLengthFt: 5,
    });
    const result = gradeLog(short);
    expect(result.grade).toBeNull();
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('changes the answer when the veneer buyer is not taking logs', () => {
    const walnut = log('black walnut', 22, 12);
    expect(gradeLog(walnut).market).toBe('veneer');
    expect(gradeLog(walnut, { markets: ['factory', 'tie', 'pulp'] }).market).toBe('factory');
  });

  it('refuses a market list that is empty or unknown', () => {
    expect(() => gradeLog(log('white oak', 20, 12), { markets: [] })).toThrow(GradeError);
    expect(() => gradeLog(log('white oak', 20, 12), { markets: ['firewood'] })).toThrow(GradeError);
  });
});

describe('speciesDowngrades', () => {
  it('counts mineral streak against hard maple', () => {
    const notes = speciesDowngrades(
      log('hard maple', 20, 12, [{ type: 'mineral streak', faceIndex: 0 }])
    );
    expect(notes.join(' ')).toContain('mineral streak counts');
  });

  it('ignores the same streak in red oak', () => {
    const notes = speciesDowngrades(
      log('red oak', 20, 12, [{ type: 'mineral streak', faceIndex: 0 }])
    );
    expect(notes.join(' ')).not.toContain('mineral streak counts');
  });

  it('warns to bore a species that hides rot', () => {
    expect(speciesDowngrades(log('beech', 20, 12)).join(' ')).toContain('bore before buying');
  });

  it('says nothing about rot once rot has been recorded', () => {
    const notes = speciesDowngrades(log('beech', 20, 12, [{ type: 'heart rot', widthIn: 2 }]));
    expect(notes.join(' ')).not.toContain('bore before buying');
  });

  it('rides along with the grade result', () => {
    expect(gradeLog(log('beech', 20, 12)).notes.length).toBe(1);
  });
});

describe('gradeLoad', () => {
  const logs = [
    log('black walnut', 22, 12),
    log('yellow poplar', 22, 12),
    log('yellow poplar', 20, 12),
    log('red oak', 12, 8),
  ];

  it('grades every log', () => {
    expect(gradeLoad(logs).results).toHaveLength(4);
  });

  it('counts the grades with the commonest first', () => {
    const summary = gradeLoad(logs).byGrade;
    expect(summary[0].count).toBeGreaterThanOrEqual(summary.at(-1).count);
    expect(summary.reduce((sum, row) => sum + row.count, 0)).toBe(4);
  });

  it('counts the logs no market wanted', () => {
    expect(gradeLoad(logs).ungraded).toBe(0);
  });
});
