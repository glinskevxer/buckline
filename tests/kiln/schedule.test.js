import { describe, expect, it } from 'vitest';
import {
  KilnError,
  equilibriumMc,
  gradient,
  schedule,
  scheduleFor,
  scheduleIds,
  stepAt,
} from '../../src/kiln/schedule.js';

describe('schedule', () => {
  it('finds a schedule by name', () => {
    expect(schedule('T4-C2').label).toBe('standard hardwood');
  });

  it('refuses a schedule nobody runs', () => {
    expect(() => schedule('T99')).toThrow(KilnError);
  });

  it('lists the schedules mildest first', () => {
    expect(scheduleIds()).toEqual(['T2-C1', 'T4-C2', 'T8-D4']);
  });

  it('gets hotter and drier as every schedule runs down', () => {
    for (const id of scheduleIds()) {
      const steps = schedule(id).steps;
      for (let i = 1; i < steps.length; i += 1) {
        expect(steps[i].dryBulbF).toBeGreaterThanOrEqual(steps[i - 1].dryBulbF);
        expect(steps[i].depressionF).toBeGreaterThan(steps[i - 1].depressionF);
      }
    }
  });

  it('covers a continuous moisture range in every schedule', () => {
    for (const id of scheduleIds()) {
      const steps = schedule(id).steps;
      for (let i = 1; i < steps.length; i += 1) {
        expect(steps[i].fromMc).toBe(steps[i - 1].toMc);
      }
    }
  });
});

describe('scheduleFor', () => {
  it('sends thin light hardwood to the standard schedule', () => {
    const result = scheduleFor('yellow poplar', 1);
    expect(result.schedule.id).toBe('T4-C2');
  });

  it('sends a dense hardwood to the mild schedule at the same thickness', () => {
    expect(scheduleFor('white oak', 1).schedule.id).toBe('T2-C1');
  });

  it('sends thick light hardwood to the mild schedule too', () => {
    expect(scheduleFor('yellow poplar', 2).schedule.id).toBe('T2-C1');
  });

  it('says which of the two reasons applied', () => {
    expect(scheduleFor('white oak', 1).because).toContain('dense');
    expect(scheduleFor('yellow poplar', 2).because).toContain('thick');
    expect(scheduleFor('white oak', 2).because).toContain('and');
  });

  it('sends every softwood to the fast schedule whatever the thickness', () => {
    for (const thickness of [1, 1.5, 2, 3]) {
      expect(scheduleFor('loblolly pine', thickness).schedule.id).toBe('T8-D4');
    }
  });

  it('refuses a charge with no thickness', () => {
    expect(() => scheduleFor('red oak', 0)).toThrow(KilnError);
  });

  it('refuses a species nobody buys', () => {
    expect(() => scheduleFor('teak', 1)).toThrow();
  });
});

describe('stepAt', () => {
  it('finds the first step on green wood', () => {
    expect(stepAt('T4-C2', 80).index).toBe(0);
  });

  it('moves down the steps as the wood dries', () => {
    expect(stepAt('T4-C2', 45).index).toBe(1);
    expect(stepAt('T4-C2', 32).index).toBe(3);
  });

  it('returns nothing once the charge is dry', () => {
    expect(stepAt('T4-C2', 6)).toBeNull();
  });

  it('returns nothing for wood wetter than the schedule starts at', () => {
    expect(stepAt('T4-C2', 140)).toBeNull();
  });

  it('puts a boundary reading on the step above it', () => {
    expect(stepAt('T4-C2', 40).index).toBe(1);
  });
});

describe('equilibriumMc', () => {
  it('falls as the depression widens', () => {
    expect(equilibriumMc(120, 30)).toBeLessThan(equilibriumMc(120, 10));
  });

  it('falls as the kiln gets hotter at the same depression', () => {
    expect(equilibriumMc(180, 20)).toBeLessThan(equilibriumMc(110, 20));
  });

  it('never goes below the floor', () => {
    expect(equilibriumMc(200, 90)).toBe(1.5);
  });

  it('refuses a negative depression', () => {
    expect(() => equilibriumMc(120, -1)).toThrow(KilnError);
  });
});

describe('gradient', () => {
  it('holds the gradient down while the wood is green and lets it steepen later', () => {
    const green = gradient('T2-C1', 80);
    const dry = gradient('T2-C1', 18);
    expect(green.gradient).toBeLessThan(dry.gradient);
  });

  it('is gentler at every step on the mild schedule than the fast one', () => {
    expect(gradient('T2-C1', 60).gradient).toBeLessThan(gradient('T8-D4', 60).gradient);
  });

  it('reports nothing once the charge is off the schedule', () => {
    expect(gradient('T4-C2', 5)).toBeNull();
  });

  it('names the step it read', () => {
    expect(gradient('T4-C2', 45).stepIndex).toBe(1);
  });
});
