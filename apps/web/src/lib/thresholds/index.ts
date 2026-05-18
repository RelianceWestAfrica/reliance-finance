// =============================================================================
// Thresholds - API publique
// =============================================================================

import { prisma, ThresholdType } from '@reliance-finance/database';
import { resolveThreshold, thresholdAmount, type ThresholdRecord } from './resolve.js';

export { resolveThreshold, thresholdAmount } from './resolve.js';
export type { ThresholdRecord } from './resolve.js';

/**
 * Recupere le seuil applicable pour (type, entityId) a la date courante.
 * I/O wrapper autour de `resolveThreshold`.
 */
export async function getActiveThreshold(
  type: ThresholdType,
  entityId: string | null = null,
): Promise<ThresholdRecord | null> {
  const candidates = await prisma.threshold.findMany({
    where: {
      type,
      OR: [{ entityId }, { entityId: null }],
    },
  });
  return resolveThreshold(type, entityId, candidates as ThresholdRecord[]);
}

/**
 * Sucre syntaxique : renvoie directement le montant en number.
 */
export async function getActiveThresholdAmount(
  type: ThresholdType,
  entityId: string | null = null,
): Promise<number | null> {
  const record = await getActiveThreshold(type, entityId);
  if (!record) return null;
  return thresholdAmount(record);
}
