// =============================================================================
// Tenancy - Logique de mutation des `where` de Prisma
// =============================================================================
// Fonctions PURES (sans I/O) injectables dans l'extension Prisma et testables
// en unitaire isole.
// =============================================================================

import { tenancyField } from './models.js';

/**
 * Ajoute un filtre `entityId in [...]` (ou `id in [...]` pour le modele Entity)
 * a un `where` Prisma existant, en preservant les conditions de l'appelant.
 */
export function buildTenancyWhere(
  model: string,
  existingWhere: Record<string, unknown> | undefined,
  visibleEntityIds: string[],
): Record<string, unknown> {
  const field = tenancyField(model);
  const tenancyClause = { [field]: { in: visibleEntityIds } };

  if (!existingWhere || Object.keys(existingWhere).length === 0) {
    return tenancyClause;
  }

  // Si le caller a deja un AND, on le complete proprement
  if (Array.isArray(existingWhere.AND)) {
    return {
      ...existingWhere,
      AND: [...(existingWhere.AND as unknown[]), tenancyClause],
    };
  }

  // Sinon on enveloppe les conditions existantes dans un AND avec notre clause
  return {
    AND: [existingWhere, tenancyClause],
  };
}

/**
 * Pour un `findUnique` ou `findUniqueOrThrow`, Prisma exige un where pointant
 * sur une cle unique sans operateur compose. On ne peut pas y injecter notre
 * clause AND. La strategie est de laisser passer la requete, puis de filtrer
 * le resultat a posteriori.
 */
export function postFilterUniqueResult<T extends { [k: string]: unknown }>(
  model: string,
  result: T | null,
  visibleEntityIds: string[],
): T | null {
  if (!result) return null;
  const field = tenancyField(model);
  const value = result[field];
  if (typeof value !== 'string') return null;
  return visibleEntityIds.includes(value) ? result : null;
}
