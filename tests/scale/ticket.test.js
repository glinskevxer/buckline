import { describe, expect, it } from 'vitest';
import { ScaleError } from '../../src/errors.js';
import { makeLog } from '../../src/model/log.js';
import { averageLogSize, cullReport, deductionShare, scaleTicket } from '../../src/scale/ticket.js';

function log(id, species, axis, lengthFt, defects = []) {
  return makeLog({
    id,
    species,
    axesIn: [axis, axis],
    measuredLengthFt: lengthFt + 0.25,
    defects,
  });
}

const load = {
  ticketId: 'S-4417',
  loadId: 'LD-19',
  tractId: 'T-7',
  scaledBy: 'D. Rakes',
  rule: 'doyle',
  logs: [
    log('L-1', 'red oak', 17.4, 16),
    log('L-2', 'red oak', 21.8, 12),
    log('L-3', 'white oak', 15.2, 12),
    log('L-4', 'yellow poplar', 13.7, 10, [
      { type: 'heart rot', widthIn: 10, depthIn: 10, lengthFt: 10 },
    ]),
  ],
};

describe('scaleTicket', () => {
  const ticket = scaleTicket(load);

  it('keeps the paperwork off the load', () => {
    expect(ticket.ticketId).toBe('S-4417');
    expect(ticket.scaledBy).toBe('D. Rakes');
    expect(ticket.ruleLabel).toBe('Doyle');
  });

  it('writes one line per log', () => {
    expect(ticket.lines).toHaveLength(4);
    expect(ticket.logCount).toBe(4);
  });

  it('totals net from the lines that were kept', () => {
    const kept = ticket.lines.filter((line) => !line.cull);
    expect(ticket.netBoardFeet).toBeCloseTo(
      kept.reduce((sum, line) => sum + line.netBoardFeet, 0),
      1
    );
  });

  it('totals gross from every line including the culls', () => {
    expect(ticket.grossBoardFeet).toBeCloseTo(
      ticket.lines.reduce((sum, line) => sum + line.grossBoardFeet, 0),
      1
    );
  });

  it('counts kept and culled separately', () => {
    expect(ticket.keptCount + ticket.culledCount).toBe(ticket.logCount);
    expect(ticket.culledCount).toBe(1);
  });

  it('makes deduction the difference between the two totals', () => {
    expect(ticket.deductionBoardFeet).toBeCloseTo(ticket.grossBoardFeet - ticket.netBoardFeet, 1);
  });

  it('refuses an empty load', () => {
    expect(() => scaleTicket({ rule: 'doyle', logs: [] })).toThrow(ScaleError);
    expect(() => scaleTicket({ rule: 'doyle' })).toThrow(ScaleError);
  });

  it('refuses a rule nobody scales under', () => {
    expect(() => scaleTicket({ ...load, rule: 'cubic' })).toThrow();
  });
});

describe('breakdowns', () => {
  const ticket = scaleTicket(load);

  it('groups by species with the biggest first', () => {
    const species = ticket.bySpecies.map((row) => row.key);
    expect(species).toContain('red oak');
    expect(ticket.bySpecies[0].netBoardFeet).toBeGreaterThanOrEqual(
      ticket.bySpecies.at(-1).netBoardFeet
    );
  });

  it('counts every log in each breakdown', () => {
    for (const breakdown of [ticket.bySpecies, ticket.byLength, ticket.byDiameter]) {
      expect(breakdown.reduce((sum, row) => sum + row.logCount, 0)).toBe(4);
    }
  });

  it('keeps a culled log in the count but not in the net', () => {
    const poplar = ticket.bySpecies.find((row) => row.key === 'yellow poplar');
    expect(poplar.logCount).toBe(1);
    expect(poplar.netBoardFeet).toBe(0);
    expect(poplar.grossBoardFeet).toBeGreaterThan(0);
  });

  it('groups the two twelve footers together', () => {
    const twelve = ticket.byLength.find((row) => row.key === '12');
    expect(twelve.logCount).toBe(2);
  });

  it('groups by scaling diameter after the bark deduction, not by the tape reading', () => {
    expect(ticket.byDiameter.map((row) => row.key).sort()).toEqual(['13', '16', '20']);
    const thirteens = ticket.byDiameter.find((row) => row.key === '13');
    expect(thirteens.logCount).toBe(2);
  });
});

describe('summary figures', () => {
  it('reports the deduction share', () => {
    const ticket = scaleTicket(load);
    expect(deductionShare(ticket)).toBeGreaterThan(0);
    expect(deductionShare(ticket)).toBeLessThan(1);
  });

  it('reports a zero share on a clean load', () => {
    const cleanTicket = scaleTicket({ ...load, logs: load.logs.slice(0, 3) });
    expect(deductionShare(cleanTicket)).toBe(0);
  });

  it('averages over the kept logs only', () => {
    const ticket = scaleTicket(load);
    expect(averageLogSize(ticket)).toBeCloseTo(ticket.netBoardFeet / 3, 1);
  });

  it('lists the culls with their reasons', () => {
    const report = cullReport(scaleTicket(load));
    expect(report).toHaveLength(1);
    expect(report[0].logId).toBe('L-4');
    expect(report[0].reason).toBeTruthy();
  });
});

describe('the rule moves the whole ticket', () => {
  it('gives a different net total under each rule', () => {
    const totals = ['doyle', 'international', 'scribner'].map(
      (rule) => scaleTicket({ ...load, rule }).netBoardFeet
    );
    expect(new Set(totals).size).toBe(3);
  });

  it('can change which logs are culled', () => {
    const counts = ['doyle', 'international', 'scribner'].map(
      (rule) => scaleTicket({ ...load, rule }).culledCount
    );
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(1);
  });
});
