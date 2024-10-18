import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../src/errors.js';
import {
  expandByPieces,
  requiredSampleSize,
  sampleStatistics,
  sampleVerdict,
} from '../../src/scale/sample.js';

const tight = Array.from({ length: 30 }, (_, i) => 200 + (i % 3) * 5);
const wild = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 20 : 800));

describe('sampleStatistics', () => {
  it('averages the sample', () => {
    expect(sampleStatistics([100, 200, 300]).mean).toBe(200);
  });

  it('reports the spread as a share of the mean', () => {
    expect(sampleStatistics(wild).coefficientOfVariation).toBeGreaterThan(
      sampleStatistics(tight).coefficientOfVariation
    );
  });

  it('reports a standard error that falls as the sample grows', () => {
    const small = sampleStatistics(tight.slice(0, 6));
    const large = sampleStatistics(tight);
    expect(large.standardError).toBeLessThan(small.standardError);
  });

  it('refuses a sample of one', () => {
    expect(() => sampleStatistics([200])).toThrow(ScaleError);
    expect(() => sampleStatistics([])).toThrow(ScaleError);
  });
});

describe('expandByPieces', () => {
  it('expands the mean over the deck', () => {
    const result = expandByPieces(tight, 300);
    expect(result.expandedBoardFeet).toBeCloseTo(result.mean * 300, 0);
  });

  it('reports the sampling share', () => {
    expect(expandByPieces(tight, 300).samplingShare).toBe(0.1);
  });

  it('tightens as the sample covers more of the deck', () => {
    const thin = expandByPieces(tight, 3000);
    const thick = expandByPieces(tight, 35);
    expect(thick.relativeError).toBeLessThan(thin.relativeError);
  });

  it('has almost no error when the sample is the whole deck', () => {
    expect(expandByPieces(tight, 30).boundBoardFeet).toBe(0);
  });

  it('accepts a tight sample and refuses a wild one', () => {
    expect(expandByPieces(tight, 300).acceptable).toBe(true);
    expect(expandByPieces(wild, 300).acceptable).toBe(false);
  });

  it('refuses a deck smaller than the sample', () => {
    expect(() => expandByPieces(tight, 10)).toThrow(ScaleError);
  });

  it('takes a tighter limit', () => {
    expect(expandByPieces(tight, 300, { maxError: 0.001 }).acceptable).toBe(false);
  });
});

describe('requiredSampleSize', () => {
  it('asks for very few logs off an even deck', () => {
    expect(requiredSampleSize(tight, 300)).toBeLessThan(30);
  });

  it('asks for most of the deck off a wild one', () => {
    expect(requiredSampleSize(wild, 300)).toBeGreaterThan(200);
  });

  it('never quite asks for the whole deck, because of the population correction', () => {
    expect(requiredSampleSize(wild, 300)).toBeLessThan(300);
  });

  it('never asks for more than the deck holds', () => {
    expect(requiredSampleSize(wild, 40)).toBeLessThanOrEqual(40);
  });

  it('asks for more when the limit is tighter', () => {
    expect(requiredSampleSize(tight, 300, { maxError: 0.005 })).toBeGreaterThan(
      requiredSampleSize(tight, 300, { maxError: 0.05 })
    );
  });
});

describe('sampleVerdict', () => {
  it('expands a tight sample', () => {
    const result = sampleVerdict(tight, 300);
    expect(result.verdict).toBe('expand');
  });

  it('sends a wild deck to a full scale', () => {
    const result = sampleVerdict(wild, 300);
    expect(result.verdict).toBe('scale the load');
    expect(result.reason).toContain('save anything');
  });

  it('asks for more logs when a few more would do', () => {
    const middling = Array.from({ length: 8 }, (_, i) => 180 + (i % 4) * 60);
    const result = sampleVerdict(middling, 400);
    expect(result.verdict).toBe('scale more');
    expect(result.needed).toBeGreaterThan(8);
    expect(result.reason).toContain('more logs');
  });

  it('always carries the expansion it worked out', () => {
    expect(sampleVerdict(wild, 300).expansion.expandedBoardFeet).toBeGreaterThan(0);
  });
});
