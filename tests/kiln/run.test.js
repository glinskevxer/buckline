import { describe, expect, it } from 'vitest';
import { KilnError } from '../../src/kiln/schedule.js';
import { buildCharge, schedulePiles } from '../../src/kiln/charge.js';
import { record, replay, runState, runTiming, startRun } from '../../src/kiln/run.js';

const pile = schedulePiles([
  { unitId: 'U-1', species: 'yellow poplar', quarters: 4, boardFeet: 18000 },
  { unitId: 'U-2', species: 'yellow poplar', quarters: 4, boardFeet: 18000 },
])[0];

const charge = buildCharge(pile, { capacityBoardFeet: 40000, kilnId: 'K-1' });

function reading(at, wettest) {
  return { at, samples: [wettest, wettest - 3, wettest - 5] };
}

describe('startRun', () => {
  it('starts on the step the moisture falls in', () => {
    const run = startRun(charge, { startedAt: '2024-12-01T06:00:00Z' });
    expect(run.stepIndex).toBe(0);
    expect(run.schedule).toBe('T4-C2');
  });

  it('carries the kiln and the footage', () => {
    const run = startRun(charge, { startedAt: '2024-12-01T06:00:00Z' });
    expect(run.kilnId).toBe('K-1');
    expect(run.boardFeet).toBe(36000);
  });

  it('refuses a run with no start time', () => {
    expect(() => startRun(charge, {})).toThrow(KilnError);
  });

  it('refuses a charge that is not runnable', () => {
    const thin = buildCharge(pile, { capacityBoardFeet: 200000 });
    expect(() => startRun(thin, { startedAt: '2024-12-01T06:00:00Z' })).toThrow(KilnError);
  });

  it('refuses a starting moisture off the schedule', () => {
    expect(() =>
      startRun(charge, { startedAt: '2024-12-01T06:00:00Z', startMoisturePct: 4 })
    ).toThrow(KilnError);
  });
});

describe('record', () => {
  const run = startRun(charge, { startedAt: '2024-12-01T06:00:00Z' });

  it('records the reading without advancing when the wood is still wet', () => {
    const next = record(run, reading('2024-12-02T06:00:00Z', 58));
    expect(next.readings).toHaveLength(1);
    expect(next.stepIndex).toBe(0);
    expect(next.advances).toEqual([]);
  });

  it('advances when the wettest sample reaches the bottom of the step', () => {
    const next = record(run, reading('2024-12-03T06:00:00Z', 50));
    expect(next.stepIndex).toBe(1);
    expect(next.advances).toHaveLength(1);
  });

  it('skips several steps at once when the reading jumps', () => {
    const next = record(run, reading('2024-12-03T06:00:00Z', 30));
    expect(next.stepIndex).toBeGreaterThan(2);
    expect(next.advances.length).toBeGreaterThan(2);
  });

  it('takes the wettest sample, not the average', () => {
    const next = record(run, { at: '2024-12-03T06:00:00Z', samples: [50, 20, 20] });
    expect(next.moisturePct).toBe(50);
  });

  it('records a reading that went the wrong way rather than dropping it', () => {
    const dropped = record(run, reading('2024-12-02T06:00:00Z', 50));
    const back = record(dropped, reading('2024-12-03T06:00:00Z', 55));
    expect(back.readings).toHaveLength(2);
    expect(back.moisturePct).toBe(55);
    expect(back.stepIndex).toBe(1);
  });

  it('finishes the run when the wood reaches the end of the schedule', () => {
    const next = record(run, reading('2024-12-10T06:00:00Z', 6));
    expect(next.finishedAt).toBe('2024-12-10T06:00:00Z');
  });

  it('refuses a reading after the run finished', () => {
    const done = record(run, reading('2024-12-10T06:00:00Z', 6));
    expect(() => record(done, reading('2024-12-11T06:00:00Z', 6))).toThrow(KilnError);
  });

  it('refuses a reading with no time on it', () => {
    expect(() => record(run, { samples: [50] })).toThrow(KilnError);
  });

  it('never edits the run it was given', () => {
    record(run, reading('2024-12-02T06:00:00Z', 40));
    expect(run.readings).toHaveLength(0);
  });
});

describe('replay', () => {
  const run = startRun(charge, { startedAt: '2024-12-01T06:00:00Z' });
  const readings = [
    reading('2024-12-02T06:00:00Z', 55),
    reading('2024-12-04T06:00:00Z', 45),
    reading('2024-12-06T06:00:00Z', 32),
    reading('2024-12-09T06:00:00Z', 18),
    reading('2024-12-12T06:00:00Z', 7),
  ];

  it('runs the whole list through', () => {
    const done = replay(run, readings);
    expect(done.readings).toHaveLength(5);
    expect(done.finishedAt).toBe('2024-12-12T06:00:00Z');
  });

  it('stops taking readings once the run finished', () => {
    const done = replay(run, [...readings, reading('2024-12-13T06:00:00Z', 6)]);
    expect(done.readings).toHaveLength(5);
  });
});

describe('runTiming', () => {
  const run = replay(startRun(charge, { startedAt: '2024-12-01T06:00:00Z' }), [
    reading('2024-12-02T06:00:00Z', 55),
    reading('2024-12-04T06:00:00Z', 45),
    reading('2024-12-12T06:00:00Z', 7),
  ]);

  it('measures the whole run', () => {
    expect(runTiming(run).days).toBe(11);
  });

  it('measures each step', () => {
    expect(runTiming(run).steps.length).toBeGreaterThan(0);
    expect(runTiming(run).steps[0].hours).toBeGreaterThan(0);
  });

  it('records the moisture each step was left at', () => {
    expect(runTiming(run).steps[0].leftAtMoisturePct).toBe(45);
  });

  it('works out the average drop per day', () => {
    expect(runTiming(run).averageDropPerDay).toBeGreaterThan(0);
  });

  it('reports nothing for a run with no readings', () => {
    const fresh = startRun(charge, { startedAt: '2024-12-01T06:00:00Z' });
    expect(runTiming(fresh).hours).toBe(0);
  });
});

describe('runState', () => {
  it('says where an unfinished run has got to', () => {
    const run = record(
      startRun(charge, { startedAt: '2024-12-01T06:00:00Z' }),
      reading('2024-12-04T06:00:00Z', 45)
    );
    const state = runState(run);
    expect(state.finished).toBe(false);
    expect(state.stepsRemaining).toBeGreaterThan(0);
    expect(state.dryBulbF).toBeGreaterThan(0);
  });

  it('says a finished run is finished', () => {
    const run = record(
      startRun(charge, { startedAt: '2024-12-01T06:00:00Z' }),
      reading('2024-12-12T06:00:00Z', 6)
    );
    expect(runState(run).finished).toBe(true);
  });

  it('gets hotter as the run goes on', () => {
    const early = runState(
      record(
        startRun(charge, { startedAt: '2024-12-01T06:00:00Z' }),
        reading('2024-12-02T06:00:00Z', 55)
      )
    );
    const late = runState(
      record(
        startRun(charge, { startedAt: '2024-12-01T06:00:00Z' }),
        reading('2024-12-09T06:00:00Z', 22)
      )
    );
    expect(late.dryBulbF).toBeGreaterThan(early.dryBulbF);
  });
});
