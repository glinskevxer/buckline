import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors.js';
import { defectsOnFace, describeLog, isButtLog, makeLog } from '../../src/model/log.js';

const raw = {
  id: 'L-1001',
  species: 'Red Oak',
  position: 'butt',
  axesIn: [17, 19],
  largeEndIn: 20,
  measuredLengthFt: 12.25,
  tractId: 'T-7',
};

describe('makeLog', () => {
  it('normalises the species and carries the group with it', () => {
    const log = makeLog(raw);
    expect(log.species).toBe('red oak');
    expect(log.speciesGroup).toBe('hardwood');
  });

  it('derives the scaling diameter through the bark deduction', () => {
    const log = makeLog(raw);
    expect(log.insideBarkIn).toBeCloseTo(16.56, 2);
    expect(log.scalingDiameterIn).toBe(16);
  });

  it('derives the nominal length and the trim', () => {
    const log = makeLog(raw);
    expect(log.nominalLengthFt).toBe(12);
    expect(log.trimIn).toBeCloseTo(3, 6);
    expect(log.merchantable).toBe(true);
  });

  it('records the conventions that were used', () => {
    const log = makeLog(raw, { rounding: 'nearest', trimPolicy: 'softwood' });
    expect(log.conventions).toEqual({
      convention: 'average',
      rounding: 'nearest',
      trimPolicy: 'softwood',
    });
    expect(log.scalingDiameterIn).toBe(17);
  });

  it('derives taper when a large end was measured', () => {
    const log = makeLog(raw);
    expect(log.taperPerFoot).toBeCloseTo((20 - 16.56) / 12, 3);
  });

  it('leaves taper null when there is no large end reading', () => {
    const log = makeLog({ ...raw, largeEndIn: undefined });
    expect(log.taperPerFoot).toBeNull();
  });

  it('leaves taper null rather than going negative on a bad tape reading', () => {
    const log = makeLog({ ...raw, largeEndIn: 12 });
    expect(log.taperPerFoot).toBeNull();
  });

  it('defaults an unstated position to an upper log', () => {
    expect(makeLog({ ...raw, position: undefined }).position).toBe('upper');
  });

  it('defaults the defect list to empty', () => {
    expect(makeLog(raw).defects).toEqual([]);
  });

  it('keeps a defect list it is given', () => {
    const log = makeLog({
      ...raw,
      defects: [{ type: 'sweep', lengthFt: 12, depthIn: 3 }],
    });
    expect(log.defects).toHaveLength(1);
    expect(log.defects[0].type).toBe('sweep');
  });

  it('rejects a log with no identity', () => {
    expect(() => makeLog({ ...raw, id: '' })).toThrow(ValidationError);
  });

  it('rejects a position that is not one of the three', () => {
    expect(() => makeLog({ ...raw, position: 'middle' })).toThrow(ValidationError);
  });

  it('rejects a defect on a face that does not exist', () => {
    expect(() => makeLog({ ...raw, defects: [{ type: 'knot', faceIndex: 4 }] })).toThrow(
      ValidationError
    );
  });

  it('marks a stick under the shortest class unmerchantable', () => {
    const log = makeLog({ ...raw, measuredLengthFt: 6 });
    expect(log.merchantable).toBe(false);
    expect(log.nominalLengthFt).toBe(0);
  });

  it('does not share the axes array with the caller', () => {
    const input = { ...raw, axesIn: [17, 19] };
    const log = makeLog(input);
    input.axesIn.push(99);
    expect(log.axesIn).toEqual([17, 19]);
  });
});

describe('isButtLog', () => {
  it('picks out the butt log', () => {
    expect(isButtLog(makeLog(raw))).toBe(true);
    expect(isButtLog(makeLog({ ...raw, position: 'second' }))).toBe(false);
  });
});

describe('defectsOnFace', () => {
  const log = makeLog({
    ...raw,
    defects: [
      { type: 'knot', faceIndex: 0 },
      { type: 'seam', faceIndex: 2 },
      { type: 'knot', faceIndex: 0 },
    ],
  });

  it('filters to one face', () => {
    expect(defectsOnFace(log, 0)).toHaveLength(2);
    expect(defectsOnFace(log, 1)).toHaveLength(0);
  });

  it('returns everything when no face is named', () => {
    expect(defectsOnFace(log)).toHaveLength(3);
  });

  it('returns a copy', () => {
    const all = defectsOnFace(log);
    all.pop();
    expect(log.defects).toHaveLength(3);
  });
});

describe('describeLog', () => {
  it('writes a scale sheet line', () => {
    expect(describeLog(makeLog(raw))).toBe('L-1001 red oak 16 in x 12 ft');
  });

  it('says short instead of a length for an unmerchantable stick', () => {
    expect(describeLog(makeLog({ ...raw, measuredLengthFt: 6 }))).toContain('short');
  });
});
