// =============================================================================
// Cash position - Vue position de tresorerie (cadre §3.5 + §10)
// =============================================================================
// Logique PURE qui agrege :
//   - paiements executes ou reconcilies (sorties effectives)
//   - paiements scheduled (sorties planifiees)
//   - factures approuvees non encore planifiees (futur)
// =============================================================================

export interface PaymentMoney {
  amount: number;
  currency: string;
  status: 'DRAFT' | 'ANTI_FRAUD_PENDING' | 'SCHEDULED' | 'EXECUTED' | 'RECONCILED' | 'FAILED' | 'CANCELLED';
}

export interface InvoiceMoney {
  amountDue: number;
  currency: string;
}

export interface CashPosition {
  /** Sorties executees (EXECUTED + RECONCILED) */
  executed: number;
  /** Sorties planifiees (SCHEDULED, pas encore parties) */
  scheduled: number;
  /** Engagements futurs (factures approuvees non planifiees) */
  futureCommitments: number;
  /** Total engage (executed + scheduled + futureCommitments) */
  totalCommitted: number;
  currency: string;
}

export function computeCashPosition(
  payments: PaymentMoney[],
  futureInvoices: InvoiceMoney[],
  currency: string = 'XOF',
): CashPosition {
  const filteredPayments = payments.filter((p) => p.currency === currency);
  const filteredInvoices = futureInvoices.filter((i) => i.currency === currency);

  const executed = filteredPayments
    .filter((p) => p.status === 'EXECUTED' || p.status === 'RECONCILED')
    .reduce((sum, p) => sum + p.amount, 0);

  const scheduled = filteredPayments
    .filter((p) => p.status === 'SCHEDULED')
    .reduce((sum, p) => sum + p.amount, 0);

  const futureCommitments = filteredInvoices.reduce((sum, i) => sum + i.amountDue, 0);

  return {
    executed,
    scheduled,
    futureCommitments,
    totalCommitted: executed + scheduled + futureCommitments,
    currency,
  };
}
