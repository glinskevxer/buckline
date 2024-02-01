import { describe, expect, it } from 'vitest';
import { ContractError } from '../../src/errors.js';
import {
  RULE_BOOKS,
  knownSpecies,
  lookupSpecies,
  normalizeSpecies,
  ruleBookFor,
  speciesInGroup,
  speciesKeys,
} from '../../src/model/species.js';

describe('normalizeSpecies', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeSpecies('  Red   Oak ')).toBe('red oak');
  });

  it('refuses a value that is not text', () => {
    expect(() => normalizeSpecies(42)).toThrow(ContractError);
  });
});

describe('lookupSpecies', () => {
  it('finds an entry written loosely', () => {
    expect(lookupSpecies('YELLOW  poplar').botanical).toBe('Liriodendron tulipifera');
  });

  it('carries the canonical key back with the entry', () => {
    expect(lookupSpecies('Hard Maple').key).toBe('hard maple');
  });

  it('throws for a species the yard does not buy', () => {
    expect(() => lookupSpecies('teak')).toThrow(ContractError);
  });

  it('does not resolve an inherited property name', () => {
    expect(() => lookupSpecies('constructor')).toThrow(ContractError);
  });

  it('returns a fresh object each call so callers cannot edit the register', () => {
    const first = lookupSpecies('ash');
    first.densityLbPerFt3 = 1;
    expect(lookupSpecies('ash').densityLbPerFt3).toBe(41);
  });
});

describe('knownSpecies', () => {
  it('answers without throwing', () => {
    expect(knownSpecies('beech')).toBe(true);
    expect(knownSpecies('teak')).toBe(false);
  });

  it('answers false rather than throwing on a non string', () => {
    expect(knownSpecies(null)).toBe(false);
  });
});

describe('groups', () => {
  it('puts every species in exactly one group with a rule book', () => {
    for (const key of speciesKeys()) {
      const entry = lookupSpecies(key);
      expect(Object.keys(RULE_BOOKS)).toContain(entry.group);
    }
  });

  it('sends hardwoods to nhla and softwoods to the structural book', () => {
    expect(ruleBookFor('red oak')).toBe('nhla');
    expect(ruleBookFor('loblolly pine')).toBe('structural');
  });

  it('partitions the register between the two groups', () => {
    const hardwood = speciesInGroup('hardwood');
    const softwood = speciesInGroup('softwood');
    expect(hardwood.length + softwood.length).toBe(speciesKeys().length);
    expect(hardwood.filter((k) => softwood.includes(k))).toEqual([]);
  });

  it('returns nothing for a group nobody defined', () => {
    expect(speciesInGroup('bamboo')).toEqual([]);
  });
});

describe('register contents', () => {
  it('shrinks more tangentially than radially in every species', () => {
    for (const key of speciesKeys()) {
      const entry = lookupSpecies(key);
      expect(entry.shrinkTangentialPct).toBeGreaterThan(entry.shrinkRadialPct);
    }
  });

  it('gives every species a plausible density', () => {
    for (const key of speciesKeys()) {
      const entry = lookupSpecies(key);
      expect(entry.densityLbPerFt3).toBeGreaterThan(20);
      expect(entry.densityLbPerFt3).toBeLessThan(70);
    }
  });

  it('counts mineral streak only in the maples', () => {
    const counted = speciesKeys().filter((k) => lookupSpecies(k).mineralStreakCounts);
    expect(counted.sort()).toEqual(['hard maple', 'soft maple']);
  });

  it('lists no softwood as a veneer candidate', () => {
    for (const key of speciesInGroup('softwood')) {
      expect(lookupSpecies(key).veneerCandidate).toBe(false);
    }
  });

  it('returns the keys sorted', () => {
    const keys = speciesKeys();
    expect(keys).toEqual(keys.slice().sort());
  });
});
