import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import {
  ReconcileError,
  reconcile,
  reconcileSeries,
  referenceScale,
  withinNormal,
} from '../../src/report/reconciliation.js';

function log(id, axis, lengthFt = 12) {
  return makeLog({
    id,
    species: 'red oak',
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
  });
}

const logs = [log('L-1', 17.4), log('L-2', 21.8), log('L-3', 15.2)];

describe('referenceScale', () => {
  it('scales the logs on international', () => {
    expect(referenceScale(logs)).toBeGreaterThan(0);
  });

  it('refuses an empty deck', () => {
    expect(() => referenceScale([])).toThrow(ReconcileError);
  });
});

describe('reconcile', () => {
  const reference = referenceScale(logs);

  it('puts the difference between the rule and the reference in the rule bucket', () => {
    const result = reconcile({
      logs,
      contractRule: 'doyle',
      contractNetBoardFeet: 700,
      tallyBoardFeet: reference,
    });
    const rule = result.buckets.find((bucket) => bucket.name === 'rule');
    expect(rule.boardFeet).toBeCloseTo(reference - 700, 1);
  });

  it('puts nothing in the sawing bucket when the mill hit the reference', () => {
    const result = reconcile({
      logs,
      contractRule: 'doyle',
      contractNetBoardFeet: 700,
      tallyBoardFeet: reference,
    });
    expect(result.buckets.find((bucket) => bucket.name === 'sawing').boardFeet).toBe(0);
  });

  it('puts a mill that beat the geometry in the sawing bucket', () => {
    const result = reconcile({
      logs,
      contractRule: 'doyle',
      contractNetBoardFeet: 700,
      tallyBoardFeet: reference + 200,
    });
    expect(result.buckets.find((bucket) => bucket.name === 'sawing').boardFeet).toBeCloseTo(200, 1);
  });

  it('says the scaling bucket was not separated without a check scale', () => {
    const result = reconcile({
      logs,
      contractRule: 'doyle',
      contractNetBoardFeet: 700,
      tallyBoardFeet: reference,
    });
    expect(result.separated).toBe(false);
    expect(result.buckets.find((bucket) => bucket.name === 'scaling').whose).toContain(
      'no check scale'
    );
  });

  it('separates the scaler once there is a check scale', () => {
    const result = reconcile({
      logs,
      contractRule: 'doyle',
      contractNetBoardFeet: 700,
      tallyBoardFeet: reference,
      checkNetBoardFeet: 730,
    });
    expect(result.separated).toBe(true);
    expect(result.buckets.find((bucket) => bucket.name === 'scaling').boardFeet).toBe(30);
  });

  it('always adds the buckets back to the gap', () => {
    for (const check of [null, 730]) {
      const result = reconcile({
        logs,
        contractRule: 'doyle',
        contractNetBoardFeet: 700,
        tallyBoardFeet: reference + 120,
        checkNetBoardFeet: check,
      });
      const total = result.buckets.reduce((sum, bucket) => sum + bucket.boardFeet, 0);
      expect(total).toBeCloseTo(result.gapBoardFeet, 1);
    }
  });

  it('names who each bucket belongs to', () => {
    const result = reconcile({
      logs,
      contractRule: 'doyle',
      contractNetBoardFeet: 700,
      tallyBoardFeet: reference,
      checkNetBoardFeet: 700,
    });
    expect(result.buckets.map((bucket) => bucket.whose)).toEqual([
      'the contract',
      'the scaler',
      'the mill',
      'nobody yet',
    ]);
  });

  it('reports the gap as a share of the contract scale', () => {
    const result = reconcile({
      logs,
      contractRule: 'doyle',
      contractNetBoardFeet: 700,
      tallyBoardFeet: 770,
    });
    expect(result.gapShare).toBeCloseTo(0.1, 3);
  });

  it('refuses a reconciliation with no numbers on it', () => {
    expect(() => reconcile({ logs, contractRule: 'doyle', contractNetBoardFeet: 700 })).toThrow(
      ReconcileError
    );
  });
});

describe('withinNormal', () => {
  const reference = referenceScale(logs);

  it('files a small gap', () => {
    const result = reconcile({
      logs,
      contractRule: 'international',
      contractNetBoardFeet: reference,
      tallyBoardFeet: reference * 1.03,
    });
    expect(withinNormal(result)).toBe(true);
  });

  it('calls a meeting about a big one', () => {
    const result = reconcile({
      logs,
      contractRule: 'international',
      contractNetBoardFeet: reference,
      tallyBoardFeet: reference * 1.3,
    });
    expect(withinNormal(result)).toBe(false);
  });

  it('takes a tighter band', () => {
    const result = reconcile({
      logs,
      contractRule: 'international',
      contractNetBoardFeet: reference,
      tallyBoardFeet: reference * 1.03,
    });
    expect(withinNormal(result, { share: 0.01 })).toBe(false);
  });
});

describe('reconcileSeries', () => {
  const reference = referenceScale(logs);
  const entry = (delta) => ({
    logs,
    contractRule: 'international',
    contractNetBoardFeet: reference,
    tallyBoardFeet: reference + delta,
  });
  const entries = [entry(0), entry(12), entry(-9)];

  it('reconciles every load', () => {
    expect(reconcileSeries(entries).loads).toBe(3);
  });

  it('averages the gap share', () => {
    expect(reconcileSeries(entries).meanGapShare).toBeGreaterThan(0);
  });

  it('names the worst load', () => {
    expect(reconcileSeries(entries).worst.tallyBoardFeet).toBeCloseTo(reference + 12, 1);
  });

  it('calls a tight series consistent', () => {
    expect(reconcileSeries(entries).consistent).toBe(true);
  });

  it('calls a wild series inconsistent', () => {
    expect(reconcileSeries([entry(0), entry(reference)]).consistent).toBe(false);
  });

  it('refuses an empty series', () => {
    expect(() => reconcileSeries([])).toThrow(ReconcileError);
  });
});
