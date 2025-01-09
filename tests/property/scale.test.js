import { describe, expect, it } from 'vitest';
import { makeLog } from '../../src/model/log.js';
import { grossScale } from '../../src/scale/gross.js';
import { netScale } from '../../src/scale/net.js';
import { getRule, ruleIds } from '../../src/scale/rules/index.js';
import { scalingDiameter } from '../../src/measure/diameter.js';
import { forEachSample, rng, someLog } from './generators.js';

const RULES = ruleIds();

describe('the rules themselves', () => {
  it('never go down as the log gets bigger', () => {
    for (const id of RULES) {
      const rule = getRule(id);
      for (let length = 8; length <= 16; length += 2) {
        let previous = -1;
        for (let diameter = 6; diameter <= 40; diameter += 1) {
          const value = rule.scale(diameter, length);
          expect(value).toBeGreaterThanOrEqual(previous);
          previous = value;
        }
      }
    }
  });

  it('never go down as the log gets longer', () => {
    for (const id of RULES) {
      const rule = getRule(id);
      for (let diameter = 8; diameter <= 30; diameter += 2) {
        let previous = -1;
        for (let length = 6; length <= 20; length += 1) {
          const value = rule.gross(diameter, length);
          expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
          previous = value;
        }
      }
    }
  });

  it('never find a negative volume anywhere in range', () => {
    for (const id of RULES) {
      const rule = getRule(id);
      for (let diameter = 0; diameter <= 40; diameter += 1) {
        expect(rule.gross(diameter, 12)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('round to their own rounding on every diameter and length', () => {
    for (const id of RULES) {
      const rule = getRule(id);
      for (let diameter = 6; diameter <= 40; diameter += 1) {
        for (let length = 6; length <= 16; length += 1) {
          expect(rule.scale(diameter, length) % rule.roundsTo).toBe(0);
        }
      }
    }
  });
});

describe('scaling diameter', () => {
  it('never comes out above the larger of the two tape readings', () => {
    const next = rng(7);
    for (let i = 0; i < 400; i += 1) {
      const a = 6 + next() * 30;
      const b = 6 + next() * 30;
      const result = scalingDiameter([a, b], { species: 'red oak' });
      expect(result.scalingDiameter).toBeLessThanOrEqual(Math.max(a, b));
    }
  });

  it('is never bigger inside the bark than outside it', () => {
    const next = rng(11);
    for (let i = 0; i < 400; i += 1) {
      const a = 6 + next() * 30;
      const result = scalingDiameter([a], { convention: 'single', species: 'white oak' });
      expect(result.insideBark).toBeLessThan(a);
    }
  });
});

describe('gross and net over a stream of logs', () => {
  it('never nets more than it grosses', () => {
    forEachSample(20250106, 300, someLog, (raw) => {
      const log = makeLog(raw);
      for (const rule of RULES) {
        const result = netScale(log, rule);
        expect(result.scaledNetBoardFeet ?? 0).toBeLessThanOrEqual(result.grossBoardFeet + 1e-6);
      }
    });
  });

  it('never nets a negative volume', () => {
    forEachSample(20250107, 300, someLog, (raw) => {
      const log = makeLog(raw);
      for (const rule of RULES) {
        expect(netScale(log, rule).netBoardFeet).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('never deducts a negative amount on any line', () => {
    forEachSample(20250108, 200, someLog, (raw) => {
      const log = makeLog(raw);
      for (const rule of RULES) {
        for (const line of netScale(log, rule).deductions) {
          expect(line.deductionBoardFeet).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  it('gives a culled log a net of nothing', () => {
    forEachSample(20250109, 200, someLog, (raw) => {
      const log = makeLog(raw);
      for (const rule of RULES) {
        const result = netScale(log, rule);
        if (result.cull) expect(result.netBoardFeet).toBe(0);
      }
    });
  });

  it('scales the same log the same way twice', () => {
    forEachSample(20250110, 100, someLog, (raw) => {
      const log = makeLog(raw);
      for (const rule of RULES) {
        expect(netScale(log, rule)).toEqual(netScale(log, rule));
      }
    });
  });

  it('never grosses more under a whole log rule than the rule table says', () => {
    forEachSample(20250111, 200, someLog, (raw) => {
      const log = makeLog(raw);
      const result = grossScale(log, 'doyle');
      if (result.boardFeet > 0) {
        expect(result.boardFeet).toBe(
          getRule('doyle').scale(log.scalingDiameterIn, log.nominalLengthFt)
        );
      }
    });
  });
});
