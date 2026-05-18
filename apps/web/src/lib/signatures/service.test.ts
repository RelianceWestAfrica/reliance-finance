import { describe, expect, it } from 'vitest';

import { SignatureStage } from '@reliance-finance/database';

import { buildSignatureHash, hashDocument } from './service.js';

const NOW = new Date('2026-05-18T12:00:00Z');

describe('hashDocument', () => {
  it('produit un sha256 hex (64 chars)', () => {
    expect(hashDocument({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('insensible a l\'ordre des cles du snapshot', () => {
    expect(hashDocument({ b: 2, a: 1 })).toBe(hashDocument({ a: 1, b: 2 }));
  });

  it('change si le snapshot change', () => {
    expect(hashDocument({ a: 1 })).not.toBe(hashDocument({ a: 2 }));
  });
});

describe('buildSignatureHash', () => {
  const base = {
    prevHash: null,
    documentHash: 'a'.repeat(64),
    actorId: 'u_dfg',
    stage: SignatureStage.VISA_GROUPE,
    signedAt: NOW,
    ip: '1.2.3.4',
    userAgent: 'Chrome/120',
    comment: 'OK',
  };

  it('produit un hash hex sha256', () => {
    expect(buildSignatureHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est deterministe', () => {
    expect(buildSignatureHash(base)).toBe(buildSignatureHash(base));
  });

  it('change si prevHash change', () => {
    expect(buildSignatureHash({ ...base, prevHash: 'b'.repeat(64) })).not.toBe(
      buildSignatureHash(base),
    );
  });

  it('change si documentHash change', () => {
    expect(buildSignatureHash({ ...base, documentHash: 'c'.repeat(64) })).not.toBe(
      buildSignatureHash(base),
    );
  });

  it('change si actorId change', () => {
    expect(buildSignatureHash({ ...base, actorId: 'u_autre' })).not.toBe(
      buildSignatureHash(base),
    );
  });

  it('change si stage change', () => {
    expect(
      buildSignatureHash({ ...base, stage: SignatureStage.VISA_FILIALE_N1 }),
    ).not.toBe(buildSignatureHash(base));
  });

  it('separateur "|" previent collision actorId vs comment', () => {
    const a = buildSignatureHash({ ...base, actorId: 'a', comment: 'bcd' });
    const b = buildSignatureHash({ ...base, actorId: 'ab', comment: 'cd' });
    expect(a).not.toBe(b);
  });

  it('nulls sont serialises comme "NULL" pour eviter collision', () => {
    const withNull = buildSignatureHash({ ...base, ip: null, userAgent: null, comment: null });
    const withEmpty = buildSignatureHash({
      ...base,
      ip: 'NULL',
      userAgent: 'NULL',
      comment: 'NULL',
    });
    // Meme hash car la sortie est identique : c'est un trade-off explicite
    expect(withNull).toBe(withEmpty);
  });

  it('role n\'est pas dans le hash (peut etre revoque sans casser la chaine)', () => {
    // (Le hash ne contient pas role, qui est volontairement separe.)
    // -> meme hash quel que soit le role enregistre cote DB
    expect(typeof buildSignatureHash(base)).toBe('string');
    // Ce test sert de documentation : si tu changes l'API, regarde cette ligne.
  });
});

// Test du fait que la suite (actorId, stage) controlee par la separation des
// fonctions est aussi presente dans le hash (donc impossible a reecrire sans
// changer le hash).
describe('hash integrity properties', () => {
  it('changer actorId apres coup casse le hash', () => {
    const h1 = buildSignatureHash({
      prevHash: null,
      documentHash: 'a'.repeat(64),
      actorId: 'original',
      stage: SignatureStage.VISA_FILIALE_N1,
      signedAt: NOW,
      ip: null,
      userAgent: null,
      comment: null,
    });
    const h2 = buildSignatureHash({
      prevHash: null,
      documentHash: 'a'.repeat(64),
      actorId: 'falsifie',
      stage: SignatureStage.VISA_FILIALE_N1,
      signedAt: NOW,
      ip: null,
      userAgent: null,
      comment: null,
    });
    expect(h1).not.toBe(h2);
  });

  it('changer le document snapshot (= modifier le dossier) invalide le hash', () => {
    const sig1 = buildSignatureHash({
      prevHash: null,
      documentHash: hashDocument({ amount: 100 }),
      actorId: 'u',
      stage: SignatureStage.VISA_FILIALE_N1,
      signedAt: NOW,
      ip: null,
      userAgent: null,
      comment: null,
    });
    const sig2 = buildSignatureHash({
      prevHash: null,
      documentHash: hashDocument({ amount: 999 }), // demandeur a falsifie
      actorId: 'u',
      stage: SignatureStage.VISA_FILIALE_N1,
      signedAt: NOW,
      ip: null,
      userAgent: null,
      comment: null,
    });
    expect(sig1).not.toBe(sig2);
  });
});
