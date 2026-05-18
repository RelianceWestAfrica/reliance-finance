// =============================================================================
// Cron : /api/cron/control-checks
// =============================================================================
// Execute toutes les regles de detection (M13) sur l'ensemble des donnees.
// A planifier toutes les heures (cf. docker-compose.prod.yml service `cron`).
// =============================================================================

import { NextResponse } from 'next/server';

import {
  prisma,
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  ExpenseRequestType,
} from '@reliance-finance/database';

import { checkCronAuth } from '@/lib/cron/auth';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import {
  detectDuplicateInvoices,
  detectPaymentFractioning,
  detectMissingPV,
  detectStaleDrafts,
  detectRepeatedUrgency,
  type DetectedAnomaly,
} from '@/lib/control-checks/rules';

function nextRef(prefix: string): string {
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

export async function POST(req: Request) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

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

  const detected: DetectedAnomaly[] = [
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
    ...detectRepeatedUrgency(
      emergencies.map((e) => ({
        id: e.id,
        entityId: e.entityId,
        createdById: e.createdById,
        createdAt: e.createdAt,
      })),
    ),
  ];

  // Dedup vs Anomaly OPEN/INVESTIGATING existantes
  let created = 0;
  for (const a of detected) {
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
        reference: nextRef('ANO'),
        type: a.type as AnomalyType,
        severity: a.severity as AnomalySeverity,
        entityId: a.entityId,
        expenseRequestId: a.expenseRequestId,
        invoiceId: a.invoiceId,
        paymentId: a.paymentId,
        supplierId: a.supplierId,
        title: a.title,
        description: a.description,
        detectionRule: a.type + '/cron-control-checks',
        evidence: JSON.parse(JSON.stringify(a.evidence)),
      },
    });
    created++;
  }

  await appendAudit({
    entityType: 'ControlCheck',
    entityId: 'cron',
    action: AuditAction.CONTROL_CHECKS_RUN,
    actorId: null,
    payload: { source: 'cron', detectedCount: detected.length, createdCount: created },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    detected: detected.length,
    created,
    timestamp: new Date().toISOString(),
  });
}
