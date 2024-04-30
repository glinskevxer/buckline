import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoError, Yard, openYard } from '../../src/store/repo.js';

const tract = {
  id: 'T-7',
  name: 'Culpeper 40',
  owner: 'E. Whitlock',
  contract: { rule: 'doyle' },
};

const load = {
  id: 'LD-19',
  tractId: 'T-7',
  truck: 'Peterbilt 379',
  scaledBy: 'D. Rakes',
  logs: [
    { id: 'L-1', species: 'red oak', axesIn: [17.4, 17.4], measuredLengthFt: 16.25 },
    { id: 'L-2', species: 'white oak', axesIn: [21.8, 21.8], measuredLengthFt: 12.25 },
  ],
};

let dir;
let path;
let yard;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buckline-'));
  path = join(dir, 'yard.jsonl');
  yard = openYard(path);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('tracts', () => {
  it('saves and reads back', () => {
    yard.saveTract(tract);
    expect(yard.getTract('T-7').name).toBe('Culpeper 40');
  });

  it('keeps the latest version of a tract', () => {
    yard.saveTract(tract);
    yard.saveTract({ ...tract, name: 'Culpeper 40 south' });
    expect(yard.getTract('T-7').name).toBe('Culpeper 40 south');
    expect(yard.listTracts()).toHaveLength(1);
  });

  it('complains about a tract nobody opened', () => {
    expect(() => yard.getTract('T-9')).toThrow(RepoError);
  });

  it('lists tracts by id', () => {
    yard.saveTract({ ...tract, id: 'T-9' });
    yard.saveTract(tract);
    expect(yard.listTracts().map((t) => t.id)).toEqual(['T-7', 'T-9']);
  });
});

describe('loads', () => {
  beforeEach(() => {
    yard.saveTract(tract);
  });

  it('receives a load and reads its logs', () => {
    const received = yard.receiveLoad(load);
    expect(received.logs).toHaveLength(2);
    expect(yard.getLoad('LD-19').truck).toBe('Peterbilt 379');
  });

  it('refuses a load for a tract that is not open', () => {
    expect(() => yard.receiveLoad({ ...load, tractId: 'T-9' })).toThrow(RepoError);
  });

  it('refuses the same load twice', () => {
    yard.receiveLoad(load);
    expect(() => yard.receiveLoad(load)).toThrow(RepoError);
  });

  it('reads the logs under the tract conventions', () => {
    yard.saveTract({ ...tract, id: 'T-8', contract: { rule: 'doyle', rounding: 'nearest' } });
    const received = yard.receiveLoad({ ...load, id: 'LD-20', tractId: 'T-8' });
    expect(received.logs[0].conventions.rounding).toBe('nearest');
  });
});

describe('scaling', () => {
  beforeEach(() => {
    yard.saveTract(tract);
    yard.receiveLoad(load);
  });

  it('scales under the tract contract', () => {
    const ticket = yard.scaleLoad('LD-19');
    expect(ticket.rule).toBe('doyle');
    expect(ticket.netBoardFeet).toBeGreaterThan(0);
  });

  it('stamps the ticket with the load and tract', () => {
    const ticket = yard.scaleLoad('LD-19');
    expect(ticket.loadId).toBe('LD-19');
    expect(ticket.tractId).toBe('T-7');
    expect(ticket.scaledBy).toBe('D. Rakes');
  });

  it('reads the ticket back', () => {
    const ticket = yard.scaleLoad('LD-19');
    expect(yard.getTicket('LD-19').ticketId).toBe(ticket.ticketId);
  });

  it('refuses to scale twice', () => {
    yard.scaleLoad('LD-19');
    expect(() => yard.scaleLoad('LD-19')).toThrow(RepoError);
  });

  it('refuses to scale a load nobody received', () => {
    expect(() => yard.scaleLoad('LD-99')).toThrow(RepoError);
  });

  it('complains about a ticket for an unscaled load', () => {
    expect(() => yard.getTicket('LD-19')).toThrow(RepoError);
  });

  it('writes the whole ticket in one append', () => {
    const before = yard.journal.length;
    yard.scaleLoad('LD-19');
    expect(yard.journal.length).toBe(before + 1);
  });
});

describe('persistence', () => {
  it('reads the whole book back off disk', () => {
    yard.saveTract(tract);
    yard.receiveLoad(load);
    const ticket = yard.scaleLoad('LD-19');

    const reopened = openYard(path);
    expect(reopened.getTract('T-7').owner).toBe('E. Whitlock');
    expect(reopened.getLoad('LD-19').driver).toBeUndefined();
    expect(reopened.getTicket('LD-19').netBoardFeet).toBe(ticket.netBoardFeet);
  });

  it('is a Yard', () => {
    expect(yard).toBeInstanceOf(Yard);
  });
});

describe('totals and status', () => {
  beforeEach(() => {
    yard.saveTract(tract);
    yard.receiveLoad(load);
    yard.scaleLoad('LD-19');
  });

  it('runs a total per tract', () => {
    const totals = yard.tractTotals();
    expect(totals).toHaveLength(1);
    expect(totals[0].tractId).toBe('T-7');
    expect(totals[0].loads).toBe(1);
  });

  it('adds a second load into the same tract total', () => {
    yard.receiveLoad({ ...load, id: 'LD-20' });
    yard.scaleLoad('LD-20');
    expect(yard.tractTotals()[0].loads).toBe(2);
  });

  it('reports how far each projection has read', () => {
    const status = yard.status();
    expect(status.entries).toBe(3);
    for (const projection of status.projections) {
      expect(projection.lastSeq).toBe(3);
    }
  });
});
