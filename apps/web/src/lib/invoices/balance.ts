// =============================================================================
// Invoice balance - Calcul du reste a payer avec avoirs
// =============================================================================
// Conformite : "Avoir reduit correctement amountPaid cumule" (cadre §M8 +
// acceptance criteria).
//
// Modele :
//   - Une Invoice de type STANDARD a un totalTtc et amountPaid cumule
//   - Une Invoice de type CREDIT_NOTE a un totalTtc (positif) qui REDUIT
//     le solde restant a payer de la facture originale (originalInvoiceId)
//   - amountDue = original.totalTtc - sum(creditNotes.totalTtc) - amountPaid
//
// Logique PURE : prend les snapshots des montants, renvoie le solde. Le caller
// fait les queries DB.
// =============================================================================

export interface InvoiceMoney {
  totalTtc: number;
  amountPaid: number;
}

export interface CreditNoteMoney {
  totalTtc: number;
}

export interface BalanceResult {
  /** Total TTC adjuste apres avoirs */
  adjustedTotal: number;
  /** Montant total deja paye */
  amountPaid: number;
  /** Reste a payer (>= 0) */
  amountDue: number;
  /** Statut financier de la facture */
  status: 'OVERPAID' | 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'CREDITED_OUT';
}

export function computeInvoiceBalance(
  invoice: InvoiceMoney,
  creditNotes: CreditNoteMoney[] = [],
): BalanceResult {
  const creditsTotal = creditNotes.reduce((sum, cn) => sum + cn.totalTtc, 0);
  const adjustedTotal = invoice.totalTtc - creditsTotal;
  const amountDue = adjustedTotal - invoice.amountPaid;

  let status: BalanceResult['status'];
  if (adjustedTotal <= 0) {
    status = 'CREDITED_OUT';
  } else if (invoice.amountPaid > adjustedTotal) {
    status = 'OVERPAID';
  } else if (invoice.amountPaid === adjustedTotal) {
    status = 'PAID';
  } else if (invoice.amountPaid > 0) {
    status = 'PARTIALLY_PAID';
  } else {
    status = 'UNPAID';
  }

  return {
    adjustedTotal,
    amountPaid: invoice.amountPaid,
    amountDue: Math.max(0, amountDue),
    status,
  };
}

/**
 * Verifie l'eligibilite au paiement final selon le cadre §4.1 :
 * "Sans PV = pas de paiement final"
 *
 * Logique PURE.
 */
export interface PaymentEligibilityContext {
  hasPVDefinitif: boolean;
  threeWayMatchOk: boolean | null; // null = pas encore execute
  invoiceStatus: 'RECEIVED' | 'CONTROL_3WAY_PENDING' | 'CONTROL_3WAY_OK' | 'CONTROL_3WAY_KO' | 'APPROVED' | 'SCHEDULED' | 'PAID' | 'PARTIALLY_PAID' | 'ARCHIVED' | 'DISPUTED';
  amountDue: number;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string };

export function checkPaymentEligibility(ctx: PaymentEligibilityContext): EligibilityResult {
  // Garde §4.1 : sans PV pas de paiement final
  if (!ctx.hasPVDefinitif) {
    return {
      eligible: false,
      reason: 'Sans PV de reception/service fait definitif, paiement final interdit (cadre §4.1).',
    };
  }

  // Garde 3-way match
  if (ctx.threeWayMatchOk === null) {
    return {
      eligible: false,
      reason: 'Le 3-way match (BC vs PV vs Facture) doit etre execute avant paiement.',
    };
  }
  if (ctx.threeWayMatchOk === false) {
    return {
      eligible: false,
      reason: '3-way match KO. Reglez les ecarts ou marquez la facture DISPUTED avant paiement.',
    };
  }

  // La facture doit etre dans un statut autorisant le paiement
  const payableStatuses = ['APPROVED', 'SCHEDULED', 'PARTIALLY_PAID'];
  if (!payableStatuses.includes(ctx.invoiceStatus)) {
    return {
      eligible: false,
      reason:
        'Statut facture invalide pour paiement : ' +
        ctx.invoiceStatus +
        ' (requis : ' +
        payableStatuses.join(' ou ') +
        ')',
    };
  }

  if (ctx.amountDue <= 0) {
    return {
      eligible: false,
      reason: 'Aucun montant du a payer (facture deja payee ou compensee par avoirs).',
    };
  }

  return { eligible: true };
}
