// =============================================================================
// Garde commune pour les Route Handlers PDF
// =============================================================================
// Verifie auth + tenancy + retourne l'utilisateur + ses memberships pour
// que chaque endpoint /api/[resource]/[id]/pdf puisse autoriser/refuser
// rapidement.
// =============================================================================

import { NextResponse } from 'next/server';

import { RoleCode } from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, hasAnyRole, type MembershipSummary } from '@/lib/rbac';

export interface PdfAuthOk {
  ok: true;
  userId: string;
  memberships: MembershipSummary[];
  hasGroupRole: boolean;
}

export interface PdfAuthDeny {
  ok: false;
  response: Response;
}

export async function requirePdfAuth(): Promise<PdfAuthOk | PdfAuthDeny> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Auth requise' }, { status: 401 }),
    };
  }

  const memberships = await getUserMemberships(session.user.id);
  const hasGroupRole = hasAnyRole(memberships, [
    RoleCode.ADMIN,
    RoleCode.DFG,
    RoleCode.AG,
    RoleCode.AUDITEUR,
    RoleCode.FINANCE_GROUPE,
    RoleCode.TRESORIER_GROUPE,
    RoleCode.CONTROLEUR_INTERNE,
  ]);

  return { ok: true, userId: session.user.id, memberships, hasGroupRole };
}

export function assertEntityVisible(
  auth: PdfAuthOk,
  entityId: string,
): Response | null {
  if (auth.hasGroupRole) return null;
  const visible = new Set(auth.memberships.map((m) => m.entityId));
  if (!visible.has(entityId)) {
    return NextResponse.json({ error: 'Ressource hors scope' }, { status: 403 });
  }
  return null;
}
