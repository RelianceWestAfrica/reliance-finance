'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  AnomalyStatus,
  AnomalyType,
  AnomalySeverity,
  ExpenseRequestType,
  RoleCode,
} from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole, hasAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import {
  detectDuplicateInvoices,
  detectPaymentFractioning,
  detectMissingPV,
  detectStaleDrafts,
  detectRepeatedUrgency,
  type DetectedAnomaly,
} from '@/lib/control-checks/rules';

// =============================================================================
// RUN CHECKS (orchestrateur)
// =============================================================================

function nextAnomalyReference(prefix: string): string {
  const now = new Date();
  return (
    prefix +
    '-' +
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    crypto.randomUUID().slice(0, 8).toUpperCase()
  );
}

export async function runControlChecks(): Promise<{
  ok: boolean;
  created?: number;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.CONTROLEUR_INTERNE]);
  } catch {
    return { ok: false, error: 'Privilege Controle Interne / DFG requis' };
  }

  // Recupere les jeux de donnees
  const [invoices, payments, draftErs, draftInvoices, emergencies] = await Promise.all([
    prisma.invoice.findMany({
      include: { supplier: { select: { code: true } }, reception: { select: { status: true } } },
    }),
    prisma.payment.findMany({
      where: { status: { in: ['EXECUTED', 'RECONCILED'] } },
      select: {
        id: true,
        entityId: true,
        invoiceId: true,
        amount: true,
        executedAt: true,
        invoice: { select: { supplierId: true } },
      },
    }),
    prisma.expenseRequest.findMany({
      where: { status: 'DRAFT' },
      select: { id: true, entityId: true, reference: true, createdAt: true },
    }),
    prisma.invoice.findMany({
      where: { status: 'RECEIVED' },
      select: { id: true, entityId: true, reference: true, createdAt: true },
    }),
    prisma.expenseRequest.findMany({
      where: { type: ExpenseRequestType.FD_URGENCE },
      select: { id: true, entityId: true, createdById: true, createdAt: true },
    }),
  ]);

  // Execute les regles pures
  const allAnomalies: DetectedAnomaly[] = [];

  allAnomalies.push(
    ...detectDuplicateInvoices(
      invoices.map((i) => ({
        id: i.id,
        entityId: i.entityId,
        supplierId: i.supplierId,
        supplierCode: i.supplier.code,
        invoiceNumber: i.invoiceNumber,
        totalTtc: Number(i.totalTtc.toString()),
        invoiceDate: i.invoiceDate,
      })),
    ),
  );

  allAnomalies.push(
    ...detectPaymentFractioning(
      payments.map((p) => ({
        id: p.id,
        entityId: p.entityId,
        supplierId: p.invoice?.supplierId ?? null,
        invoiceId: p.invoiceId,
        amount: Number(p.amount.toString()),
        executedAt: p.executedAt ?? new Date(),
      })),
    ),
  );

  allAnomalies.push(
    ...detectMissingPV(
      invoices.map((i) => ({
        id: i.id,
        entityId: i.entityId,
        reference: i.reference,
        status: i.status,
        hasReception: !!i.reception,
        receptionStatus: i.reception?.status ?? null,
      })),
    ),
  );

  allAnomalies.push(
    ...detectStaleDrafts(
      [
        ...draftErs.map((er) => ({
          id: er.id,
          entityId: er.entityId,
          reference: er.reference,
          resourceType: 'ExpenseRequest' as const,
          createdAt: er.createdAt,
        })),
        ...draftInvoices.map((inv) => ({
          id: inv.id,
          entityId: inv.entityId,
          reference: inv.reference,
          resourceType: 'Invoice' as const,
          createdAt: inv.createdAt,
        })),
      ],
      30,
    ),
  );

  allAnomalies.push(
    ...detectRepeatedUrgency(
      emergencies.map((e) => ({
        id: e.id,
        entityId: e.entityId,
        createdById: e.createdById,
        createdAt: e.createdAt,
      })),
    ),
  );

  // Pour chaque anomalie detectee, eviter les doublons (verifier si une
  // Anomaly OPEN du meme type + meme cible existe deja)
  let created = 0;
  for (const a of allAnomalies) {
    const existing = await prisma.anomaly.findFirst({
      where: {
        type: a.type as AnomalyType,
        status: { in: [AnomalyStatus.OPEN, AnomalyStatus.INVESTIGATING] },
        ...(a.expenseRequestId ? { expenseRequestId: a.expenseRequestId } : {}),
        ...(a.invoiceId ? { invoiceId: a.invoiceId } : {}),
        ...(a.paymentId ? { paymentId: a.paymentId } : {}),
        ...(a.supplierId ? { supplierId: a.supplierId } : {}),
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.anomaly.create({
      data: {
        reference: nextAnomalyReference('ANO'),
        type: a.type as AnomalyType,
        severity: a.severity as AnomalySeverity,
        entityId: a.entityId,
        expenseRequestId: a.expenseRequestId,
        invoiceId: a.invoiceId,
        paymentId: a.paymentId,
        supplierId: a.supplierId,
        title: a.title,
        description: a.description,
        detectionRule: a.type + '/run-control-checks',
        evidence: JSON.parse(JSON.stringify(a.evidence)),
      },
    });
    created++;
  }

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'ControlCheck',
    entityId: session.user.id,
    action: AuditAction.CONTROL_CHECKS_RUN,
    actorId: session.user.id,
    payload: { detectedCount: allAnomalies.length, createdCount: created },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/anomalies');
  return { ok: true, created };
}

// =============================================================================
// ASSIGN
// =============================================================================

const assignSchema = z.object({
  id: z.string().cuid(),
  assigneeId: z.string().cuid(),
});

export async function assignAnomaly(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.CONTROLEUR_INTERNE])) {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = assignSchema.safeParse({
    id: formData.get('id'),
    assigneeId: formData.get('assigneeId'),
  });
  if (!parsed.success) return { ok: false, error: 'Donnees invalides' };

  const anomaly = await prisma.anomaly.update({
    where: { id: parsed.data.id },
    data: { assigneeId: parsed.data.assigneeId, status: AnomalyStatus.INVESTIGATING },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Anomaly',
    entityId: parsed.data.id,
    action: AuditAction.ANOMALY_ASSIGNED,
    actorId: session.user.id,
    payload: { reference: anomaly.reference, assigneeId: parsed.data.assigneeId },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/anomalies/' + parsed.data.id);
  return { ok: true };
}

// =============================================================================
// RESOLVE / FALSE_POSITIVE / SANCTION_REQUESTED
// =============================================================================

const resolveSchema = z.object({
  id: z.string().cuid(),
  resolution: z.string().min(10).max(2000),
  outcome: z.enum(['RESOLVED', 'FALSE_POSITIVE', 'SANCTION_REQUESTED']),
});

export async function resolveAnomaly(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.CONTROLEUR_INTERNE])) {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = resolveSchema.safeParse({
    id: formData.get('id'),
    resolution: formData.get('resolution'),
    outcome: formData.get('outcome'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const statusMap: Record<string, AnomalyStatus> = {
    RESOLVED: AnomalyStatus.RESOLVED,
    FALSE_POSITIVE: AnomalyStatus.FALSE_POSITIVE,
    SANCTION_REQUESTED: AnomalyStatus.SANCTION_REQUESTED,
  };
  const actionMap: Record<string, string> = {
    RESOLVED: AuditAction.ANOMALY_RESOLVED,
    FALSE_POSITIVE: AuditAction.ANOMALY_FALSE_POSITIVE,
    SANCTION_REQUESTED: AuditAction.ANOMALY_SANCTION_REQUESTED,
  };

  const anomaly = await prisma.anomaly.update({
    where: { id: parsed.data.id },
    data: {
      status: statusMap[parsed.data.outcome]!,
      resolution: parsed.data.resolution,
      resolvedAt: new Date(),
      sanctionRequested: parsed.data.outcome === 'SANCTION_REQUESTED',
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Anomaly',
    entityId: parsed.data.id,
    action: actionMap[parsed.data.outcome] ?? AuditAction.ANOMALY_RESOLVED,
    actorId: session.user.id,
    payload: { reference: anomaly.reference, resolution: parsed.data.resolution },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/anomalies/' + parsed.data.id);
  return { ok: true };
}
