import { describe, expect, it } from 'vitest';
import { makeLog } from '../../../src/model/log.js';
import {
  FACE_COUNT,
  clearCuttings,
  gradingZone,
  passingFaceCount,
  readFace,
  readFaces,
} from '../../../src/grade/log/faces.js';

function log(defects, extra = {}) {
  return makeLog({
    id: 'L-1',
    species: 'red oak',
    axesIn: [17.4, 17.4],
    measuredLengthFt: 12.25,
    defects,
    ...extra,
  });
}

const req = { minCuttingFt: 3, maxCuttings: 2, minYieldShare: 2 / 3 };

describe('gradingZone', () => {
  it('drops the bottom foot of a butt log', () => {
    expect(gradingZone(log([], { position: 'butt' }))).toEqual({
      startFt: 1,
      endFt: 12,
      lengthFt: 11,
    });
  });

  it('grades an upper log end to end', () => {
    expect(gradingZone(log([])).lengthFt).toBe(12);
  });

  it('can be told to exclude a different amount', () => {
    expect(gradingZone(log([], { position: 'butt' }), { excludeButtFt: 2 }).lengthFt).toBe(10);
  });
});

describe('clearCuttings', () => {
  it('finds the whole face clear when there is nothing on it', () => {
    expect(clearCuttings(log([]), 0)).toEqual([{ startFt: 0, lengthFt: 12 }]);
  });

  it('splits the face either side of a defect', () => {
    const cuttings = clearCuttings(
      log([{ type: 'unsound knot', faceIndex: 0, startFt: 5, lengthFt: 1 }]),
      0
    );
    expect(cuttings).toEqual([
      { startFt: 6, lengthFt: 6 },
      { startFt: 0, lengthFt: 5 },
    ]);
  });

  it('leaves the other faces alone', () => {
    const defects = [{ type: 'unsound knot', faceIndex: 0, startFt: 5, lengthFt: 1 }];
    expect(clearCuttings(log(defects), 1)).toEqual([{ startFt: 0, lengthFt: 12 }]);
  });

  it('merges two defects that overlap', () => {
    const cuttings = clearCuttings(
      log([
        { type: 'unsound knot', faceIndex: 0, startFt: 4, lengthFt: 2 },
        { type: 'hole', faceIndex: 0, startFt: 5, lengthFt: 3 },
      ]),
      0
    );
    expect(cuttings).toEqual([
      { startFt: 0, lengthFt: 4 },
      { startFt: 8, lengthFt: 4 },
    ]);
  });

  it('spoils the whole face when a defect has no position', () => {
    expect(clearCuttings(log([{ type: 'hole', faceIndex: 0 }]), 0)).toEqual([]);
  });

  it('ignores sweep and crook, which are not face defects', () => {
    expect(clearCuttings(log([{ type: 'sweep', faceIndex: 0, depthIn: 5 }]), 0)).toHaveLength(1);
  });

  it('clips a defect that runs past the end of the log', () => {
    const cuttings = clearCuttings(
      log([{ type: 'seam', faceIndex: 0, startFt: 10, lengthFt: 8 }]),
      0
    );
    expect(cuttings).toEqual([{ startFt: 0, lengthFt: 10 }]);
  });

  it('starts a butt log face above the excluded foot', () => {
    const cuttings = clearCuttings(log([], { position: 'butt' }), 0);
    expect(cuttings).toEqual([{ startFt: 1, lengthFt: 11 }]);
  });

  it('returns the longest run first', () => {
    const cuttings = clearCuttings(
      log([{ type: 'hole', faceIndex: 0, startFt: 3, lengthFt: 1 }]),
      0
    );
    expect(cuttings[0].lengthFt).toBe(8);
  });
});

describe('readFace', () => {
  it('passes a clean face outright', () => {
    const face = readFace(log([]), 0, req);
    expect(face.passes).toBe(true);
    expect(face.yieldShare).toBe(1);
    expect(face.cuttingCount).toBe(1);
  });

  it('throws away a cutting shorter than the minimum', () => {
    const face = readFace(
      log([{ type: 'hole', faceIndex: 0, startFt: 2, lengthFt: 1 }]),
      0,
      req
    );
    expect(face.rejectedCount).toBe(1);
    expect(face.clearFt).toBe(9);
  });

  it('takes only as many cuttings as the grade allows', () => {
    const face = readFace(
      log([
        { type: 'hole', faceIndex: 0, startFt: 3, lengthFt: 0.5 },
        { type: 'hole', faceIndex: 0, startFt: 7, lengthFt: 0.5 },
      ]),
      0,
      { minCuttingFt: 3, maxCuttings: 2, minYieldShare: 0.5 }
    );
    expect(face.cuttingCount).toBe(2);
    expect(face.clearFt).toBe(8);
  });

  it('takes every cutting when the grade sets no limit', () => {
    const face = readFace(
      log([
        { type: 'hole', faceIndex: 0, startFt: 3, lengthFt: 0.5 },
        { type: 'hole', faceIndex: 0, startFt: 7, lengthFt: 0.5 },
      ]),
      0,
      { minCuttingFt: 3, maxCuttings: null, minYieldShare: 0.5 }
    );
    expect(face.cuttingCount).toBe(3);
  });

  it('fails a face that does not yield enough', () => {
    const face = readFace(
      log([{ type: 'hole', faceIndex: 0, startFt: 4, lengthFt: 6 }]),
      0,
      req
    );
    expect(face.yieldShare).toBeLessThan(2 / 3);
    expect(face.passes).toBe(false);
  });

  it('fails a face with nothing long enough to cut', () => {
    const face = readFace(
      log([{ type: 'hole', faceIndex: 0, startFt: 0, lengthFt: 11 }]),
      0,
      req
    );
    expect(face.cuttingCount).toBe(0);
    expect(face.passes).toBe(false);
  });

  it('changes its answer when the minimum cutting length changes', () => {
    const defects = [{ type: 'hole', faceIndex: 0, startFt: 5, lengthFt: 1 }];
    const short = readFace(log(defects), 0, { minCuttingFt: 3, maxCuttings: 2, minYieldShare: 0.9 });
    const long = readFace(log(defects), 0, { minCuttingFt: 7, maxCuttings: 2, minYieldShare: 0.9 });
    expect(short.clearFt).toBe(11);
    expect(long.clearFt).toBe(0);
  });
});

describe('readFaces', () => {
  const spotty = log([
    { type: 'hole', faceIndex: 0, startFt: 4, lengthFt: 6 },
    { type: 'hole', faceIndex: 1, startFt: 4, lengthFt: 2 },
  ]);

  it('reads all four faces', () => {
    expect(readFaces(spotty, req)).toHaveLength(FACE_COUNT);
  });

  it('sorts the best face first', () => {
    const faces = readFaces(spotty, req);
    expect(faces[0].yieldShare).toBe(1);
    expect(faces.at(-1).faceIndex).toBe(0);
  });

  it('counts the faces that pass', () => {
    expect(passingFaceCount(spotty, req)).toBe(3);
  });

  it('counts none on a log with a positionless defect on every face', () => {
    const ruined = log([0, 1, 2, 3].map((faceIndex) => ({ type: 'hole', faceIndex })));
    expect(passingFaceCount(ruined, req)).toBe(0);
  });
});
