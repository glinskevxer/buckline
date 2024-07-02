import { describe, expect, it } from 'vitest';
import {
  defectIds,
  defectKinds,
  defectType,
  defectsOfKind,
  isSound,
  isVisible,
} from '../../../src/scale/defect/types.js';

describe('defectType', () => {
  it('looks up a defect written loosely', () => {
    expect(defectType('  Heart   Rot ').id).toBe('heart rot');
  });

  it('returns null for something not in the catalogue', () => {
    expect(defectType('woodpecker damage')).toBeNull();
    expect(defectType(null)).toBeNull();
    expect(defectType(7)).toBeNull();
  });

  it('does not resolve an inherited property name', () => {
    expect(defectType('constructor')).toBeNull();
  });

  it('hands back a copy so the catalogue cannot be edited through it', () => {
    const entry = defectType('sweep');
    entry.sound = false;
    expect(defectType('sweep').sound).toBe(true);
  });
});

describe('the catalogue itself', () => {
  it('keys every entry by its own id', () => {
    for (const id of defectIds()) {
      expect(defectType(id).id).toBe(id);
    }
  });

  it('gives every entry a known extent', () => {
    const allowed = ['whole log', 'local', 'interior', 'shell'];
    for (const id of defectIds()) {
      expect(allowed).toContain(defectType(id).extent);
    }
  });

  it('gives every entry a deduction preference', () => {
    const allowed = ['length', 'diameter', 'squared', 'percentage', 'none'];
    for (const id of defectIds()) {
      expect(allowed).toContain(defectType(id).prefers);
    }
  });

  it('never asks to square out a fault that spoils the whole log', () => {
    for (const id of defectIds()) {
      const entry = defectType(id);
      if (entry.extent === 'whole log') {
        expect(entry.prefers).not.toBe('squared');
      }
    }
  });

  it('never calls a decay defect sound', () => {
    for (const id of defectsOfKind('decay')) {
      expect(isSound(id)).toBe(false);
    }
  });
});

describe('soundness and visibility', () => {
  it('calls sweep sound and heart rot not', () => {
    expect(isSound('sweep')).toBe(true);
    expect(isSound('heart rot')).toBe(false);
  });

  it('answers false for a defect it does not know', () => {
    expect(isSound('gremlins')).toBe(false);
    expect(isVisible('gremlins')).toBe(false);
  });

  it('hides the faults that only show up on the saw', () => {
    expect(isVisible('heart rot')).toBe(false);
    expect(isVisible('ring shake')).toBe(false);
    expect(isVisible('metal in log')).toBe(false);
    expect(isVisible('catface')).toBe(true);
  });
});

describe('kinds', () => {
  it('lists the kinds it uses', () => {
    expect(defectKinds()).toEqual(['decay', 'foreign', 'form', 'knot', 'separation', 'wound']);
  });

  it('partitions the catalogue', () => {
    const counted = defectKinds().reduce((sum, kind) => sum + defectsOfKind(kind).length, 0);
    expect(counted).toBe(defectIds().length);
  });

  it('returns nothing for a kind nobody uses', () => {
    expect(defectsOfKind('lightning')).toEqual([]);
  });
});
