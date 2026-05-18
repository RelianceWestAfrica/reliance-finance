// =============================================================================
// Tenancy - Helpers Server Components / Server Actions
// =============================================================================
// Usage type :
//
//   import { getTenantedDb } from '@/lib/tenancy';
//
//   export default async function Page() {
//     const db = await getTenantedDb();
//     const requests = await db.expenseRequest.findMany(); // <- auto-filtre
//   }
//
// =============================================================================

import { cache } from 'react';
import { prisma } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { getUserMemberships, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { tenancyExtension } from './extension.js';

export { tenancyExtension } from './extension.js';
export { buildTenancyWhere, postFilterUniqueResult } from './filter.js';
export { TENANT_SCOPED_MODELS, isTenantScoped, tenancyField } from './models.js';

/**
 * Renvoie un client Prisma encapsule par l'extension de tenancy, configure
 * avec les entites visibles par l'utilisateur courant.
 *
 * - Cache par requete via React `cache()` : meme client retourne pour tous
 *   les Server Components d'une meme requete.
 * - Lance `UnauthorizedError` si non-authentifie.
 * - Lance `ForbiddenError` si l'utilisateur n'a aucun membership actif.
 */
export const getTenantedDb = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  const memberships = await getUserMemberships(session.user.id);
  const visibleEntityIds = Array.from(new Set(memberships.map((m) => m.entityId)));

  if (visibleEntityIds.length === 0) {
    throw new ForbiddenError(
      'Aucune entite accessible. Contactez un administrateur pour vous attribuer un role.',
    );
  }

  return prisma.$extends(tenancyExtension({ visibleEntityIds }));
});

/**
 * Renvoie le client Prisma BRUT (sans tenancy), reserve aux operations
 * privilegiees (admin systeme, jobs cron, audit). N'oubliez pas de filtrer
 * manuellement.
 */
export function getRawDb() {
  return prisma;
}
