import { describe, expect, it } from 'vitest';

import { buildProjection, detectRuptures, daysUntilFirstRupture } from './projection.js';

const MONDAY = new Date('2026-05-11T10:00:00Z');

describe('buildProjection', () => {
  it('13 semaines vides : closing cash = opening cash partout', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 10_000_000,
      weeks: 13,
      payments: [],
      invoices: [],
      manualInflows: [],
    });
    expect(p).toHaveLength(13);
    expect(p[0]?.openingCash).toBe(10_000_000);
    expect(p[12]?.closingCash).toBe(10_000_000);
    expect(p.every((w) => !w.isRupture)).toBe(true);
  });

  it('paiement S0 reduit closing cash', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 10_000_000,
      weeks: 4,
      payments: [
        { id: 'p1', amount: 3_000_000, scheduledAt: new Date('2026-05-13T10:00:00Z'), currency: 'XOF' },
      ],
      invoices: [],
      manualInflows: [],
    });
    expect(p[0]?.outflow).toBe(3_000_000);
    expect(p[0]?.closingCash).toBe(7_000_000);
    expect(p[1]?.openingCash).toBe(7_000_000); // propage
  });

  it('entree manuelle ajoute inflow', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 0,
      weeks: 4,
      payments: [],
      invoices: [],
      manualInflows: [
        { expectedDate: new Date('2026-05-15T10:00:00Z'), amount: 5_000_000, label: 'Reglement client A', currency: 'XOF' },
      ],
    });
    expect(p[0]?.inflow).toBe(5_000_000);
    expect(p[0]?.closingCash).toBe(5_000_000);
  });

  it('rupture detectee si closing < 0', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 1_000_000,
      weeks: 4,
      payments: [
        { id: 'p1', amount: 3_000_000, scheduledAt: new Date('2026-05-13T10:00:00Z'), currency: 'XOF' },
      ],
      invoices: [],
      manualInflows: [],
    });
    expect(p[0]?.isRupture).toBe(true);
    expect(p[0]?.closingCash).toBe(-2_000_000);
  });

  it('filtre par devise (ne mixe pas XOF et EUR)', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 0,
      weeks: 4,
      payments: [
        { id: 'p1', amount: 1_000_000, scheduledAt: new Date('2026-05-13Z'), currency: 'XOF' },
        { id: 'p2', amount: 500, scheduledAt: new Date('2026-05-13Z'), currency: 'EUR' },
      ],
      invoices: [],
      manualInflows: [],
      currency: 'XOF',
    });
    expect(p[0]?.outflow).toBe(1_000_000);
  });

  it('aggrege paiements + factures dans le meme bucket semaine', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 0,
      weeks: 2,
      payments: [
        { id: 'p1', amount: 100_000, scheduledAt: new Date('2026-05-12Z'), currency: 'XOF' },
      ],
      invoices: [
        { id: 'inv1', amountDue: 200_000, dueDate: new Date('2026-05-14Z'), currency: 'XOF' },
      ],
      manualInflows: [],
    });
    expect(p[0]?.outflow).toBe(300_000);
    expect(p[0]?.outflowLines).toHaveLength(2);
  });

  it('ignore les factures sans dueDate', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 0,
      weeks: 2,
      payments: [],
      invoices: [{ id: 'inv1', amountDue: 100_000, dueDate: null, currency: 'XOF' }],
      manualInflows: [],
    });
    expect(p[0]?.outflow).toBe(0);
  });

  it('index 0-12 sur 13 semaines', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 0,
      weeks: 13,
      payments: [],
      invoices: [],
      manualInflows: [],
    });
    expect(p.map((w) => w.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('detectRuptures', () => {
  it('renvoie [] si pas de rupture', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 10_000_000,
      weeks: 4,
      payments: [],
      invoices: [],
      manualInflows: [],
    });
    expect(detectRuptures(p)).toEqual([]);
  });

  it('marque la 1ere rupture isFirstRupture=true', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 100_000,
      weeks: 3,
      payments: [
        { id: 'p1', amount: 500_000, scheduledAt: new Date('2026-05-13Z'), currency: 'XOF' },
        { id: 'p2', amount: 500_000, scheduledAt: new Date('2026-05-20Z'), currency: 'XOF' },
      ],
      invoices: [],
      manualInflows: [],
    });
    const r = detectRuptures(p);
    // 3 ruptures car le deficit se propage (W2 herite de l'opening = -900k)
    expect(r).toHaveLength(3);
    expect(r[0]?.isFirstRupture).toBe(true);
    expect(r[1]?.isFirstRupture).toBe(false);
    expect(r[2]?.isFirstRupture).toBe(false);
    expect(r[0]?.deficit).toBe(400_000);
  });
});

describe('daysUntilFirstRupture', () => {
  it('null si pas de rupture', () => {
    const p = buildProjection({
      fromDate: MONDAY,
      openingCash: 10_000_000,
      weeks: 4,
      payments: [],
      invoices: [],
      manualInflows: [],
    });
    expect(daysUntilFirstRupture(p, MONDAY)).toBeNull();
  });

  it('compte les jours jusqu\'a 1ere semaine en rupture', () => {
    const MONDAY_PRECISE = new Date('2026-05-11T00:00:00Z');
    const p = buildProjection({
      fromDate: MONDAY_PRECISE,
      openingCash: 1_000_000,
      weeks: 4,
      payments: [
        { id: 'p1', amount: 5_000_000, scheduledAt: new Date('2026-05-25Z'), currency: 'XOF' },
      ],
      invoices: [],
      manualInflows: [],
    });
    // Rupture en S2 (lundi 25 mai 00:00) - 14 jours apres lundi 11 mai 00:00
    const days = daysUntilFirstRupture(p, MONDAY_PRECISE);
    expect(days).toBe(14);
  });
});

