import { describe, expect, it } from 'vitest';

import {
  detectDuplicateInvoices,
  detectPaymentFractioning,
  detectMissingPV,
  detectStaleDrafts,
  detectRepeatedUrgency,
} from './rules.js';

const NOW = new Date('2026-05-18T12:00:00Z');

describe('detectDuplicateInvoices', () => {
  it('detecte 2 factures meme supplier + numero', () => {
    const r = detectDuplicateInvoices([
      { id: 'i1', entityId: 'e1', supplierId: 's1', supplierCode: 'S1', invoiceNumber: 'F-001', totalTtc: 1000, invoiceDate: NOW },
      { id: 'i2', entityId: 'e1', supplierId: 's1', supplierCode: 'S1', invoiceNumber: 'F-001', totalTtc: 1000, invoiceDate: NOW },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]?.type).toBe('DUPLICATE_INVOICE');
    expect(r[0]?.severity).toBe('HIGH');
  });

  it('case insensitive + trim sur invoiceNumber', () => {
    const r = detectDuplicateInvoices([
      { id: 'i1', entityId: 'e1', supplierId: 's1', supplierCode: 'S1', invoiceNumber: 'F-001', totalTtc: 1, invoiceDate: NOW },
      { id: 'i2', entityId: 'e1', supplierId: 's1', supplierCode: 'S1', invoiceNumber: '  f-001  ', totalTtc: 1, invoiceDate: NOW },
    ]);
    expect(r).toHaveLength(1);
  });

  it('pas de doublon si supplier different', () => {
    const r = detectDuplicateInvoices([
      { id: 'i1', entityId: 'e1', supplierId: 's1', supplierCode: 'S1', invoiceNumber: 'F-001', totalTtc: 1, invoiceDate: NOW },
      { id: 'i2', entityId: 'e1', supplierId: 's2', supplierCode: 'S2', invoiceNumber: 'F-001', totalTtc: 1, invoiceDate: NOW },
    ]);
    expect(r).toHaveLength(0);
  });
});

describe('detectPaymentFractioning', () => {
  const supplierId = 's1';
  const entityId = 'e1';

  it('detecte 3 paiements < seuil dont cumul > seuil sur 7 jours', () => {
    const payments = [
      { id: 'p1', entityId, supplierId, invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-10') },
      { id: 'p2', entityId, supplierId, invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-12') },
      { id: 'p3', entityId, supplierId, invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-14') },
    ];
    const r = detectPaymentFractioning(payments);
    expect(r).toHaveLength(1);
    expect(r[0]?.type).toBe('PAYMENT_FRACTIONING');
    expect(r[0]?.severity).toBe('CRITICAL');
  });

  it('pas d\'anomalie si un paiement > seuil (declaration franche)', () => {
    const payments = [
      { id: 'p1', entityId, supplierId, invoiceId: null, amount: 6_000_000, executedAt: new Date('2026-05-10') },
      { id: 'p2', entityId, supplierId, invoiceId: null, amount: 100_000, executedAt: new Date('2026-05-12') },
    ];
    expect(detectPaymentFractioning(payments)).toHaveLength(0);
  });

  it('pas d\'anomalie si cumul sous seuil', () => {
    const payments = [
      { id: 'p1', entityId, supplierId, invoiceId: null, amount: 100_000, executedAt: new Date('2026-05-10') },
      { id: 'p2', entityId, supplierId, invoiceId: null, amount: 100_000, executedAt: new Date('2026-05-12') },
      { id: 'p3', entityId, supplierId, invoiceId: null, amount: 100_000, executedAt: new Date('2026-05-14') },
    ];
    expect(detectPaymentFractioning(payments)).toHaveLength(0);
  });

  it('pas d\'anomalie si moins de minPayments', () => {
    const payments = [
      { id: 'p1', entityId, supplierId, invoiceId: null, amount: 3_000_000, executedAt: new Date('2026-05-10') },
      { id: 'p2', entityId, supplierId, invoiceId: null, amount: 3_000_000, executedAt: new Date('2026-05-12') },
    ];
    expect(detectPaymentFractioning(payments)).toHaveLength(0);
  });

  it('fenetre stricte : paiements > 7 jours ne comptent pas', () => {
    const payments = [
      { id: 'p1', entityId, supplierId, invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-01') },
      { id: 'p2', entityId, supplierId, invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-12') },
      { id: 'p3', entityId, supplierId, invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-15') },
    ];
    // p1 hors fenetre de p2/p3 - pas de fractionnement
    expect(detectPaymentFractioning(payments)).toHaveLength(0);
  });

  it('isole par supplier', () => {
    const payments = [
      { id: 'p1', entityId, supplierId: 's1', invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-10') },
      { id: 'p2', entityId, supplierId: 's1', invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-11') },
      { id: 'p3', entityId, supplierId: 's2', invoiceId: null, amount: 2_000_000, executedAt: new Date('2026-05-12') },
    ];
    expect(detectPaymentFractioning(payments)).toHaveLength(0);
  });
});

describe('detectMissingPV', () => {
  it('detecte facture APPROVED sans PV', () => {
    const r = detectMissingPV([
      { id: 'i1', entityId: 'e1', reference: 'INV-001', status: 'APPROVED', hasReception: false, receptionStatus: null },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('CRITICAL');
  });

  it('detecte facture PAID avec PV PROVISIONAL', () => {
    const r = detectMissingPV([
      { id: 'i1', entityId: 'e1', reference: 'INV-001', status: 'PAID', hasReception: true, receptionStatus: 'PROVISIONAL' },
    ]);
    expect(r).toHaveLength(1);
  });

  it('pas d\'anomalie si PV DEFINITIVE', () => {
    expect(
      detectMissingPV([
        { id: 'i1', entityId: 'e1', reference: 'INV-001', status: 'APPROVED', hasReception: true, receptionStatus: 'DEFINITIVE' },
      ]),
    ).toHaveLength(0);
  });

  it('pas d\'anomalie si facture RECEIVED (pas encore approuvee)', () => {
    expect(
      detectMissingPV([
        { id: 'i1', entityId: 'e1', reference: 'INV-001', status: 'RECEIVED', hasReception: false, receptionStatus: null },
      ]),
    ).toHaveLength(0);
  });
});

describe('detectStaleDrafts', () => {
  it('detecte un DRAFT > 30 jours', () => {
    const r = detectStaleDrafts(
      [{ id: 'er1', entityId: 'e1', reference: 'FD-001', resourceType: 'ExpenseRequest', createdAt: new Date('2026-04-01') }],
      30,
      NOW,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.type).toBe('STALE_DRAFT');
    expect(r[0]?.expenseRequestId).toBe('er1');
  });

  it('pas d\'anomalie si DRAFT recent', () => {
    expect(
      detectStaleDrafts(
        [{ id: 'er1', entityId: 'e1', reference: 'FD-001', resourceType: 'ExpenseRequest', createdAt: new Date('2026-05-10') }],
        30,
        NOW,
      ),
    ).toHaveLength(0);
  });

  it('config personnalisee : maxDays = 7', () => {
    const r = detectStaleDrafts(
      [{ id: 'i1', entityId: 'e1', reference: 'INV-1', resourceType: 'Invoice', createdAt: new Date('2026-05-08') }],
      7,
      NOW,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.invoiceId).toBe('i1');
  });
});

describe('detectRepeatedUrgency', () => {
  it('detecte 3 urgences par meme user en 30 jours', () => {
    const r = detectRepeatedUrgency(
      [
        { id: 'er1', entityId: 'e1', createdById: 'u1', createdAt: new Date('2026-05-01') },
        { id: 'er2', entityId: 'e1', createdById: 'u1', createdAt: new Date('2026-05-10') },
        { id: 'er3', entityId: 'e1', createdById: 'u1', createdAt: new Date('2026-05-15') },
      ],
      { windowDays: 30, maxCount: 2 },
      NOW,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('HIGH');
  });

  it('isole par user : 2 chacun = pas d\'anomalie', () => {
    const r = detectRepeatedUrgency(
      [
        { id: 'er1', entityId: 'e1', createdById: 'u1', createdAt: new Date('2026-05-01') },
        { id: 'er2', entityId: 'e1', createdById: 'u1', createdAt: new Date('2026-05-10') },
        { id: 'er3', entityId: 'e1', createdById: 'u2', createdAt: new Date('2026-05-10') },
        { id: 'er4', entityId: 'e1', createdById: 'u2', createdAt: new Date('2026-05-15') },
      ],
      { windowDays: 30, maxCount: 2 },
      NOW,
    );
    expect(r).toHaveLength(0);
  });

  it('ignore les urgences hors fenetre', () => {
    const r = detectRepeatedUrgency(
      [
        { id: 'er1', entityId: 'e1', createdById: 'u1', createdAt: new Date('2026-03-01') },
        { id: 'er2', entityId: 'e1', createdById: 'u1', createdAt: new Date('2026-03-15') },
        { id: 'er3', entityId: 'e1', createdById: 'u1', createdAt: new Date('2026-05-10') },
      ],
      { windowDays: 30, maxCount: 2 },
      NOW,
    );
    // Seul er3 est dans la fenetre
    expect(r).toHaveLength(0);
  });
});
