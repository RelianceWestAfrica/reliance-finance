// =============================================================================
// Pont financier - Acteur systeme
// =============================================================================
// Les dossiers crees par le pont sont attribues a un compte de service dedie
// (pas de session NextAuth). L'humain reel cote source est conserve dans la
// provenance (originRef) + upstreamValidations + l'audit log.
// =============================================================================

import { prisma } from '@reliance-finance/database';

const BRIDGE_SYSTEM_EMAIL = 'bridge-system@rwa-core.com';

/** Retourne l'id du compte de service du pont, le creant si absent. */
export async function ensureBridgeSystemUser(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: BRIDGE_SYSTEM_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: BRIDGE_SYSTEM_EMAIL,
      name: 'Pont inter-plateformes (systeme)',
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}
