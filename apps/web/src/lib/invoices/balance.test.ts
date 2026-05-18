import { describe, expect, it } from 'vitest';

import { computeInvoiceBalance, checkPaymentEligibility } from './balance.js';

describe('computeInvoiceBalance', () => {
  it('UNPAID : facture non payee, sans avoir', () => {
    const r = computeInvoiceBalance({ totalTtc: 1000, amountPaid: 0 });
    expect(r).toEqual({ adjustedTotal: 1000, amountPaid: 0, amountDue: 1000, status: 'UNPAID' });
  });

  it('PARTIALLY_PAID : paiement partiel', () => {
    const r = computeInvoiceBalance({ totalTtc: 1000, amountPaid: 300 });
    expect(r.status).toBe('PARTIALLY_PAID');
    expect(r.amountDue).toBe(700);
  });

  it('PAID : entierement paye', () => {
    const r = computeInvoiceBalance({ totalTtc: 1000, amountPaid: 1000 });
    expect(r.status).toBe('PAID');
    expect(r.amountDue).toBe(0);
  });

  it('OVERPAID : trop paye (erreur a traiter)', () => {
    const r = computeInvoiceBalance({ totalTtc: 1000, amountPaid: 1100 });
    expect(r.status).toBe('OVERPAID');
    expect(r.amountDue).toBe(0);
  });

  it('avoir reduit le solde : 1000 - 200 - 500 paye = 300 du', () => {
    const r = computeInvoiceBalance(
      { totalTtc: 1000, amountPaid: 500 },
      [{ totalTtc: 200 }],
    );
    expect(r.adjustedTotal).toBe(800);
    expect(r.amountDue).toBe(300);
    expect(r.status).toBe('PARTIALLY_PAID');
  });

  it('CREDITED_OUT : avoirs >= total facture', () => {
    const r = computeInvoiceBalance(
      { totalTtc: 1000, amountPaid: 0 },
      [{ totalTtc: 1000 }],
    );
    expect(r.adjustedTotal).toBe(0);
    expect(r.status).toBe('CREDITED_OUT');
    expect(r.amountDue).toBe(0);
  });

  it('plusieurs avoirs cumules : 1000 - (200 + 300) = 500', () => {
    const r = computeInvoiceBalance(
      { totalTtc: 1000, amountPaid: 0 },
      [{ totalTtc: 200 }, { totalTtc: 300 }],
    );
    expect(r.adjustedTotal).toBe(500);
    expect(r.amountDue).toBe(500);
  });

  it('avoir + paiement = balance correcte', () => {
    // Facture 1000, avoir 100 -> total ajuste 900. Paye 400 -> du 500.
    const r = computeInvoiceBalance(
      { totalTtc: 1000, amountPaid: 400 },
      [{ totalTtc: 100 }],
    );
    expect(r.adjustedTotal).toBe(900);
    expect(r.amountDue).toBe(500);
    expect(r.amountPaid).toBe(400);
  });
});

describe('checkPaymentEligibility', () => {
  const ELIGIBLE_BASE = {
    hasPVDefinitif: true,
    threeWayMatchOk: true,
    invoiceStatus: 'APPROVED' as const,
    amountDue: 1000,
  };

  it('eligible : toutes conditions reunies', () => {
    expect(checkPaymentEligibility(ELIGIBLE_BASE)).toEqual({ eligible: true });
  });

  it('KO : pas de PV definitif (cadre §4.1)', () => {
    const r = checkPaymentEligibility({ ...ELIGIBLE_BASE, hasPVDefinitif: false });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toMatch(/§4\.1/);
  });

  it('KO : 3-way match pas encore execute', () => {
    const r = checkPaymentEligibility({ ...ELIGIBLE_BASE, threeWayMatchOk: null });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toMatch(/3-way match/i);
  });

  it('KO : 3-way match KO', () => {
    const r = checkPaymentEligibility({ ...ELIGIBLE_BASE, threeWayMatchOk: false });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toMatch(/KO/);
  });

  it('KO : statut invalide (RECEIVED)', () => {
    const r = checkPaymentEligibility({ ...ELIGIBLE_BASE, invoiceStatus: 'RECEIVED' });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toMatch(/Statut/i);
  });

  it('KO : amountDue <= 0 (deja payee)', () => {
    const r = checkPaymentEligibility({ ...ELIGIBLE_BASE, amountDue: 0 });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toMatch(/du/i);
  });

  it('eligible : PARTIALLY_PAID avec amountDue > 0', () => {
    expect(
      checkPaymentEligibility({
        ...ELIGIBLE_BASE,
        invoiceStatus: 'PARTIALLY_PAID',
        amountDue: 500,
      }),
    ).toEqual({ eligible: true });
  });

  it('KO : DISPUTED', () => {
    const r = checkPaymentEligibility({ ...ELIGIBLE_BASE, invoiceStatus: 'DISPUTED' });
    expect(r.eligible).toBe(false);
  });
});
