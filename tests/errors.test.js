import { describe, expect, it } from 'vitest';
import {
  BucklineError,
  ContractError,
  GradeError,
  ScaleError,
  ValidationError,
  formatError,
  isBucklineError,
} from '../src/errors.js';

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
