import { describe, expect, it } from 'vitest';

import { checkAntiFraud, normalizeHolderName } from './anti-fraud.js';

const YESTERDAY = new Date('2026-05-17');
const NOW = new Date('2026-05-18T12:00:00Z');
const TOMORROW = new Date('2026-05-19');

const VALID_CTX = {
  supplierName: 'BTP MATERIAUX SARL',
  supplierId: 'sup1',
  bankAccount: {
    id: 'ba1',
    holderName: 'BTP MATERIAUX SARL',
    iban: 'TG53...',
    rib: null,
    isActive: true,
    verifiedAt: YESTERDAY,
    quarantineUntil: null,
  },
  bcBankAccountSnapshotId: 'ba1',
  bcBankAccountIban: 'TG53...',
  bcBankAccountRib: null,
  amountToPay: 500_000,
  invoiceAmountDue: 1_000_000,
};

describe('normalizeHolderName', () => {
  it('lowercase + suppression accents', () => {
    expect(normalizeHolderName('Reliance Westafrica SARL')).toBe('reliancewestafricasarl');
    expect(normalizeHolderName('Société Genérale')).toBe('societegenerale');
  });

  it('suppression ponctuation (variants typo deviennent identiques)', () => {
    expect(normalizeHolderName('BTP   Materiaux,  S.A.R.L.')).toBe('btpmateriauxsarl');
    expect(normalizeHolderName('BTP MATERIAUX SARL')).toBe('btpmateriauxsarl');
  });

  it('strings vides ou whitespace -> ""', () => {
    expect(normalizeHolderName('   ')).toBe('');
  });
});

describe('checkAntiFraud', () => {
  it('OK : tous controles passent', () => {
    expect(checkAntiFraud(VALID_CTX, NOW)).toEqual({ ok: true });
  });

  it('OK : tolerance casse + ponctuation entre titulaire et raison sociale', () => {
    const r = checkAntiFraud(
      {
        ...VALID_CTX,
        bankAccount: { ...VALID_CTX.bankAccount, holderName: 'B.T.P. Materiaux S.A.R.L.' },
      },
      NOW,
    );
    expect(r.ok).toBe(true);
  });

  it('KO : titulaire different du fournisseur', () => {
    const r = checkAntiFraud(
      {
        ...VALID_CTX,
        bankAccount: { ...VALID_CTX.bankAccount, holderName: 'Autre Beneficiaire' },
      },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => v.code === 'BENEFICIARY_NAME_MISMATCH')).toBe(true);
    }
  });

  it('KO : RIB en quarantaine', () => {
    const r = checkAntiFraud(
      {
        ...VALID_CTX,
        bankAccount: {
          ...VALID_CTX.bankAccount,
          quarantineUntil: TOMORROW,
        },
      },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => v.code === 'BANK_ACCOUNT_NOT_USABLE')).toBe(true);
    }
  });

  it('KO : RIB non verifie', () => {
    const r = checkAntiFraud(
      {
        ...VALID_CTX,
        bankAccount: { ...VALID_CTX.bankAccount, verifiedAt: null },
      },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => v.code === 'BANK_ACCOUNT_NOT_USABLE')).toBe(true);
    }
  });

  it('KO : RIB different du snapshot BC + IBAN different', () => {
    const r = checkAntiFraud(
      {
        ...VALID_CTX,
        bcBankAccountSnapshotId: 'ba_other',
        bcBankAccountIban: 'CI88...',
      },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => v.code === 'RIB_NOT_BC_SNAPSHOT')).toBe(true);
    }
  });

  it('OK : RIB different du snapshot mais MEME IBAN (renouvellement compte)', () => {
    const r = checkAntiFraud(
      {
        ...VALID_CTX,
        bcBankAccountSnapshotId: 'ba_other',
        bcBankAccountIban: 'TG53...', // meme IBAN que le bankAccount actuel
      },
      NOW,
    );
    expect(r.ok).toBe(true);
  });

  it('KO : montant negatif', () => {
    const r = checkAntiFraud({ ...VALID_CTX, amountToPay: -100 }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.code === 'AMOUNT_INVALID')).toBe(true);
  });

  it('KO : montant zero', () => {
    const r = checkAntiFraud({ ...VALID_CTX, amountToPay: 0 }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.code === 'AMOUNT_INVALID')).toBe(true);
  });

  it('KO : montant > reste du', () => {
    const r = checkAntiFraud(
      { ...VALID_CTX, amountToPay: 1_500_000, invoiceAmountDue: 1_000_000 },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => v.code === 'AMOUNT_EXCEEDS_DUE')).toBe(true);
    }
  });

  it('cumulatif : plusieurs violations en parallele', () => {
    const r = checkAntiFraud(
      {
        ...VALID_CTX,
        bankAccount: {
          ...VALID_CTX.bankAccount,
          holderName: 'AUTRE',
          quarantineUntil: TOMORROW,
        },
        amountToPay: -1,
      },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('snapshot BC null (paiement standalone) : pas de check RIB-BC', () => {
    const r = checkAntiFraud(
      { ...VALID_CTX, bcBankAccountSnapshotId: null, bcBankAccountIban: null, bcBankAccountRib: null },
      NOW,
    );
    expect(r.ok).toBe(true);
  });
});
