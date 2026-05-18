import { describe, expect, it } from 'vitest';

import { checkSourcing } from './sourcing-check.js';

describe('checkSourcing', () => {
  it('OK : sous le seuil, sourcing non requis', () => {
    expect(
      checkSourcing({
        amountInGroupCurrency: 500_000,
        threeOffersThreshold: 1_000_000,
        hasApprovedOfferComparison: false,
        hasApprovedSoleSourceJustification: false,
      }),
    ).toEqual({ ok: true });
  });

  it('OK : seuil null (= pas de regle 3 offres en vigueur)', () => {
    expect(
      checkSourcing({
        amountInGroupCurrency: 100_000_000,
        threeOffersThreshold: null,
        hasApprovedOfferComparison: false,
        hasApprovedSoleSourceJustification: false,
      }),
    ).toEqual({ ok: true });
  });

  it('OK : au-dessus du seuil avec comparatif approuve', () => {
    expect(
      checkSourcing({
        amountInGroupCurrency: 5_000_000,
        threeOffersThreshold: 1_000_000,
        hasApprovedOfferComparison: true,
        hasApprovedSoleSourceJustification: false,
      }),
    ).toEqual({ ok: true });
  });

  it('OK : au-dessus du seuil avec justification offre unique', () => {
    expect(
      checkSourcing({
        amountInGroupCurrency: 5_000_000,
        threeOffersThreshold: 1_000_000,
        hasApprovedOfferComparison: false,
        hasApprovedSoleSourceJustification: true,
      }),
    ).toEqual({ ok: true });
  });

  it('KO : au-dessus du seuil sans sourcing', () => {
    const r = checkSourcing({
      amountInGroupCurrency: 5_000_000,
      threeOffersThreshold: 1_000_000,
      hasApprovedOfferComparison: false,
      hasApprovedSoleSourceJustification: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('1000000');
      expect(r.reason).toContain('comparatif');
    }
  });

  it('KO message mentionne explicitement le cadre §6', () => {
    const r = checkSourcing({
      amountInGroupCurrency: 2_000_000,
      threeOffersThreshold: 1_000_000,
      hasApprovedOfferComparison: false,
      hasApprovedSoleSourceJustification: false,
    });
    if (!r.ok) expect(r.reason).toMatch(/§6/);
  });

  it('limite exacte (montant == seuil) : pas de sourcing requis', () => {
    // "au-dessus" strict, donc egalite passe
    expect(
      checkSourcing({
        amountInGroupCurrency: 1_000_000,
        threeOffersThreshold: 1_000_000,
        hasApprovedOfferComparison: false,
        hasApprovedSoleSourceJustification: false,
      }),
    ).toEqual({ ok: true });
  });
});
