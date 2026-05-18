// =============================================================================
// Cron : /api/cron/stale-regularizations
// =============================================================================
// Detecte les FD_URGENCE non regularisees au-dela du SLA 72h (M4).
// A planifier toutes les heures.
// =============================================================================

import { NextResponse } from 'next/server';

import {
  prisma,
  ExpenseRequestType,
  ExpenseRequestStatus,
  AnomalyType,
  AnomalySeverity,
} from '@reliance-finance/database';

import { checkCronAuth } from '@/lib/cron/auth';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { isStaleRegularization } from '@/lib/expense-requests/emergency-guards';
import { notifyHoldingRole } from '@/lib/notifications/send';
import { RoleCode } from '@reliance-finance/database';

export async function POST(req: Request) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const now = new Date();
  const candidates = await prisma.expenseRequest.findMany({
    where: {
      type: ExpenseRequestType.FD_URGENCE,
      emergencyDeadlineAt: { lte: now },
      regularizedAt: null,
      status: { notIn: [ExpenseRequestStatus.ARCHIVED, ExpenseRequestStatus.CANCELLED] },
    },
    select: {
      id: true,
      reference: true,
      entityId: true,
      emergencyDeadlineAt: true,
      regularizedAt: true,
    },
  });

  let flagged = 0;
  for (const er of candidates) {
    if (!isStaleRegularization(er.emergencyDeadlineAt, er.regularizedAt, now)) continue;

    const existing = await prisma.anomaly.findFirst({
      where: { type: AnomalyType.REPEATED_URGENCY, expenseRequestId: er.id },
    });
    if (existing) continue;

    const anomaly = await prisma.anomaly.create({
      data: {
        reference:
          'ANO-' +
          now.getFullYear() +
          '-' +
          String(now.getMonth() + 1).padStart(2, '0') +
          '-' +
          crypto.randomUUID().slice(0, 8).toUpperCase(),
        type: AnomalyType.REPEATED_URGENCY,
        severity: AnomalySeverity.HIGH,
        entityId: er.entityId,
        expenseRequestId: er.id,
        title: 'FD_URGENCE non regularisee : ' + er.reference,
        description:
          'Le delai de regularisation (' +
          er.emergencyDeadlineAt?.toISOString() +
          ') est depasse. Cadre §7.',
        detectionRule: 'EMERGENCY_OVERDUE/cron',
        evidence: { deadlineAt: er.emergencyDeadlineAt?.toISOString(), checkedAt: now.toISOString() },
      },
    });

    await appendAudit({
      entityType: 'ExpenseRequest',
      entityId: er.id,
      action: AuditAction.EXPENSE_REQUEST_EMERGENCY_OVERDUE,
      actorId: null,
      payload: { source: 'cron', reference: er.reference, anomalyId: anomaly.id },
    }).catch(() => undefined);

    await notifyHoldingRole(RoleCode.CONTROLEUR_INTERNE, {
      title: 'Urgence non regularisee : ' + er.reference,
      body: anomaly.title,
      linkUrl: '/expense-requests/' + er.id,
      entityType: 'Anomaly',
      entityId: anomaly.id,
    }).catch(() => undefined);

    flagged++;
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    flagged,
    timestamp: now.toISOString(),
  });
}
