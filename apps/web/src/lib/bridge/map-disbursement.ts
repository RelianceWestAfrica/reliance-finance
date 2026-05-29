// =============================================================================
// Pont financier - Mapping DISBURSEMENT -> ExpenseRequest (logique PURE)
// =============================================================================
// Aucune I/O : transforme une FinancialIntent en donnees pretes pour Prisma +
// derive le contexte du moteur de workflow. Testable isolement.
// =============================================================================

import type { FinancialIntent } from '@reliance-finance/bridge-contract';
import {
  DocumentType,
  ExpenseRequestType,
  OpexCapex,
  UrgencyLevel,
} from '@reliance-finance/database';
import type { ExpenseRequestCtx } from '@/lib/expense-requests/workflow-definitions';

/**
 * Un decaissement venant d'une source est par defaut une FDA (Fiche de Demande
 * d'Achat, AMONT) : la mise en concurrence (3 devis) se fait en aval. Une urgence
 * critique route vers FD_URGENCE (procedure cadre §7).
 */
export function deriveExpenseRequestType(intent: FinancialIntent): ExpenseRequestType {
  if (intent.classification?.urgency === 'CRITICAL') return ExpenseRequestType.FD_URGENCE;
  return ExpenseRequestType.FDA;
}

export function documentTypeFor(type: ExpenseRequestType): DocumentType {
  if (type === ExpenseRequestType.FD_URGENCE) return DocumentType.FD_URGENCE;
  if (type === ExpenseRequestType.FDA) return DocumentType.FDA;
  return DocumentType.FD;
}

const URGENCY_MAP: Record<string, UrgencyLevel> = {
  LOW: UrgencyLevel.LOW,
  MEDIUM: UrgencyLevel.MEDIUM,
  HIGH: UrgencyLevel.HIGH,
  CRITICAL: UrgencyLevel.CRITICAL,
};

export function mapUrgency(intent: FinancialIntent): UrgencyLevel {
  return URGENCY_MAP[intent.classification?.urgency ?? 'LOW'] ?? UrgencyLevel.LOW;
}

export function mapOpexCapex(intent: FinancialIntent): OpexCapex {
  return intent.classification?.opexCapex === 'CAPEX' ? OpexCapex.CAPEX : OpexCapex.OPEX;
}

export interface ExpenseRequestItemInput {
  position: number;
  description: string;
  quantity: string;
  unit?: string;
  unitPrice?: string;
  totalPrice?: string;
  notes?: string;
}

/** Items de l'intention -> lignes ExpenseRequestItem (quantite requise -> defaut "1"). */
export function buildItemsInput(intent: FinancialIntent): ExpenseRequestItemInput[] {
  const items = intent.content.items ?? [];
  return items.map((it, idx) => ({
    position: it.position ?? idx + 1,
    description: it.description,
    quantity: it.quantity ?? '1',
    unit: it.unit,
    unitPrice: it.unitPrice,
    totalPrice: it.totalPrice,
    notes: it.notes,
  }));
}

/**
 * Contexte pour le moteur de workflow (transition `submit`).
 * - FDA : la garde "3 offres" est neutralisee (mise en concurrence faite en aval,
 *   referencee dans documentTrail) -> threeOffersThreshold = null.
 * - FD : on honore le seuil ; un bcRef vaut preuve de comparatif amont.
 */
export function buildApprovalCtx(params: {
  intent: FinancialIntent;
  type: ExpenseRequestType;
  amountInGroupCurrency: number;
  threeOffersThreshold: number | null;
}): ExpenseRequestCtx {
  const { intent, type, amountInGroupCurrency, threeOffersThreshold } = params;
  const isUrgence = type === ExpenseRequestType.FD_URGENCE;
  return {
    amountInGroupCurrency,
    hasOfferComparison: Boolean(intent.documentTrail?.bcRef),
    hasSoleSourceJustification: false,
    threeOffersThreshold: type === ExpenseRequestType.FDA ? null : threeOffersThreshold,
    hasPV: Boolean(intent.documentTrail?.pvRef),
    isFinalPayment: false,
    isUrgence,
    // Urgence attestee en amont (urgency=CRITICAL + motif requis cote source).
    emergencyConditionsMet: isUrgence,
  };
}

/** Montant numerique pour le calcul des seuils (approximation si devise != XOF). */
export function amountToNumber(intent: FinancialIntent): number {
  return Number(intent.amount.value);
}
