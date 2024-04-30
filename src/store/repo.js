/**
 * The yard book.
 *
 * One journal, a handful of projections over it, and the domain operations
 * that write to it. Nothing else in the program touches the journal directly,
 * so there is one place where an operation becomes an entry and one place
 * where an entry becomes an answer.
 *
 * Writes go in as whole commands. Scaling a load writes the ticket and every
 * line of it in a single append, because a ticket with half its lines is not a
 * ticket and no reader should ever see one.
 */

import { BucklineError } from '../errors.js';
import { openJournal } from './journal.js';
import { keyedProjection, Projection } from './projection.js';
import { makeTract, measurementOptions, scalingOptions } from '../model/tract.js';
import { makeLoad } from '../model/load.js';
import { scaleTicket } from '../scale/ticket.js';

export class RepoError extends BucklineError {
  constructor(message, options = {}) {
    super(message, { code: 'REPO', ...options });
    this.name = 'RepoError';
  }
}

export class Yard {
  constructor(path, options = {}) {
    this.journal = openJournal(path, options);
    this.tracts = keyedProjection('tracts', ['tract.saved']);
    this.loads = keyedProjection('loads', ['load.received'], { keyOf: (entry) => entry.loadId });
    this.tickets = keyedProjection('tickets', ['load.scaled'], {
      keyOf: (entry) => entry.loadId,
      recordOf: (entry) => entry.ticket,
    });
    this.projections = [this.tracts, this.loads, this.tickets, this.buildRunningTotals()];
    this.refresh();
  }

  buildRunningTotals() {
    this.totals = new Projection(
      'totals',
      {
        'load.scaled': (state, entry) => {
          const tract = entry.ticket.tractId ?? 'unknown';
          const bucket = state.get(tract) ?? { loads: 0, grossBoardFeet: 0, netBoardFeet: 0 };
          bucket.loads += 1;
          bucket.grossBoardFeet += entry.ticket.grossBoardFeet;
          bucket.netBoardFeet += entry.ticket.netBoardFeet;
          return state.set(tract, bucket);
        },
      },
      {}
    );
    return this.totals;
  }

  /** Brings every projection up to the end of the journal. */
  refresh() {
    for (const projection of this.projections) {
      projection.refresh(this.journal);
    }
    return this;
  }

  /** Writes a tract and its contract. */
  saveTract(raw, options = {}) {
    const tract = makeTract(raw);
    this.journal.append([{ kind: 'tract.saved', id: tract.id, record: tract }], options);
    this.refresh();
    return tract;
  }

  getTract(id) {
    const tract = this.tracts.state.get(id);
    if (!tract) {
      throw new RepoError(`no tract ${id} in the yard book`, { path: 'tractId' });
    }
    return tract;
  }

  listTracts() {
    return [...this.tracts.state.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Records a load arriving, reading its logs under the tract's conventions. */
  receiveLoad(raw, options = {}) {
    const tract = this.getTract(raw.tractId);
    const load = makeLoad(raw, measurementOptions(tract));
    if (this.loads.state.has(load.id)) {
      throw new RepoError(`load ${load.id} has already been received`, { path: 'loadId' });
    }
    this.journal.append([{ kind: 'load.received', loadId: load.id, record: load }], options);
    this.refresh();
    return load;
  }

  getLoad(id) {
    const load = this.loads.state.get(id);
    if (!load) {
      throw new RepoError(`no load ${id} in the yard book`, { path: 'loadId' });
    }
    return load;
  }

  /**
   * Scales a load under its tract's contract and writes the ticket. Scaling
   * twice is refused: a rescale is a different operation with its own reason.
   */
  scaleLoad(loadId, options = {}) {
    const load = this.getLoad(loadId);
    const tract = this.getTract(load.tractId);
    if (this.tickets.state.has(loadId)) {
      throw new RepoError(`load ${loadId} has already been scaled`, { path: 'loadId' });
    }

    const ticket = scaleTicket(
      {
        ticketId: `S-${this.journal.sequence + 1}`,
        loadId: load.id,
        tractId: load.tractId,
        scaledBy: load.scaledBy ?? null,
        rule: tract.contract.rule,
        logs: load.logs,
      },
      scalingOptions(tract)
    );

    this.journal.append([{ kind: 'load.scaled', loadId, ticket }], options);
    this.refresh();
    return ticket;
  }

  getTicket(loadId) {
    const ticket = this.tickets.state.get(loadId);
    if (!ticket) {
      throw new RepoError(`load ${loadId} has not been scaled`, { path: 'loadId' });
    }
    return ticket;
  }

  /** Running totals by tract, biggest first. */
  tractTotals() {
    return [...this.totals.state.entries()]
      .map(([tractId, bucket]) => ({ tractId, ...bucket }))
      .sort((a, b) => b.netBoardFeet - a.netBoardFeet);
  }

  /** What each projection has folded in, for a health check. */
  status() {
    return {
      entries: this.journal.length,
      sequence: this.journal.sequence,
      projections: this.projections.map((projection) => projection.status()),
    };
  }
}

/** Opens a yard book at a path. */
export function openYard(path, options = {}) {
  return new Yard(path, options);
}
