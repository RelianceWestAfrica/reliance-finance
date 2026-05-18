import { describe, expect, it } from 'vitest';

import {
  buildPaymentEntry,
  buildInvoiceEntry,
  isBalanced,
  DEFAULT_ACCOUNT_MAPPING,
} from './build-entry.js';

const NOW = new Date('2026-05-18T10:00:00Z');

describe('buildPaymentEntry', () => {
  it('paiement banque : D 401100 / C 512100 equilibre', () => {
    const e = buildPaymentEntry({
      paymentReference: 'RWA-PAY-TOGO-2026-0001',
      paymentAmount: 500_000,
      paymentMethod: 'BANK_TRANSFER',
      executedAt: NOW,
      invoiceNumber: 'F2026-001',
      supplierCode: 'SUP-001',
      currency: 'XOF',
    });
    expect(e.journalCode).toBe('BNQ');
    expect(e.lines).toHaveLength(2);
    expect(e.lines[0]?.accountCode).toBe('401100');
    expect(e.lines[0]?.debit).toBe(500_000);
    expect(e.lines[0]?.credit).toBe(0);
    expect(e.lines[1]?.accountCode).toBe('512100');
    expect(e.lines[1]?.debit).toBe(0);
    expect(e.lines[1]?.credit).toBe(500_000);
    expect(isBalanced(e)).toBe(true);
  });

  it('paiement caisse : journal CAI + compte 571000', () => {
    const e = buildPaymentEntry({
      paymentReference: 'p1',
      paymentAmount: 50_000,
      paymentMethod: 'CASH',
      executedAt: NOW,
      invoiceNumber: 'F1',
      supplierCode: 'S1',
      currency: 'XOF',
    });
    expect(e.journalCode).toBe('CAI');
    expect(e.lines[1]?.accountCode).toBe('571000');
  });

  it('positions sont contigues 1, 2', () => {
    const e = buildPaymentEntry({
      paymentReference: 'p',
      paymentAmount: 100,
      paymentMethod: 'SWIFT',
      executedAt: NOW,
      invoiceNumber: 'F',
      supplierCode: 'S',
      currency: 'XOF',
    });
    expect(e.lines.map((l) => l.position)).toEqual([1, 2]);
  });

  it('mapping personnalise', () => {
    const e = buildPaymentEntry(
      {
        paymentReference: 'p',
        paymentAmount: 100,
        paymentMethod: 'BANK_TRANSFER',
        executedAt: NOW,
        invoiceNumber: 'F',
        supplierCode: 'S',
        currency: 'XOF',
      },
      { ...DEFAULT_ACCOUNT_MAPPING, supplier: '401200', bank: '512200' },
    );
    expect(e.lines[0]?.accountCode).toBe('401200');
    expect(e.lines[1]?.accountCode).toBe('512200');
  });
});

describe('buildInvoiceEntry', () => {
  it('facture sans TVA : D 601 / C 401 equilibre', () => {
    const e = buildInvoiceEntry({
      invoiceReference: 'RWA-INV-TOGO-2026-0001',
      invoiceNumber: 'F-2026-A1',
      invoiceDate: NOW,
      supplierCode: 'SUP-001',
      subtotalHt: 1_000_000,
      taxAmount: 0,
      totalTtc: 1_000_000,
      currency: 'XOF',
    });
    expect(e.journalCode).toBe('ACH');
    expect(e.lines).toHaveLength(2); // pas de ligne TVA
    expect(e.lines[0]?.accountCode).toBe('601000');
    expect(e.lines[0]?.debit).toBe(1_000_000);
    expect(e.lines[1]?.accountCode).toBe('401100');
    expect(e.lines[1]?.credit).toBe(1_000_000);
    expect(isBalanced(e)).toBe(true);
  });

  it('facture avec TVA : 3 lignes equilibrees', () => {
    const e = buildInvoiceEntry({
      invoiceReference: 'r',
      invoiceNumber: 'F-001',
      invoiceDate: NOW,
      supplierCode: 'S',
      subtotalHt: 1_000_000,
      taxAmount: 180_000,
      totalTtc: 1_180_000,
      currency: 'XOF',
    });
    expect(e.lines).toHaveLength(3);
    expect(e.lines[0]?.accountCode).toBe('601000');
    expect(e.lines[0]?.debit).toBe(1_000_000);
    expect(e.lines[1]?.accountCode).toBe('445000');
    expect(e.lines[1]?.debit).toBe(180_000);
    expect(e.lines[2]?.accountCode).toBe('401100');
    expect(e.lines[2]?.credit).toBe(1_180_000);
    expect(isBalanced(e)).toBe(true);
  });

  it('compte de charge personnalise (ex : 614000 sous-traitance)', () => {
    const e = buildInvoiceEntry({
      invoiceReference: 'r',
      invoiceNumber: 'F',
      invoiceDate: NOW,
      supplierCode: 'S',
      subtotalHt: 100,
      taxAmount: 0,
      totalTtc: 100,
      currency: 'XOF',
      expenseAccountCode: '614000',
    });
    expect(e.lines[0]?.accountCode).toBe('614000');
  });

  it('costCenterCode propage sur toutes les lignes', () => {
    const e = buildInvoiceEntry({
      invoiceReference: 'r',
      invoiceNumber: 'F',
      invoiceDate: NOW,
      supplierCode: 'S',
      subtotalHt: 100,
      taxAmount: 18,
      totalTtc: 118,
      currency: 'XOF',
      costCenterCode: 'CC-CHANTIER',
    });
    expect(e.lines.every((l) => l.costCenterCode === 'CC-CHANTIER')).toBe(true);
  });
});

describe('isBalanced', () => {
  it('true si debit == credit', () => {
    expect(
      isBalanced({
        journalCode: 'X',
        description: '',
        entryDate: NOW,
        currency: 'XOF',
        lines: [],
        totalDebit: 1000,
        totalCredit: 1000,
      }),
    ).toBe(true);
  });

  it('false si difference > tolerance', () => {
    expect(
      isBalanced({
        journalCode: 'X',
        description: '',
        entryDate: NOW,
        currency: 'XOF',
        lines: [],
        totalDebit: 1000,
        totalCredit: 999,
      }),
    ).toBe(false);
  });

  it('true si difference dans tolerance (arrondis)', () => {
    expect(
      isBalanced(
        {
          journalCode: 'X',
          description: '',
          entryDate: NOW,
          currency: 'XOF',
          lines: [],
          totalDebit: 1000.005,
          totalCredit: 1000,
        },
        10,
      ),
    ).toBe(true);
  });
});
