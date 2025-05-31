import { describe, expect, it } from 'vitest';
import {
  BucklineError,
  ContractError,
  GradeError,
  ScaleError,
  ValidationError,
  formatError,
  isBucklineError,
  withHint,
} from '../src/errors.js';
import { getRule } from '../src/scale/rules/index.js';
import { lookupSpecies } from '../src/model/species.js';
import { lumberSpec } from '../src/grade/lumber/spec.js';

describe('BucklineError', () => {
  it('carries a default code', () => {
    expect(new BucklineError('nope').code).toBe('BUCKLINE');
  });

  it('keeps the path and details it was given', () => {
    const error = new BucklineError('nope', { path: 'log.axes[0]', details: { seen: -1 } });
    expect(error.toJSON()).toEqual({
      name: 'BucklineError',
      code: 'BUCKLINE',
      message: 'nope',
      path: 'log.axes[0]',
      details: { seen: -1 },
      hint: null,
    });
  });

  it('records a cause when one is given', () => {
    const cause = new Error('disk');
    expect(new BucklineError('nope', { cause }).cause).toBe(cause);
  });
});

describe('subclasses', () => {
  it('each brings its own code and name', () => {
    expect(new ValidationError('a').code).toBe('VALIDATION');
    expect(new ScaleError('a').code).toBe('SCALE');
    expect(new GradeError('a').code).toBe('GRADE');
    expect(new ContractError('a').code).toBe('CONTRACT');
    expect(new ScaleError('a').name).toBe('ScaleError');
  });

  it('are all recognised as ours', () => {
    for (const error of [new ValidationError('a'), new ScaleError('a'), new GradeError('a')]) {
      expect(isBucklineError(error)).toBe(true);
    }
    expect(isBucklineError(new TypeError('a'))).toBe(false);
    expect(isBucklineError('a')).toBe(false);
  });

  it('serialises the issue list on a validation error', () => {
    const error = new ValidationError('bad', { issues: [{ path: 'a', message: 'is required' }] });
    expect(error.toJSON().issues).toHaveLength(1);
  });
});

describe('formatError', () => {
  it('puts the code and the path in front of the message', () => {
    expect(formatError(new ScaleError('no rule', { path: 'ticket.logs[2]' }))).toBe(
      'SCALE at ticket.logs[2]: no rule'
    );
  });

  it('omits the path when there is not one', () => {
    expect(formatError(new ScaleError('no rule'))).toBe('SCALE: no rule');
  });

  it('falls back for a foreign error', () => {
    expect(formatError(new TypeError('bad'))).toBe('TypeError: bad');
  });

  it('falls back for something that is not an error at all', () => {
    expect(formatError('plain')).toBe('plain');
  });
});

describe('hints', () => {
  it('carries a hint when one is given', () => {
    expect(new ScaleError('no rule', { hint: 'buckline rules' }).hint).toBe('buckline rules');
  });

  it('carries none by default', () => {
    expect(new ScaleError('no rule').hint).toBeNull();
  });

  it('prints the hint on its own line', () => {
    const error = new ScaleError('no rule', { path: 'rule', hint: 'buckline rules' });
    expect(formatError(error)).toBe('SCALE at rule: no rule\n  try: buckline rules');
  });

  it('prints one line when there is no hint', () => {
    expect(formatError(new ScaleError('no rule')).split('\n')).toHaveLength(1);
  });

  it('carries the hint into the json shape', () => {
    expect(new ScaleError('a', { hint: 'b' }).toJSON().hint).toBe('b');
  });

  it('adds a hint to an error that has none', () => {
    const error = withHint(new ScaleError('a'), 'do this');
    expect(error.hint).toBe('do this');
  });

  it('leaves a hint that is already there alone', () => {
    const error = withHint(new ScaleError('a', { hint: 'first' }), 'second');
    expect(error.hint).toBe('first');
  });

  it('leaves a foreign error alone', () => {
    const error = withHint(new TypeError('a'), 'do this');
    expect(error.hint).toBeUndefined();
  });
});

describe('the hints the yard actually sees', () => {
  it('points at the rules command when a rule is unknown', () => {
    let caught;
    try {
      getRule('cubic');
    } catch (error) {
      caught = error;
    }
    expect(formatError(caught)).toContain('try: buckline rules');
  });

  it('names some of the species when one is not on the register', () => {
    let caught;
    try {
      lookupSpecies('teak');
    } catch (error) {
      caught = error;
    }
    expect(caught.hint).toContain('the yard buys');
  });

  it('names the grades we grade when one is unknown', () => {
    let caught;
    try {
      lumberSpec('F5');
    } catch (error) {
      caught = error;
    }
    expect(caught.hint).toContain('FAS');
  });
});
