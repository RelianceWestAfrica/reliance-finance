// =============================================================================
// 3-way match - BC vs PV vs Facture (cadre §5 etape 2)
// =============================================================================
// Compare 3 documents pour detecter incoherences :
//   - Quantites : Facture <= Reception <= BC
//   - Prix unitaire (par ligne) : tolerance configurable (defaut 5%)
//   - Total : tolerance 1% sur le subtotalHt
//
// Logique PURE : prend des snapshots des 3 documents, renvoie un verdict
// structure avec liste des discrepancies. Le caller (Server Action) persiste
// le resultat dans ThreeWayMatch + cree des Anomaly si necessaire.
// =============================================================================

export interface POItem {
  position: number;
  description: string;
  quantity: number;
  unitPrice: number;
  totalHt: number;
}

export interface ReceptionItem {
  position: number;
  description: string;
  quantityExpected: number;
  quantityReceived: number;
  isCompliant: boolean;
}

export interface InvoiceLine {
  position: number;
  description: string;
  quantity: number;
  unitPrice: number;
  totalHt: number;
}

export type DiscrepancyType =
  | 'QUANTITY_OVER_BC'
  | 'QUANTITY_OVER_RECEPTION'
  | 'PRICE_VARIANCE'
  | 'TOTAL_VARIANCE'
  | 'MISSING_ITEM_BC'
  | 'MISSING_ITEM_RECEPTION'
  | 'RECEPTION_NOT_COMPLIANT';

export interface Discrepancy {
  type: DiscrepancyType;
  position?: number;
  description?: string;
  expected?: number;
  actual?: number;
  variancePercent?: number;
  message: string;
}

export interface MatchConfig {
  /** Tolerance prix par ligne (decimal, ex 0.05 = 5%) */
  pricePerLineTolerance: number;
  /** Tolerance total subtotalHt (decimal) */
  totalTolerance: number;
  /** Si true, exige une Reception. Si false, match BC vs Facture seulement. */
  requiresReception: boolean;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  pricePerLineTolerance: 0.05,
  totalTolerance: 0.01,
  requiresReception: true,
};

export interface MatchResult {
  ok: boolean;
  quantityMatch: boolean;
  priceMatch: boolean;
  totalMatch: boolean;
  discrepancies: Discrepancy[];
}

/**
 * Calcule l'ecart relatif (en valeur absolue) entre deux valeurs.
 * |a - b| / max(|a|, |b|), borne entre 0 et 1.
 */
export function relativeVariance(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
}

export function threeWayMatch(
  bc: POItem[],
  reception: ReceptionItem[] | null,
  invoice: InvoiceLine[],
  invoiceSubtotalHt: number,
  bcSubtotalHt: number,
  config: MatchConfig = DEFAULT_MATCH_CONFIG,
): MatchResult {
  const discrepancies: Discrepancy[] = [];
  let quantityMatch = true;
  let priceMatch = true;

  // Index BC et Reception par position pour acces rapide
  const bcByPosition = new Map(bc.map((i) => [i.position, i]));
  const receptionByPosition = new Map((reception ?? []).map((i) => [i.position, i]));

  // Pour chaque ligne facture
  for (const invLine of invoice) {
    const bcItem = bcByPosition.get(invLine.position);
    const recItem = receptionByPosition.get(invLine.position);

    // Verifier que la ligne facture existe dans le BC
    if (!bcItem) {
      discrepancies.push({
        type: 'MISSING_ITEM_BC',
        position: invLine.position,
        description: invLine.description,
        message:
          'Ligne facture position ' +
          invLine.position +
          ' absente du BC (' +
          invLine.description +
          ')',
      });
      quantityMatch = false;
      priceMatch = false;
      continue;
    }

    // Verifier quantite : facture ne doit pas depasser le BC
    if (invLine.quantity > bcItem.quantity) {
      discrepancies.push({
        type: 'QUANTITY_OVER_BC',
        position: invLine.position,
        description: invLine.description,
        expected: bcItem.quantity,
        actual: invLine.quantity,
        message:
          'Quantite facturee (' +
          invLine.quantity +
          ') > quantite BC (' +
          bcItem.quantity +
          ') a la ligne ' +
          invLine.position,
      });
      quantityMatch = false;
    }

    // Verifier quantite vs reception (si requise)
    if (config.requiresReception) {
      if (!recItem) {
        discrepancies.push({
          type: 'MISSING_ITEM_RECEPTION',
          position: invLine.position,
          description: invLine.description,
          message:
            'Ligne facture position ' +
            invLine.position +
            ' absente du PV de reception',
        });
        quantityMatch = false;
      } else {
        if (invLine.quantity > recItem.quantityReceived) {
          discrepancies.push({
            type: 'QUANTITY_OVER_RECEPTION',
            position: invLine.position,
            description: invLine.description,
            expected: recItem.quantityReceived,
            actual: invLine.quantity,
            message:
              'Quantite facturee (' +
              invLine.quantity +
              ') > quantite recue (' +
              recItem.quantityReceived +
              ') a la ligne ' +
              invLine.position,
          });
          quantityMatch = false;
        }
        if (!recItem.isCompliant) {
          discrepancies.push({
            type: 'RECEPTION_NOT_COMPLIANT',
            position: invLine.position,
            description: invLine.description,
            message:
              'Ligne ' +
              invLine.position +
              ' marquee non-conforme dans le PV (paiement bloque)',
          });
        }
      }
    }

    // Verifier prix unitaire avec tolerance
    const priceVariance = relativeVariance(invLine.unitPrice, bcItem.unitPrice);
    if (priceVariance > config.pricePerLineTolerance) {
      discrepancies.push({
        type: 'PRICE_VARIANCE',
        position: invLine.position,
        description: invLine.description,
        expected: bcItem.unitPrice,
        actual: invLine.unitPrice,
        variancePercent: Math.round(priceVariance * 10000) / 100,
        message:
          'Ecart prix unitaire ' +
          (Math.round(priceVariance * 10000) / 100) +
          '% (> ' +
          config.pricePerLineTolerance * 100 +
          '%) a la ligne ' +
          invLine.position +
          ' : BC ' +
          bcItem.unitPrice +
          ' vs facture ' +
          invLine.unitPrice,
      });
      priceMatch = false;
    }
  }

  // Verifier ecart total subtotalHt
  const totalVariance = relativeVariance(invoiceSubtotalHt, bcSubtotalHt);
  const totalMatch = totalVariance <= config.totalTolerance;
  if (!totalMatch) {
    discrepancies.push({
      type: 'TOTAL_VARIANCE',
      expected: bcSubtotalHt,
      actual: invoiceSubtotalHt,
      variancePercent: Math.round(totalVariance * 10000) / 100,
      message:
        'Ecart total HT ' +
        (Math.round(totalVariance * 10000) / 100) +
        '% (> ' +
        config.totalTolerance * 100 +
        '%) : BC ' +
        bcSubtotalHt +
        ' vs facture ' +
        invoiceSubtotalHt,
    });
  }

  return {
    ok: quantityMatch && priceMatch && totalMatch,
    quantityMatch,
    priceMatch,
    totalMatch,
    discrepancies,
  };
}
