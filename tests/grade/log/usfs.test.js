import { describe, expect, it } from 'vitest';
import { GradeError } from '../../../src/errors.js';
import { makeLog } from '../../../src/model/log.js';
import {
  FACTORY_GRADES,
  factoryGrade,
  gradeSpec,
  meetsGrade,
  requirementsFor,
} from '../../../src/grade/log/usfs.js';

function log(axis, lengthFt, defects = [], extra = {}) {
  return makeLog({
    id: 'L-1',
    species: 'red oak',
    position: 'butt',
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
    defects,
    ...extra,
  });
}

describe('requirementsFor', () => {
  it('asks a thirteen inch log for seven foot cuttings at grade one', () => {
    expect(requirementsFor(log(14.2, 12), 'F1').minCuttingFt).toBe(7);
  });

  it('asks a sixteen inch log for five foot cuttings', () => {
    expect(requirementsFor(log(17.4, 12), 'F1').minCuttingFt).toBe(5);
  });

  it('asks a twenty inch log for only three foot cuttings', () => {
    expect(requirementsFor(log(21.8, 12), 'F1').minCuttingFt).toBe(3);
  });

  it('has no grade one standard for a log under thirteen inches', () => {
    expect(requirementsFor(log(12, 12), 'F1').minCuttingFt).toBeNull();
  });

  it('allows a third cutting on a twelve foot log at grade two', () => {
    expect(requirementsFor(log(17.4, 12), 'F2').maxCuttings).toBe(3);
    expect(requirementsFor(log(17.4, 10), 'F2').maxCuttings).toBe(2);
  });

  it('sets no cutting limit at grade three', () => {
    expect(requirementsFor(log(17.4, 12), 'F3').maxCuttings).toBeNull();
  });

  it('refuses a grade nobody sells on', () => {
    expect(() => requirementsFor(log(17.4, 12), 'F4')).toThrow(GradeError);
  });
});

describe('the diameter decides what the faces are measured against', () => {
  const defects = [0, 1, 2, 3].map((faceIndex) => ({
    type: 'unsound knot',
    faceIndex,
    startFt: 6,
    lengthFt: 0.5,
  }));

  it('fails a fourteen inch log because seven foot cuttings are not there', () => {
    const result = meetsGrade(log(15.3, 12, defects), 'F1');
    expect(result.requirements.minCuttingFt).toBe(7);
    expect(result.meets).toBe(false);
  });

  it('passes the same defect layout on a twenty inch log', () => {
    const result = meetsGrade(log(21.8, 12, defects), 'F1');
    expect(result.requirements.minCuttingFt).toBe(3);
    expect(result.meets).toBe(true);
  });
});

describe('meetsGrade', () => {
  it('passes a clean butt log at grade one', () => {
    const result = meetsGrade(log(17.4, 12), 'F1');
    expect(result.meets).toBe(true);
    expect(result.passingFaces).toBe(4);
    expect(result.reasons).toEqual([]);
  });

  it('refuses an upper log at grade one whatever it looks like', () => {
    const result = meetsGrade(log(21.8, 16, [], { position: 'upper' }), 'F1');
    expect(result.meets).toBe(false);
    expect(result.reasons.join(' ')).toContain('takes butt logs');
  });

  it('takes the same upper log at grade two', () => {
    expect(meetsGrade(log(21.8, 16, [], { position: 'upper' }), 'F2').meets).toBe(true);
  });

  it('refuses a log under the length floor', () => {
    const result = meetsGrade(log(17.4, 8), 'F1');
    expect(result.reasons.join(' ')).toContain('foot floor');
  });

  it('refuses a log whose cull is over the limit', () => {
    const result = meetsGrade(log(17.4, 12), 'F1', { cullShare: 0.45 });
    expect(result.meets).toBe(false);
    expect(result.reasons.join(' ')).toContain('percent limit');
  });

  it('lets the same cull through at grade two', () => {
    expect(meetsGrade(log(17.4, 12), 'F2', { cullShare: 0.45 }).meets).toBe(true);
  });

  it('collects every reason rather than stopping at the first', () => {
    const result = meetsGrade(log(12, 8, [], { position: 'upper' }), 'F1');
    expect(result.reasons.length).toBeGreaterThan(2);
  });

  it('needs only two clear faces at grade three', () => {
    expect(gradeSpec('F3').facesRequired).toBe(2);
    const defects = [0, 1].map((faceIndex) => ({
      type: 'hole',
      faceIndex,
      startFt: 0,
      lengthFt: 12,
    }));
    expect(meetsGrade(log(17.4, 12, defects), 'F2').meets).toBe(false);
    expect(meetsGrade(log(17.4, 12, defects), 'F3').meets).toBe(true);
  });
});

describe('factoryGrade', () => {
  it('takes the best grade the log makes', () => {
    expect(factoryGrade(log(17.4, 12)).grade).toBe('F1');
  });

  it('falls to grade two when the log is an upper', () => {
    expect(factoryGrade(log(17.4, 12, [], { position: 'upper' })).grade).toBe('F2');
  });

  it('falls to grade three when the faces are poor', () => {
    const defects = [0, 1].map((faceIndex) => ({
      type: 'hole',
      faceIndex,
      startFt: 0,
      lengthFt: 12,
    }));
    expect(factoryGrade(log(17.4, 12, defects)).grade).toBe('F3');
  });

  it('returns no grade when the log makes none', () => {
    const defects = [0, 1, 2].map((faceIndex) => ({
      type: 'hole',
      faceIndex,
      startFt: 0,
      lengthFt: 12,
    }));
    const result = factoryGrade(log(17.4, 12, defects));
    expect(result.grade).toBeNull();
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('tries every grade and keeps the working', () => {
    const result = factoryGrade(log(17.4, 12));
    expect(result.attempts.map((a) => a.grade)).toEqual(FACTORY_GRADES);
  });
});
