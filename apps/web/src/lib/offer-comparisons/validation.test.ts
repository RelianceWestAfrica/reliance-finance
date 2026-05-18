import { describe, expect, it } from 'vitest';

import { validateForSubmission, rankOffers } from './validation.js';

const OFFER_A = { id: 'A', supplierId: 's1', priceTtc: 1_000_000, technicallyCompliant: true };
const OFFER_B = { id: 'B', supplierId: 's2', priceTtc: 800_000, technicallyCompliant: true };
const OFFER_C = { id: 'C', supplierId: 's3', priceTtc: 700_000, technicallyCompliant: false };

describe('validateForSubmission', () => {
  it('OK : 2 offres + recommandation conforme + justif', () => {
    expect(
      validateForSubmission({
        offers: [OFFER_A, OFFER_B],
        recommendedOfferId: 'B',
        recommendationJustification:
          'Offre B retenue car meilleur rapport prix/delai et fournisseur connu',
      }),
    ).toEqual({ ok: true });
  });

  it('KO : moins de 2 offres', () => {
    const r = validateForSubmission({
      offers: [OFFER_A],
      recommendedOfferId: 'A',
      recommendationJustification:
        'Offre unique retenue car fournisseur exclusif sur cette technologie',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations[0]).toMatch(/2 offres/i);
  });

  it('KO : offre avec prix nul', () => {
    const r = validateForSubmission({
      offers: [OFFER_A, { ...OFFER_B, priceTtc: 0 }],
      recommendedOfferId: 'A',
      recommendationJustification:
        'Offre A retenue car la concurrence est sans prix valide pour comparer',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes('prix TTC'))).toBe(true);
  });

  it('KO : aucune recommandation', () => {
    const r = validateForSubmission({
      offers: [OFFER_A, OFFER_B],
      recommendedOfferId: null,
      recommendationJustification: 'Test justification suffisamment longue pour passer',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes('recommandee'))).toBe(true);
  });

  it('KO : recommandation pointe sur offre absente', () => {
    const r = validateForSubmission({
      offers: [OFFER_A, OFFER_B],
      recommendedOfferId: 'NONEXISTENT',
      recommendationJustification: 'Test justification suffisamment longue pour passer',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes('absente'))).toBe(true);
  });

  it('KO : recommandation non techniquement conforme', () => {
    const r = validateForSubmission({
      offers: [OFFER_A, OFFER_C],
      recommendedOfferId: 'C',
      recommendationJustification: 'Test justification suffisamment longue pour passer',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes('techniquement'))).toBe(true);
  });

  it('KO : justification trop courte', () => {
    const r = validateForSubmission({
      offers: [OFFER_A, OFFER_B],
      recommendedOfferId: 'A',
      recommendationJustification: 'court',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes('Justification'))).toBe(true);
  });

  it('cumulatif : 2 violations en parallele', () => {
    const r = validateForSubmission({
      offers: [OFFER_A],
      recommendedOfferId: null,
      recommendationJustification: 'court',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.length).toBeGreaterThanOrEqual(3);
  });
});

describe('rankOffers', () => {
  it('renvoie tableau vide si aucune offre', () => {
    expect(rankOffers([])).toEqual([]);
  });

  it('classe par prix decroissant si meme conformite technique', () => {
    const result = rankOffers([OFFER_A, OFFER_B]);
    expect(result[0]?.offer.id).toBe('B'); // moins cher
    expect(result[1]?.offer.id).toBe('A');
  });

  it('penalise les offres non techniquement conformes', () => {
    const result = rankOffers([OFFER_B, OFFER_C]);
    expect(result[0]?.offer.id).toBe('B'); // conforme meme si plus cher
    expect(result[1]?.offer.id).toBe('C');
  });

  it('weights personnalises (100% prix) : moins cher gagne meme si non conforme', () => {
    const result = rankOffers([OFFER_B, OFFER_C], { price: 1, technical: 0 });
    expect(result[0]?.offer.id).toBe('C');
  });

  it('ignore les offres a prix 0 (donne score 0)', () => {
    const broken = { id: 'X', supplierId: 's', priceTtc: 0, technicallyCompliant: true };
    const result = rankOffers([OFFER_A, broken]);
    expect(result[0]?.offer.id).toBe('A');
    expect(result[1]?.score).toBe(0);
  });
});
