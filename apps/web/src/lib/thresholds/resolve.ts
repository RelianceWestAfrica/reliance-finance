// =============================================================================
// Thresholds - Resolution du seuil applicable
// =============================================================================
// Regle de priorite (cf. cadre §5, §6, ADR 0001) :
//   1. Seuil specifique a l'entite, actif a la date courante
//   2. Sinon, seuil global (entityId = null), actif a la date courante
//   3. Sinon, null (le caller doit lever une erreur metier)
//
// Logique pure testable. La couche I/O est dans `lookup.ts`.
// =============================================================================

import type { ThresholdType } from '@reliance-finance/database';

export interface ThresholdRecord {
  id: string;
  type: ThresholdType;
  entityId: string | null;
  amount: { toString(): string } | null;
  value: { toString(): string } | null;
  currency: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
}

/**
 * Filtre une liste de thresholds candidats (deja recuperes en DB) et renvoie
 * celui qui s'applique a (type, entityId, now).
 */
export function resolveThreshold(
  type: ThresholdType,
  entityId: string | null,
  candidates: ThresholdRecord[],
  now: Date = new Date(),
): ThresholdRecord | null {
  const matching = candidates.filter(
    (c) =>
      c.type === type &&
      c.isActive &&
      c.effectiveFrom <= now &&
      (c.effectiveTo === null || c.effectiveTo > now),
  );

  // 1) Specifique entite
  if (entityId) {
    const specific = matching
      .filter((c) => c.entityId === entityId)
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
    if (specific[0]) return specific[0];
  }

  // 2) Global
  const global = matching
    .filter((c) => c.entityId === null)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return global[0] ?? null;
}

/**
 * Helper d'extraction du montant numerique (Prisma Decimal -> number) avec
 * fallback explicite sur la propriete `value` pour les seuils non-monetaires
 * (heures, pourcentages).
 */
export function thresholdAmount(record: ThresholdRecord): number | null {
  if (record.amount !== null) return Number(record.amount.toString());
  if (record.value !== null) return Number(record.value.toString());
  return null;
}
