import { describe, expect, it } from 'vitest';
import * as buckline from '../src/index.js';

describe('the public surface', () => {
  it('exports the error family', () => {
    expect(typeof buckline.BucklineError).toBe('function');
    expect(typeof buckline.formatError).toBe('function');
  });

  it('exports every log rule through one door', () => {
    expect(buckline.ruleIds()).toEqual(['doyle', 'international', 'scribner']);
  });

  it('scales a log end to end without reaching inside', () => {
    const log = buckline.makeLog({
      id: 'L-1',
      species: 'red oak',
      axesIn: [17.4, 17.4],
      measuredLengthFt: 16.25,
    });
    expect(buckline.grossScale(log, 'doyle').boardFeet).toBe(144);
    expect(buckline.netScale(log, 'doyle').netBoardFeet).toBe(144);
  });

  it('grades a log and a board through one door each', () => {
    const log = buckline.makeLog({
      id: 'L-1',
      species: 'black walnut',
      position: 'butt',
      axesIn: [24, 24],
      measuredLengthFt: 12.25,
    });
    expect(buckline.gradeLog(log).market).toBe('veneer');

    const board = buckline.makeBoard({
      id: 'B-1',
      species: 'red oak',
      thicknessIn: 1,
      widthIn: 8,
      lengthFt: 12,
    });
    expect(buckline.grade(board).grade).toBe('FAS');
  });

  it('exports the command line runner', () => {
    expect(typeof buckline.runCommandLine).toBe('function');
    expect(typeof buckline.VERSION).toBe('string');
  });

  it('does not export the internal helpers', () => {
    expect(buckline.searchCuttings).toBeUndefined();
    expect(buckline.summarize).toBeUndefined();
    expect(buckline.round3).toBeUndefined();
  });

  it('exports nothing twice under one name', () => {
    const names = Object.keys(buckline);
    expect(new Set(names).size).toBe(names.length);
  });

  it('exports something from every part of the program', () => {
    for (const name of [
      'makeLog',
      'scaleTicket',
      'gradeBoard',
      'buckStem',
      'saw',
      'scheduleFor',
      'makePriceList',
      'settle',
      'onDeck',
      'reconcile',
      'openYard',
    ]) {
      expect(typeof buckline[name]).toBe('function');
    }
  });
});
