// =============================================================================
// Cron : /api/cron/activate-quarantines
// =============================================================================
// Active les RIB en quarantaine dont la fenetre de 24h est echue (M3).
// A planifier toutes les 15 minutes.
// =============================================================================

import { NextResponse } from 'next/server';

import { prisma, BankAccountChangeStatus } from '@reliance-finance/database';

import { checkCronAuth } from '@/lib/cron/auth';
import { appendAudit, AuditAction } from '@/lib/audit/log';

export async function POST(req: Request) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const now = new Date();
  const matured = await prisma.bankAccountChangeRequest.findMany({
    where: {
      status: BankAccountChangeStatus.QUARANTINE,
      quarantineUntil: { lte: now },
    },
    select: { id: true, supplierId: true },
  });

  for (const c of matured) {
    await prisma.bankAccountChangeRequest.update({
      where: { id: c.id },
      data: { status: BankAccountChangeStatus.ACTIVE },
    });
    await appendAudit({
      entityType: 'BankAccountChangeRequest',
      entityId: c.id,
      action: AuditAction.BANK_ACCOUNT_CHANGE_ACTIVATED,
      actorId: null,
      payload: { source: 'cron', supplierId: c.supplierId, activatedAt: now.toISOString() },
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    activated: matured.length,
    timestamp: now.toISOString(),
  });
}
