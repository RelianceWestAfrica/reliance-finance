import { describe, expect, it } from 'vitest';

import { computeApprovalChain } from './approval-chain.js';

const DEFAULT_THRESHOLDS = {
  filialeN2RequiredAbove: 500_000,
  groupeRequiredAbove: 5_000_000,
  agRequiredAbove: 50_000_000,
};

const STANDARD_CTX = {
  amountInGroupCurrency: 100_000,
  isOutOfBudget: false,
  supplierSensitivity: 'STANDARD' as const,
  supplierIsStrategic: false,
};

describe('computeApprovalChain', () => {
  it('petit montant standard : N1 seul', () => {
    const chain = computeApprovalChain(STANDARD_CTX, DEFAULT_THRESHOLDS);
    expect(chain).toHaveLength(1);
    expect(chain[0]?.stage).toBe('VISA_FILIALE_N1');
    expect(chain[0]?.position).toBe(1);
  });

  it('depasse seuil N2 : ajoute N2', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, amountInGroupCurrency: 1_000_000 },
      DEFAULT_THRESHOLDS,
    );
    expect(chain.map((s) => s.stage)).toEqual(['VISA_FILIALE_N1', 'VISA_FILIALE_N2']);
  });

  it('depasse seuil Groupe : N1 + N2 + Groupe', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, amountInGroupCurrency: 7_000_000 },
      DEFAULT_THRESHOLDS,
    );
    expect(chain.map((s) => s.stage)).toEqual([
      'VISA_FILIALE_N1',
      'VISA_FILIALE_N2',
      'VISA_GROUPE',
    ]);
  });

  it('depasse seuil AG : 4 signatures', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, amountInGroupCurrency: 60_000_000 },
      DEFAULT_THRESHOLDS,
    );
    expect(chain).toHaveLength(4);
    expect(chain.map((s) => s.stage)).toEqual([
      'VISA_FILIALE_N1',
      'VISA_FILIALE_N2',
      'VISA_GROUPE',
      'AUTHORIZATION_AG',
    ]);
  });

  it('fournisseur SENSIBLE en petit montant : ajoute N2', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, supplierSensitivity: 'SENSITIVE' },
      DEFAULT_THRESHOLDS,
    );
    expect(chain.map((s) => s.stage)).toEqual(['VISA_FILIALE_N1', 'VISA_FILIALE_N2']);
  });

  it('fournisseur STRATEGIQUE en petit montant : N1 + N2 + Groupe + AG', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, supplierIsStrategic: true, supplierSensitivity: 'STRATEGIC' },
      DEFAULT_THRESHOLDS,
    );
    expect(chain).toHaveLength(4);
    // strategique declenche N2 (via sensibilite STRATEGIC), Groupe (via isStrategic),
    // et AG (via isStrategic)
  });

  it('hors budget en petit montant : N1 + AG', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, isOutOfBudget: true },
      DEFAULT_THRESHOLDS,
    );
    expect(chain.map((s) => s.stage)).toEqual(['VISA_FILIALE_N1', 'AUTHORIZATION_AG']);
  });

  it('positions sont croissantes contigues', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, amountInGroupCurrency: 100_000_000 },
      DEFAULT_THRESHOLDS,
    );
    expect(chain.map((s) => s.position)).toEqual([1, 2, 3, 4]);
  });

  it('reason de chaque slot inclut la justification (montant ou flag)', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, amountInGroupCurrency: 7_000_000, supplierIsStrategic: true },
      DEFAULT_THRESHOLDS,
    );
    const groupe = chain.find((s) => s.stage === 'VISA_GROUPE');
    expect(groupe?.reason).toMatch(/montant|strategique/i);
  });

  it('si tous les seuils sont null : N1 seul (montant ignore)', () => {
    const chain = computeApprovalChain(
      { ...STANDARD_CTX, amountInGroupCurrency: 1_000_000_000 },
      { filialeN2RequiredAbove: null, groupeRequiredAbove: null, agRequiredAbove: null },
    );
    expect(chain.map((s) => s.stage)).toEqual(['VISA_FILIALE_N1']);
  });

  it('roles autorises N1 inclut DAF_PAYS', () => {
    const chain = computeApprovalChain(STANDARD_CTX, DEFAULT_THRESHOLDS);
    expect(chain[0]?.allowedRoles).toContain('DAF_PAYS');
  });
});
