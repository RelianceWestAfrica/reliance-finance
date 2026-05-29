import { describe, expect, it } from 'vitest';

import { parseFinancialIntent, type FinancialIntent } from '@reliancewestafrica/bridge-contract';
import { ExpenseRequestType, OpexCapex, UrgencyLevel } from '@reliance-finance/database';

import {
  amountToNumber,
  buildApprovalCtx,
  buildItemsInput,
  deriveExpenseRequestType,
  mapOpexCapex,
  mapUrgency,
} from './map-disbursement.js';

function makeIntent(overrides: Record<string, unknown> = {}): FinancialIntent {
  const r = parseFinancialIntent({
    schemaVersion: '1.0',
    intentId: 'intent-12345678',
    flowType: 'DISBURSEMENT',
    source: { app: 'rwa-btp', objectType: 'FicheDemande', objectId: 'ck1', objectRef: 'REF-1' },
    target: { entityCode: 'RWA-TOGO' },
    amount: { value: '12500000.0000', currency: 'XOF' },
    content: { title: 'Ciment lot 3' },
    upstreamValidations: [{ stage: 'OPS', decision: 'OK', signedAt: '2026-05-26T16:20:00Z' }],
    metadata: { emittedAt: '2026-05-28T11:30:00Z' },
    ...overrides,
  });
  if (!r.ok) throw new Error('fixture invalide: ' + r.error.message);
  return r.intent;
}

describe('deriveExpenseRequestType', () => {
  it('FDA par defaut', () => {
    expect(deriveExpenseRequestType(makeIntent())).toBe(ExpenseRequestType.FDA);
  });
  it('FD_URGENCE si urgency CRITICAL', () => {
    const intent = makeIntent({ classification: { urgency: 'CRITICAL' }, upstreamValidations: [] });
    expect(deriveExpenseRequestType(intent)).toBe(ExpenseRequestType.FD_URGENCE);
  });
});

describe('buildApprovalCtx', () => {
  it('neutralise la garde 3-offres pour une FDA', () => {
    const ctx = buildApprovalCtx({
      intent: makeIntent(),
      type: ExpenseRequestType.FDA,
      amountInGroupCurrency: 12_500_000,
      threeOffersThreshold: 5_000_000,
    });
    expect(ctx.threeOffersThreshold).toBeNull();
    expect(ctx.amountInGroupCurrency).toBe(12_500_000);
    expect(ctx.isUrgence).toBe(false);
  });

  it('honore le seuil 3-offres pour une FD', () => {
    const ctx = buildApprovalCtx({
      intent: makeIntent({ documentTrail: { bcRef: 'RWA-BC-1' } }),
      type: ExpenseRequestType.FD,
      amountInGroupCurrency: 12_500_000,
      threeOffersThreshold: 5_000_000,
    });
    expect(ctx.threeOffersThreshold).toBe(5_000_000);
    expect(ctx.hasOfferComparison).toBe(true);
  });
});

describe('buildItemsInput', () => {
  it('defaut quantite a "1" si absente', () => {
    const items = buildItemsInput(
      makeIntent({ content: { title: 'Lot items', items: [{ position: 1, description: 'sac' }] } }),
    );
    expect(items[0]?.quantity).toBe('1');
  });
  it('preserve la quantite fournie', () => {
    const items = buildItemsInput(
      makeIntent({
        content: {
          title: 'Lot items',
          items: [{ position: 1, description: 'sac', quantity: '5.0000' }],
        },
      }),
    );
    expect(items[0]?.quantity).toBe('5.0000');
  });
});

describe('mapUrgency / mapOpexCapex / amountToNumber', () => {
  it('urgence par defaut LOW', () => {
    expect(mapUrgency(makeIntent())).toBe(UrgencyLevel.LOW);
    expect(mapUrgency(makeIntent({ classification: { urgency: 'HIGH' } }))).toBe(UrgencyLevel.HIGH);
  });
  it('opexCapex par defaut OPEX', () => {
    expect(mapOpexCapex(makeIntent())).toBe(OpexCapex.OPEX);
    expect(mapOpexCapex(makeIntent({ classification: { opexCapex: 'CAPEX' } }))).toBe(
      OpexCapex.CAPEX,
    );
  });
  it('amountToNumber convertit le Decimal-string', () => {
    expect(amountToNumber(makeIntent())).toBe(12_500_000);
  });
});
