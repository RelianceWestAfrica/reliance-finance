import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getUserMemberships, hasAnyRole } from '@/lib/rbac';
import { verifyChain } from '@/lib/audit/log';
import { RoleCode } from '@reliance-finance/database';

export async function GET(
  _req: Request,
  context: { params: Promise<{ entityType: string; entityId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  const memberships = await getUserMemberships(session.user.id);
  const canVerify = hasAnyRole(memberships, [
    RoleCode.ADMIN,
    RoleCode.DFG,
    RoleCode.CONTROLEUR_INTERNE,
    RoleCode.AUDITEUR,
  ]);
  if (!canVerify) {
    return NextResponse.json({ error: 'Privilege insuffisant' }, { status: 403 });
  }

  const params = await context.params;
  const result = await verifyChain(params.entityType, params.entityId);

  return NextResponse.json(
    {
      entityType: params.entityType,
      entityId: params.entityId,
      verifiedBy: session.user.email,
      verifiedAt: new Date().toISOString(),
      ...result,
    },
    {
      status: result.ok ? 200 : 409,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
