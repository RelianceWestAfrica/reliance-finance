import { describe, expect, it } from 'vitest';

import { canonicalJson, computeHash } from './hash.js';

describe('canonicalJson', () => {
  it('serialise les primitives standardement', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('hello')).toBe('"hello"');
    expect(canonicalJson(true)).toBe('true');
  });

  it('trie les cles d\'objet pour produire une serialisation deterministe', () => {
    const a = canonicalJson({ b: 1, a: 2, c: 3 });
    const b = canonicalJson({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it('tri recursif sur les objets imbriques', () => {
    const result = canonicalJson({ outer: { z: 1, a: 2 }, top: 'x' });
    expect(result).toBe('{"outer":{"a":2,"z":1},"top":"x"}');
  });

  it('preserve l\'ordre des elements d\'array', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('serialise les arrays d\'objets en triant les cles de chaque element', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, { c: 3 }])).toBe('[{"a":2,"b":1},{"c":3}]');
  });
});

describe('computeHash', () => {
  const fixedDate = new Date('2026-05-18T12:00:00.000Z');

  it('produit un hash hex sha256 (64 chars)', () => {
    const hash = computeHash({
      prevHash: null,
      action: 'auth.login.success',
      payload: { userId: 'u1' },
      actorId: 'u1',
      createdAt: fixedDate,
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est deterministe pour les memes entrees', () => {
    const input = {
      prevHash: null,
      action: 'test',
      payload: { a: 1 },
      actorId: 'u1',
      createdAt: fixedDate,
    };
    expect(computeHash(input)).toBe(computeHash(input));
  });

  it('insensible a l\'ordre des cles du payload', () => {
    const h1 = computeHash({
      prevHash: null,
      action: 'test',
      payload: { b: 2, a: 1 },
      actorId: 'u1',
      createdAt: fixedDate,
    });
    const h2 = computeHash({
      prevHash: null,
      action: 'test',
      payload: { a: 1, b: 2 },
      actorId: 'u1',
      createdAt: fixedDate,
    });
    expect(h1).toBe(h2);
  });

  it('change si le prevHash change', () => {
    const base = {
      action: 'test',
      payload: { a: 1 },
      actorId: 'u1',
      createdAt: fixedDate,
    };
    expect(computeHash({ ...base, prevHash: null })).not.toBe(
      computeHash({ ...base, prevHash: 'abc' }),
    );
  });

  it('change si l\'action change', () => {
    const base = {
      prevHash: null,
      payload: { a: 1 },
      actorId: 'u1',
      createdAt: fixedDate,
    };
    expect(computeHash({ ...base, action: 'a' })).not.toBe(
      computeHash({ ...base, action: 'b' }),
    );
  });

  it('change si le payload change (sensibilite aux modifications)', () => {
    const base = {
      prevHash: null,
      action: 'test',
      actorId: 'u1',
      createdAt: fixedDate,
    };
    expect(computeHash({ ...base, payload: { a: 1 } })).not.toBe(
      computeHash({ ...base, payload: { a: 2 } }),
    );
  });

  it('change si actorId change (null vs concret)', () => {
    const base = {
      prevHash: null,
      action: 'test',
      payload: { a: 1 },
      createdAt: fixedDate,
    };
    expect(computeHash({ ...base, actorId: null })).not.toBe(
      computeHash({ ...base, actorId: 'u1' }),
    );
  });

  it('change si createdAt change', () => {
    const base = {
      prevHash: null,
      action: 'test',
      payload: { a: 1 },
      actorId: 'u1',
    };
    expect(computeHash({ ...base, createdAt: fixedDate })).not.toBe(
      computeHash({ ...base, createdAt: new Date('2026-05-18T12:00:01.000Z') }),
    );
  });

  it('previent la collision actorId vs payload via separateur', () => {
    const base = { prevHash: null, action: 'a', createdAt: fixedDate };
    // Deux entrees ou le concatene actorId+payload serait identique sans separateur.
    const h1 = computeHash({ ...base, payload: 'bcd', actorId: 'a' });
    const h2 = computeHash({ ...base, payload: 'cd', actorId: 'ab' });
    expect(h1).not.toBe(h2);
  });
});
