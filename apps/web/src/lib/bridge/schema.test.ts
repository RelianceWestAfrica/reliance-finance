import { describe, expect, it } from 'vitest';

import { parseFinancialIntent } from '@reliancewestafrica/bridge-contract';

function baseDisbursement(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    intentId: 'intent-12345678',
    flowType: 'DISBURSEMENT',
    source: {
      app: 'rwa-btp',
      objectType: 'FicheDemande',
      objectId: 'ck123',
      objectRef: 'SIKA01-FD-2026-0001',
    },
    target: { entityCode: 'RWA-TOGO', projectCode: 'CIDPE' },
    amount: { value: '12500000.0000', currency: 'XOF' },
    content: { title: 'Ciment lot 3' },
    upstreamValidations: [
      { stage: 'VALIDATION_OPERATIONNELLE', decision: 'OK', signedAt: '2026-05-26T16:20:00Z' },
    ],
    metadata: { emittedAt: '2026-05-28T11:30:00Z' },
    ...overrides,
  };
}

describe('parseFinancialIntent', () => {
  it('accepte un DISBURSEMENT valide avec validation amont OK', () => {
    const r = parseFinancialIntent(baseDisbursement());
    expect(r.ok).toBe(true);
  });

  it('rejette un DISBURSEMENT sans validation amont (et non critique)', () => {
    const r = parseFinancialIntent(baseDisbursement({ upstreamValidations: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toContain('upstreamValidations');
  });

  it('accepte un DISBURSEMENT sans validation si urgency=CRITICAL', () => {
    const r = parseFinancialIntent(
      baseDisbursement({ upstreamValidations: [], classification: { urgency: 'CRITICAL' } }),
    );
    expect(r.ok).toBe(true);
  });

  it('rejette un schemaVersion inconnu', () => {
    const r = parseFinancialIntent(baseDisbursement({ schemaVersion: '9.9' }));
    expect(r.ok).toBe(false);
  });

  it('rejette un montant non Decimal-string', () => {
    const r = parseFinancialIntent(
      baseDisbursement({ amount: { value: '12,5', currency: 'XOF' } }),
    );
    expect(r.ok).toBe(false);
  });

  it('rejette une COLLECTION dont la contrepartie n est pas CLIENT', () => {
    const r = parseFinancialIntent(
      baseDisbursement({
        flowType: 'COLLECTION',
        counterparty: { kind: 'SUPPLIER', name: 'X' },
        upstreamValidations: [],
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('met la devise en majuscules', () => {
    const r = parseFinancialIntent(
      baseDisbursement({ amount: { value: '100.0000', currency: 'xof' } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.intent.amount.currency).toBe('XOF');
  });
});
