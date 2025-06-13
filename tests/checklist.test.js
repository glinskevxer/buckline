import { describe, expect, it } from 'vitest';
import { checklist, checklistOf } from '../src/checklist.js';

describe('checklist', () => {
  it('is ok when nothing was recorded', () => {
    const list = checklist();
    expect(list.ok).toBe(true);
    expect(list.reasons).toEqual([]);
  });

  it('records a reason when a condition does not hold', () => {
    const list = checklist().require(false, 'too narrow');
    expect(list.ok).toBe(false);
    expect(list.reasons).toEqual(['too narrow']);
  });

  it('records nothing when a condition holds', () => {
    expect(checklist().require(true, 'too narrow').ok).toBe(true);
  });

  it('never stops at the first reason', () => {
    const list = checklist().require(false, 'one').require(false, 'two').require(false, 'three');
    expect(list.count).toBe(3);
    expect(list.reasons).toEqual(['one', 'two', 'three']);
  });

  it('records a reason unconditionally', () => {
    expect(checklist().add('because').reasons).toEqual(['because']);
  });

  it('ignores an empty reason', () => {
    expect(checklist().add('').reasons).toEqual([]);
    expect(checklist().add(null).ok).toBe(true);
  });

  it('records a whole list at once', () => {
    expect(checklist().addAll(['a', 'b']).count).toBe(2);
    expect(checklist().addAll(undefined).ok).toBe(true);
  });

  it('joins the reasons for a message', () => {
    expect(checklist().add('a').add('b').joined()).toBe('a; b');
    expect(checklist().add('a').add('b').joined(', ')).toBe('a, b');
  });

  it('hands back a copy of the reasons', () => {
    const list = checklist().add('a');
    list.reasons.push('b');
    expect(list.count).toBe(1);
  });

  it('names the verdict field whatever the caller wants', () => {
    expect(checklist().verdict('admissible')).toEqual({ admissible: true, reasons: [] });
    expect(checklist().add('no').verdict('meets').meets).toBe(false);
  });

  it('carries extra fields through the verdict', () => {
    expect(checklist().verdict('ok', { grade: 'FAS' }).grade).toBe('FAS');
  });
});

describe('checklistOf', () => {
  it('starts with reasons already on it', () => {
    expect(checklistOf(['a', 'b']).count).toBe(2);
  });

  it('starts clean on an empty list', () => {
    expect(checklistOf([]).ok).toBe(true);
  });
});
