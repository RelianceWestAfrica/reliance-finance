import { describe, expect, it } from 'vitest';

import {
  threeWayMatch,
  relativeVariance,
  DEFAULT_MATCH_CONFIG,
} from './match.js';

const BC_2_LIGNES = [
  { position: 1, description: 'Ciment', quantity: 100, unitPrice: 5000, totalHt: 500_000 },
  { position: 2, description: 'Sable', quantity: 50, unitPrice: 3000, totalHt: 150_000 },
];

const PV_2_LIGNES_OK = [
  { position: 1, description: 'Ciment', quantityExpected: 100, quantityReceived: 100, isCompliant: true },
  { position: 2, description: 'Sable', quantityExpected: 50, quantityReceived: 50, isCompliant: true },
];

const FACTURE_OK = [
  { position: 1, description: 'Ciment', quantity: 100, unitPrice: 5000, totalHt: 500_000 },
  { position: 2, description: 'Sable', quantity: 50, unitPrice: 3000, totalHt: 150_000 },
];

describe('relativeVariance', () => {
  it('0 si meme valeur', () => {
    expect(relativeVariance(100, 100)).toBe(0);
  });

  it('|a-b|/max(|a|,|b|) ecart 5%', () => {
    expect(relativeVariance(100, 105)).toBeCloseTo(0.04761, 3);
  });

  it('symetrique', () => {
    expect(relativeVariance(100, 110)).toBe(relativeVariance(110, 100));
  });

  it('gere 0 et 0 = 0', () => {
    expect(relativeVariance(0, 0)).toBe(0);
  });
});

describe('threeWayMatch', () => {
  it('OK : BC == PV == Facture sur 2 lignes', () => {
    const r = threeWayMatch(BC_2_LIGNES, PV_2_LIGNES_OK, FACTURE_OK, 650_000, 650_000);
    expect(r.ok).toBe(true);
    expect(r.discrepancies).toEqual([]);
  });

  it('KO : quantite facture > BC sur 1 ligne', () => {
    const fact = [
      { position: 1, description: 'Ciment', quantity: 120, unitPrice: 5000, totalHt: 600_000 },
      { position: 2, description: 'Sable', quantity: 50, unitPrice: 3000, totalHt: 150_000 },
    ];
    const r = threeWayMatch(BC_2_LIGNES, PV_2_LIGNES_OK, fact, 750_000, 650_000);
    expect(r.ok).toBe(false);
    expect(r.quantityMatch).toBe(false);
    expect(r.discrepancies.some((d) => d.type === 'QUANTITY_OVER_BC')).toBe(true);
  });

  it('KO : quantite facturee > recue', () => {
    const pv = [
      { position: 1, description: 'Ciment', quantityExpected: 100, quantityReceived: 80, isCompliant: true },
      { position: 2, description: 'Sable', quantityExpected: 50, quantityReceived: 50, isCompliant: true },
    ];
    const r = threeWayMatch(BC_2_LIGNES, pv, FACTURE_OK, 650_000, 650_000);
    expect(r.ok).toBe(false);
    expect(r.discrepancies.some((d) => d.type === 'QUANTITY_OVER_RECEPTION')).toBe(true);
  });

  it('KO : ecart prix > 5% (tolerance par defaut)', () => {
    const fact = [
      { position: 1, description: 'Ciment', quantity: 100, unitPrice: 5500, totalHt: 550_000 },
      { position: 2, description: 'Sable', quantity: 50, unitPrice: 3000, totalHt: 150_000 },
    ];
    const r = threeWayMatch(BC_2_LIGNES, PV_2_LIGNES_OK, fact, 700_000, 650_000);
    expect(r.ok).toBe(false);
    expect(r.priceMatch).toBe(false);
    const priceDisc = r.discrepancies.find((d) => d.type === 'PRICE_VARIANCE');
    expect(priceDisc).toBeDefined();
    expect(priceDisc?.variancePercent).toBeGreaterThan(5);
  });

  it('OK : ecart prix 3% (sous tolerance 5%)', () => {
    const fact = [
      { position: 1, description: 'Ciment', quantity: 100, unitPrice: 5150, totalHt: 515_000 },
      { position: 2, description: 'Sable', quantity: 50, unitPrice: 3000, totalHt: 150_000 },
    ];
    const r = threeWayMatch(BC_2_LIGNES, PV_2_LIGNES_OK, fact, 665_000, 650_000, {
      ...DEFAULT_MATCH_CONFIG,
      totalTolerance: 0.03,
    });
    expect(r.priceMatch).toBe(true);
  });

  it('KO : ligne facture absente du BC', () => {
    const fact = [
      ...FACTURE_OK,
      { position: 3, description: 'Inattendu', quantity: 10, unitPrice: 1000, totalHt: 10_000 },
    ];
    const r = threeWayMatch(BC_2_LIGNES, PV_2_LIGNES_OK, fact, 660_000, 650_000);
    expect(r.ok).toBe(false);
    expect(r.discrepancies.some((d) => d.type === 'MISSING_ITEM_BC')).toBe(true);
  });

  it('KO : reception non conforme', () => {
    const pv = [
      { position: 1, description: 'Ciment', quantityExpected: 100, quantityReceived: 100, isCompliant: false },
      { position: 2, description: 'Sable', quantityExpected: 50, quantityReceived: 50, isCompliant: true },
    ];
    const r = threeWayMatch(BC_2_LIGNES, pv, FACTURE_OK, 650_000, 650_000);
    expect(r.discrepancies.some((d) => d.type === 'RECEPTION_NOT_COMPLIANT')).toBe(true);
  });

  it('KO : ligne facture absente du PV', () => {
    const pv = [
      { position: 1, description: 'Ciment', quantityExpected: 100, quantityReceived: 100, isCompliant: true },
    ]; // ligne 2 manquante
    const r = threeWayMatch(BC_2_LIGNES, pv, FACTURE_OK, 650_000, 650_000);
    expect(r.ok).toBe(false);
    expect(r.discrepancies.some((d) => d.type === 'MISSING_ITEM_RECEPTION')).toBe(true);
  });

  it('OK sans reception si config.requiresReception = false', () => {
    const r = threeWayMatch(BC_2_LIGNES, null, FACTURE_OK, 650_000, 650_000, {
      ...DEFAULT_MATCH_CONFIG,
      requiresReception: false,
    });
    expect(r.ok).toBe(true);
  });

  it('KO si requiresReception et reception null', () => {
    const r = threeWayMatch(BC_2_LIGNES, null, FACTURE_OK, 650_000, 650_000);
    expect(r.ok).toBe(false);
    // Toutes les lignes manquent dans le PV
    expect(r.discrepancies.filter((d) => d.type === 'MISSING_ITEM_RECEPTION').length).toBe(2);
  });

  it('KO : ecart total HT > 1%', () => {
    // Pas d\'ecart de prix par ligne mais total artificiellement different
    const r = threeWayMatch(BC_2_LIGNES, PV_2_LIGNES_OK, FACTURE_OK, 680_000, 650_000);
    expect(r.totalMatch).toBe(false);
    expect(r.discrepancies.some((d) => d.type === 'TOTAL_VARIANCE')).toBe(true);
  });

  it('config personnalisee : tolerance prix a 10%', () => {
    const fact = [
      { position: 1, description: 'Ciment', quantity: 100, unitPrice: 5400, totalHt: 540_000 },
      { position: 2, description: 'Sable', quantity: 50, unitPrice: 3000, totalHt: 150_000 },
    ];
    const r = threeWayMatch(BC_2_LIGNES, PV_2_LIGNES_OK, fact, 690_000, 650_000, {
      pricePerLineTolerance: 0.1,
      totalTolerance: 0.1,
      requiresReception: true,
    });
    expect(r.priceMatch).toBe(true);
  });

  it('quantite facturee < BC (partiel) = OK', () => {
    const fact = [
      { position: 1, description: 'Ciment', quantity: 50, unitPrice: 5000, totalHt: 250_000 },
      { position: 2, description: 'Sable', quantity: 50, unitPrice: 3000, totalHt: 150_000 },
    ];
    const pv = [
      { position: 1, description: 'Ciment', quantityExpected: 100, quantityReceived: 50, isCompliant: true },
      { position: 2, description: 'Sable', quantityExpected: 50, quantityReceived: 50, isCompliant: true },
    ];
    const r = threeWayMatch(BC_2_LIGNES, pv, fact, 400_000, 400_000, {
      ...DEFAULT_MATCH_CONFIG,
      totalTolerance: 0.5, // tolerance large car facture partielle
    });
    expect(r.quantityMatch).toBe(true);
  });
});
