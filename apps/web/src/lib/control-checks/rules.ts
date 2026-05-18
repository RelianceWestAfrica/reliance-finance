// =============================================================================
// Control checks - Catalogue de regles pures de detection d'anomalies
// =============================================================================
// Cadre §13 KPIs anomalies fournisseurs / cadre §10 reporting :
//   - Doublons facture
//   - Fractionnement paiements (eviter seuils)
//   - PV manquant pour facture approuvee
//   - Dossier DRAFT > N jours (stale)
//   - Urgences repetees (deja en M3 mais consolide ici)
//
// Logique PURE : prend des datasets en entree, retourne anomalies a creer.
// Le orchestrateur (run.ts) fait les queries DB et persist les Anomaly.
// =============================================================================

export type AnomalyType =
  | 'DUPLICATE_INVOICE'
  | 'PAYMENT_FRACTIONING'
  | 'MISSING_PV'
  | 'STALE_DRAFT'
  | 'REPEATED_URGENCY';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DetectedAnomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  entityId: string;
  evidence: Record<string, unknown>;
  // ID de la ressource concernee
  expenseRequestId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  supplierId?: string | null;
}

// =============================================================================
// 1. DUPLICATE_INVOICE - meme supplier + meme invoiceNumber
// =============================================================================

export interface InvoiceForDuplication {
  id: string;
  entityId: string;
  supplierId: string;
  supplierCode: string;
  invoiceNumber: string;
  totalTtc: number;
  invoiceDate: Date;
}

/**
 * Detecte les invoices en doublon (meme supplier + meme invoiceNumber dans le
 * jeu de donnees). En production, l'unique constraint Prisma empeche
 * l'insertion, mais ce check sert pour les imports historiques et les
 * faux positifs (numeros similaires).
 */
export function detectDuplicateInvoices(invoices: InvoiceForDuplication[]): DetectedAnomaly[] {
  const seen = new Map<string, InvoiceForDuplication>();
  const anomalies: DetectedAnomaly[] = [];

  for (const inv of invoices) {
    const key = inv.supplierId + '|' + inv.invoiceNumber.trim().toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      anomalies.push({
        type: 'DUPLICATE_INVOICE',
        severity: 'HIGH',
        title:
          'Doublon facture : ' +
          inv.invoiceNumber +
          ' (fournisseur ' +
          inv.supplierCode +
          ')',
        description:
          'Deux factures identiques (supplier + numero) detectees : ' +
          existing.id +
          ' et ' +
          inv.id,
        entityId: inv.entityId,
        invoiceId: inv.id,
        supplierId: inv.supplierId,
        evidence: {
          existingInvoiceId: existing.id,
          existingTotal: existing.totalTtc,
          duplicateTotal: inv.totalTtc,
        },
      });
    } else {
      seen.set(key, inv);
    }
  }

  return anomalies;
}

// =============================================================================
// 2. PAYMENT_FRACTIONING - plusieurs paiements < seuil pour eviter validation
// =============================================================================

export interface PaymentForFractioning {
  id: string;
  entityId: string;
  supplierId: string | null;
  invoiceId: string | null;
  amount: number;
  executedAt: Date;
}

/**
 * Detecte le fractionnement : multiples paiements au meme fournisseur dans une
 * fenetre courte, chacun sous le seuil, mais le cumul depasse le seuil.
 */
export function detectPaymentFractioning(
  payments: PaymentForFractioning[],
  config: { windowDays: number; thresholdAmount: number; minPayments: number } = {
    windowDays: 7,
    thresholdAmount: 5_000_000,
    minPayments: 3,
  },
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  // Grouper par supplier
  const bySupplier = new Map<string, PaymentForFractioning[]>();
  for (const p of payments) {
    if (!p.supplierId) continue;
    const arr = bySupplier.get(p.supplierId) ?? [];
    arr.push(p);
    bySupplier.set(p.supplierId, arr);
  }

  for (const [supplierId, sList] of bySupplier.entries()) {
    const sorted = sList.sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());

    // Fenetre glissante
    for (let i = 0; i < sorted.length; i++) {
      const start = sorted[i];
      if (!start) continue;
      const windowEnd = new Date(start.executedAt.getTime() + config.windowDays * 24 * 3600 * 1000);
      const inWindow = sorted.filter(
        (p) => p.executedAt >= start.executedAt && p.executedAt <= windowEnd,
      );
      const total = inWindow.reduce((s, p) => s + p.amount, 0);
      const allBelowThreshold = inWindow.every((p) => p.amount < config.thresholdAmount);

      if (
        inWindow.length >= config.minPayments &&
        allBelowThreshold &&
        total > config.thresholdAmount
      ) {
        anomalies.push({
          type: 'PAYMENT_FRACTIONING',
          severity: 'CRITICAL',
          title:
            'Fractionnement suspect : ' +
            inWindow.length +
            ' paiements de ' +
            total +
            ' sur ' +
            config.windowDays +
            ' jours (fournisseur ' +
            supplierId +
            ')',
          description:
            'Tous les paiements individuels sont sous le seuil de validation Groupe (' +
            config.thresholdAmount +
            ') mais leur cumul (' +
            total +
            ') le depasse.',
          entityId: start.entityId,
          supplierId,
          evidence: {
            paymentIds: inWindow.map((p) => p.id),
            totalAmount: total,
            windowDays: config.windowDays,
            thresholdAmount: config.thresholdAmount,
          },
        });
        // Une seule anomalie par fenetre - skip jusqu'a apres la fenetre
        i += inWindow.length - 1;
      }
    }
  }

  return anomalies;
}

// =============================================================================
// 3. MISSING_PV - Invoice APPROVED sans PV DEFINITIVE
// =============================================================================

export interface InvoiceForMissingPV {
  id: string;
  entityId: string;
  reference: string;
  status: string;
  hasReception: boolean;
  receptionStatus: string | null;
}

export function detectMissingPV(invoices: InvoiceForMissingPV[]): DetectedAnomaly[] {
  return invoices
    .filter(
      (inv) =>
        (inv.status === 'APPROVED' ||
          inv.status === 'SCHEDULED' ||
          inv.status === 'PAID' ||
          inv.status === 'PARTIALLY_PAID') &&
        (!inv.hasReception || inv.receptionStatus !== 'DEFINITIVE'),
    )
    .map((inv) => ({
      type: 'MISSING_PV' as const,
      severity: 'CRITICAL' as const,
      title: 'PV manquant sur facture ' + inv.reference + ' (cadre §4.1)',
      description:
        'La facture est en statut ' +
        inv.status +
        ' sans PV reception DEFINITIVE (status PV : ' +
        (inv.receptionStatus ?? 'AUCUN') +
        '). "Sans PV = pas de paiement final."',
      entityId: inv.entityId,
      invoiceId: inv.id,
      evidence: { invoiceStatus: inv.status, receptionStatus: inv.receptionStatus },
    }));
}

// =============================================================================
// 4. STALE_DRAFT - dossier DRAFT > N jours
// =============================================================================

export interface DraftForStaleness {
  id: string;
  entityId: string;
  reference: string;
  resourceType: 'ExpenseRequest' | 'PurchaseOrder' | 'Invoice' | 'Payment';
  createdAt: Date;
}

export function detectStaleDrafts(
  drafts: DraftForStaleness[],
  maxDays: number = 30,
  now: Date = new Date(),
): DetectedAnomaly[] {
  const cutoff = new Date(now.getTime() - maxDays * 24 * 3600 * 1000);
  return drafts
    .filter((d) => d.createdAt < cutoff)
    .map((d) => {
      const days = Math.floor((now.getTime() - d.createdAt.getTime()) / (24 * 3600 * 1000));
      return {
        type: 'STALE_DRAFT' as const,
        severity: 'LOW' as const,
        title: d.resourceType + ' ' + d.reference + ' en DRAFT depuis ' + days + ' jours',
        description:
          'Le dossier est en DRAFT depuis plus de ' +
          maxDays +
          ' jours. Verifier s\'il doit etre soumis ou annule.',
        entityId: d.entityId,
        evidence: { resourceType: d.resourceType, createdAt: d.createdAt.toISOString(), days },
        ...(d.resourceType === 'ExpenseRequest' ? { expenseRequestId: d.id } : {}),
        ...(d.resourceType === 'Invoice' ? { invoiceId: d.id } : {}),
        ...(d.resourceType === 'Payment' ? { paymentId: d.id } : {}),
      };
    });
}

// =============================================================================
// 5. REPEATED_URGENCY - meme demandeur > N FD_URGENCE en M jours
// =============================================================================

export interface EmergencyForRepetition {
  id: string;
  entityId: string;
  createdById: string;
  createdAt: Date;
}

export function detectRepeatedUrgency(
  emergencies: EmergencyForRepetition[],
  config: { windowDays: number; maxCount: number } = { windowDays: 30, maxCount: 2 },
  now: Date = new Date(),
): DetectedAnomaly[] {
  const windowStart = new Date(now.getTime() - config.windowDays * 24 * 3600 * 1000);
  const recent = emergencies.filter((e) => e.createdAt >= windowStart);

  // Grouper par createdById
  const byUser = new Map<string, EmergencyForRepetition[]>();
  for (const e of recent) {
    const arr = byUser.get(e.createdById) ?? [];
    arr.push(e);
    byUser.set(e.createdById, arr);
  }

  const anomalies: DetectedAnomaly[] = [];
  for (const [userId, list] of byUser.entries()) {
    if (list.length > config.maxCount) {
      const first = list[0];
      if (!first) continue;
      anomalies.push({
        type: 'REPEATED_URGENCY',
        severity: 'HIGH',
        title:
          'Urgences repetees : ' +
          list.length +
          ' FD_URGENCE en ' +
          config.windowDays +
          ' jours par utilisateur ' +
          userId,
        description:
          'L\'utilisateur a soumis ' +
          list.length +
          ' demandes urgence (seuil : ' +
          config.maxCount +
          ') en ' +
          config.windowDays +
          ' jours - non-conformite structurelle (cadre §7).',
        entityId: first.entityId,
        evidence: {
          userId,
          count: list.length,
          expenseRequestIds: list.map((e) => e.id),
        },
      });
    }
  }

  return anomalies;
}
