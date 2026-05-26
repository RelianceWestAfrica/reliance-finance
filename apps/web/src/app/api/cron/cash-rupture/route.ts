// =============================================================================
// Cron : /api/cron/cash-rupture
// =============================================================================
// Detecte les ruptures projetees a 13 semaines pour TOUTES les entites.
// Cree Anomaly + notifie DFG/Tresorier si rupture < J+15. A planifier
// 1x/jour (matin).
// =============================================================================

import { NextResponse } from 'next/server';

import {
  prisma,
  PaymentStatus,
  CashFlowDirection,
  AnomalyType,
  AnomalySeverity,
  RoleCode,
} from '@reliance-finance/database';

import { checkCronAuth } from '@/lib/cron/auth';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { notifyHoldingRole } from '@/lib/notifications/send';
import {
  buildProjection,
  detectRuptures,
  daysUntilFirstRupture,
} from '@/lib/cash-forecast/projection';
import { getWeekStart } from '@/lib/cash-forecast/week-math';

export async function POST(req: Request) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const entities = await prisma.entity.findMany({
    where: { isActive: true },
    select: { id: true, code: true, defaultCurrency: true },
  });

  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 13 * 7);

  const results: { entity: string; alerts: number; horizonDays: number | null }[] = [];

  for (const entity of entities) {
    const [forecastRow, scheduledPayments, approvedInvoices, manualLines] = await Promise.all([
      prisma.cashForecast.findFirst({
        where: { entityId: entity.id, weekStart: getWeekStart(now) },
        select: { openingCash: true, currency: true },
      }),
      prisma.payment.findMany({
        where: {
          entityId: entity.id,
          status: PaymentStatus.SCHEDULED,
          scheduledAt: { gte: now, lte: horizonEnd },
        },
        select: { id: true, amount: true, scheduledAt: true, currency: true },
      }),
      prisma.invoice.findMany({
        where: {
          entityId: entity.id,
          status: { in: ['APPROVED', 'PARTIALLY_PAID'] },
          dueDate: { not: null, gte: now, lte: horizonEnd } as never,
        },
        select: { id: true, totalTtc: true, amountPaid: true, dueDate: true, currency: true },
      }),
      prisma.cashForecastLine.findMany({
        where: {
          cashForecast: { entityId: entity.id },
          direction: CashFlowDirection.INFLOW,
          expectedDate: { gte: now, lte: horizonEnd } as never,
        },
        select: {
          amount: true,
          label: true,
          expectedDate: true,
          cashForecast: { select: { currency: true } },
        },
      }),
    ]);

    const openingCash = forecastRow ? Number(forecastRow.openingCash.toString()) : 0;
    const currency = forecastRow?.currency ?? entity.defaultCurrency;

    const projection = buildProjection({
      fromDate: now,
      openingCash,
      weeks: 13,
      payments: scheduledPayments
        .filter((p) => p.scheduledAt)
        .map((p) => ({
          id: p.id,
          amount: Number(p.amount.toString()),
          scheduledAt: p.scheduledAt!,
          currency: p.currency,
        })),
      invoices: approvedInvoices.map((i) => ({
        id: i.id,
        amountDue: Number(i.totalTtc.toString()) - Number(i.amountPaid.toString()),
        dueDate: i.dueDate,
        currency: i.currency,
      })),
      manualInflows: manualLines
        .filter((l) => l.expectedDate)
        .map((l) => ({
          expectedDate: l.expectedDate!,
          amount: Number(l.amount.toString()),
          label: l.label,
          currency: l.cashForecast.currency,
        })),
      currency,
    });

    const alerts = detectRuptures(projection);
    const horizon = daysUntilFirstRupture(projection, now);

    if (alerts.length > 0) {
      const first = alerts.find((a) => a.isFirstRupture);
      if (first) {
        const recent = await prisma.anomaly.findFirst({
          where: {
            entityId: entity.id,
            type: AnomalyType.OTHER,
            detectionRule: 'CASH_RUPTURE_PROJECTED/cron',
            createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
          },
        });

        if (!recent) {
          const anomaly = await prisma.anomaly.create({
            data: {
              reference:
                'ANO-' +
                now.getFullYear() +
                '-' +
                String(now.getMonth() + 1).padStart(2, '0') +
                '-' +
                crypto.randomUUID().slice(0, 8).toUpperCase(),
              type: AnomalyType.OTHER,
              severity:
                horizon !== null && horizon <= 14 ? AnomalySeverity.CRITICAL : AnomalySeverity.HIGH,
              entityId: entity.id,
              title:
                'Rupture cash projetee J+' +
                horizon +
                ' (' +
                entity.code +
                ', deficit ' +
                first.deficit.toFixed(0) +
                ' ' +
                currency +
                ')',
              description:
                'Cron quotidien : ' +
                alerts.length +
                ' semaine(s) en rupture detectee(s). Premiere : S' +
                first.weekIndex +
                ' (' +
                first.weekStart.toISOString().slice(0, 10) +
                ').',
              detectionRule: 'CASH_RUPTURE_PROJECTED/cron',
              evidence: JSON.parse(
                JSON.stringify({
                  horizonDays: horizon,
                  alertCount: alerts.length,
                  deficit: first.deficit,
                }),
              ),
            },
          });

          await appendAudit({
            entityType: 'CashForecast',
            entityId: entity.id,
            action: AuditAction.CASH_RUPTURE_DETECTED,
            actorId: null,
            payload: { source: 'cron', horizonDays: horizon, anomalyId: anomaly.id },
          }).catch(() => undefined);

          await notifyHoldingRole(RoleCode.DFG, {
            title: 'Rupture cash projetee J+' + horizon,
            body: anomaly.title,
            linkUrl: '/cash-forecast?entityId=' + entity.id,
            entityType: 'Anomaly',
            entityId: anomaly.id,
          }).catch(() => undefined);
        }
      }
    }

    results.push({ entity: entity.code, alerts: alerts.length, horizonDays: horizon });
  }

  return NextResponse.json({
    ok: true,
    entities: entities.length,
    results,
    timestamp: now.toISOString(),
  });
}
