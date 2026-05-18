import { describe, expect, it } from 'vitest';

import { computeCashPosition } from './cash-position.js';

describe('computeCashPosition', () => {
  it('vide : tous a zero', () => {
    expect(computeCashPosition([], [])).toEqual({
      executed: 0,
      scheduled: 0,
      futureCommitments: 0,
      totalCommitted: 0,
      currency: 'XOF',
    });
  });

  it('aggrege EXECUTED + RECONCILED en executed', () => {
    const r = computeCashPosition(
      [
        { amount: 100_000, currency: 'XOF', status: 'EXECUTED' },
        { amount: 200_000, currency: 'XOF', status: 'RECONCILED' },
        { amount: 50_000, currency: 'XOF', status: 'CANCELLED' },
      ],
      [],
    );
    expect(r.executed).toBe(300_000);
  });

  it('aggrege SCHEDULED separement', () => {
    const r = computeCashPosition(
      [
        { amount: 100_000, currency: 'XOF', status: 'SCHEDULED' },
        { amount: 200_000, currency: 'XOF', status: 'EXECUTED' },
      ],
      [],
    );
    expect(r.scheduled).toBe(100_000);
    expect(r.executed).toBe(200_000);
  });

  it('agrege engagements futurs depuis factures approuvees', () => {
    const r = computeCashPosition(
      [],
      [
        { amountDue: 500_000, currency: 'XOF' },
        { amountDue: 300_000, currency: 'XOF' },
      ],
    );
    expect(r.futureCommitments).toBe(800_000);
  });

  it('filtre par devise (ne mixe pas XOF et EUR)', () => {
    const r = computeCashPosition(
      [
        { amount: 1_000_000, currency: 'XOF', status: 'EXECUTED' },
        { amount: 1_500, currency: 'EUR', status: 'EXECUTED' },
      ],
      [],
      'XOF',
    );
    expect(r.executed).toBe(1_000_000);
  });

  it('totalCommitted = executed + scheduled + futureCommitments', () => {
    const r = computeCashPosition(
      [
        { amount: 100_000, currency: 'XOF', status: 'EXECUTED' },
        { amount: 50_000, currency: 'XOF', status: 'SCHEDULED' },
      ],
      [{ amountDue: 25_000, currency: 'XOF' }],
    );
    expect(r.totalCommitted).toBe(175_000);
  });

  it('exclut DRAFT, ANTI_FRAUD_PENDING, FAILED, CANCELLED des sums', () => {
    const r = computeCashPosition(
      [
        { amount: 1, currency: 'XOF', status: 'DRAFT' },
        { amount: 1, currency: 'XOF', status: 'ANTI_FRAUD_PENDING' },
        { amount: 1, currency: 'XOF', status: 'FAILED' },
        { amount: 1, currency: 'XOF', status: 'CANCELLED' },
      ],
      [],
    );
    expect(r.executed).toBe(0);
    expect(r.scheduled).toBe(0);
  });
});
