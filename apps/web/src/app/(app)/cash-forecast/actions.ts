'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  PaymentStatus,
  RoleCode,
  AnomalyType,
  AnomalySeverity,
  CashFlowCategory,
  CashFlowDirection,
} from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { notifyHoldingRole } from '@/lib/notifications/send';
import {
  buildProjection,
  detectRuptures,
  daysUntilFirstRupture,
} from '@/lib/cash-forecast/projection';
import { getWeekStart } from '@/lib/cash-forecast/week-math';

// =============================================================================
// ADD MANUAL INFLOW (entree projetee)
// =============================================================================

const inflowSchema = z.object({
  entityId: z.string().cuid(),
  weekStart: z.string(), // ISO date
  category: z.nativeEnum(CashFlowCategory).default(CashFlowCategory.REVENUE),
  label: z.string().min(2).max(200),
  amount: z.coerce.number().positive(),
  expectedDate: z.string(),
  currency: z.string().length(3).toUpperCase().default('XOF'),
});

export async function addManualInflow(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.TRESORIER_GROUPE,
      RoleCode.FP_AND_A,
      RoleCode.DAF_PAYS,
    ]);
  } catch {
    return { ok: false, error: 'Privilege Tresorerie / FP&A requis' };
  }

  const parsed = inflowSchema.safeParse({
    entityId: formData.get('entityId'),
    weekStart: formData.get('weekStart'),
    category: formData.get('category') ?? CashFlowCategory.REVENUE,
    label: formData.get('label'),
    amount: formData.get('amount'),
    expectedDate: formData.get('expectedDate'),
    currency: formData.get('currency') ?? 'XOF',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const weekStart = getWeekStart(new Date(parsed.data.weekStart));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  // Trouver / creer le CashForecast header pour cette semaine + entite
  const forecast = await prisma.cashForecast.upsert({
    where: {
      entityId_projectId_weekStart: {
        entityId: parsed.data.entityId,
        projectId: null as never, // Prisma nullable composite key
        weekStart,
      },
    },
    create: {
      entityId: parsed.data.entityId,
      weekStart,
      weekEnd,
      currency: parsed.data.currency,
      openingCash: 0,
      projectedInflow: parsed.data.amount,
      projectedOutflow: 0,
      closingCash: parsed.data.amount,
    },
    update: {
      projectedInflow: { increment: parsed.data.amount },
      closingCash: { increment: parsed.data.amount },
    },
  });

  await prisma.cashForecastLine.create({
    data: {
      cashForecastId: forecast.id,
      category: parsed.data.category,
      direction: CashFlowDirection.INFLOW,
      label: parsed.data.label,
      amount: parsed.data.amount,
      expectedDate: new Date(parsed.data.expectedDate),
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'CashForecast',
    entityId: forecast.id,
    action: AuditAction.CASH_FORECAST_LINE_ADDED,
    actorId: session.user.id,
    payload: {
      weekStart: weekStart.toISOString(),
      label: parsed.data.label,
      amount: parsed.data.amount,
      direction: 'INFLOW',
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/cash-forecast');
  return { ok: true };
}

// =============================================================================
// UPDATE OPENING CASH (cash de depart)
// =============================================================================

const openingSchema = z.object({
  entityId: z.string().cuid(),
  amount: z.coerce.number(),
  currency: z.string().length(3).toUpperCase().default('XOF'),
});

export async function setOpeningCash(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.TRESORIER_GROUPE,
      RoleCode.FP_AND_A,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = openingSchema.safeParse({
    entityId: formData.get('entityId'),
    amount: formData.get('amount'),
    currency: formData.get('currency') ?? 'XOF',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const weekStart = getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  await prisma.cashForecast.upsert({
    where: {
      entityId_projectId_weekStart: {
        entityId: parsed.data.entityId,
        projectId: null as never,
        weekStart,
      },
    },
    create: {
      entityId: parsed.data.entityId,
      weekStart,
      weekEnd,
      currency: parsed.data.currency,
      openingCash: parsed.data.amount,
      closingCash: parsed.data.amount,
    },
    update: { openingCash: parsed.data.amount },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'CashForecast',
    entityId: parsed.data.entityId,
    action: AuditAction.CASH_FORECAST_UPDATED,
    actorId: session.user.id,
    payload: { openingCash: parsed.data.amount, currency: parsed.data.currency },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/cash-forecast');
  return { ok: true };
}

// =============================================================================
// RUN RUPTURE DETECTION + NOTIFY DFG
// =============================================================================

const detectSchema = z.object({ entityId: z.string().cuid() });

export async function runRuptureDetection(
  formData: FormData,
): Promise<{ ok: boolean; alertCount?: number; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.TRESORIER_GROUPE,
      RoleCode.FP_AND_A,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = detectSchema.safeParse({ entityId: formData.get('entityId') });
  if (!parsed.success) return { ok: false, error: 'entityId invalide' };

  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 13 * 7);

  // Charge les donnees
  const [forecastRow, scheduledPayments, approvedInvoices, manualLines] = await Promise.all([
    prisma.cashForecast.findFirst({
      where: { entityId: parsed.data.entityId, weekStart: getWeekStart(now) },
      select: { openingCash: true, currency: true },
    }),
    prisma.payment.findMany({
      where: {
        entityId: parsed.data.entityId,
        status: PaymentStatus.SCHEDULED,
        scheduledAt: { gte: now, lte: horizonEnd },
      },
      select: { id: true, amount: true, scheduledAt: true, currency: true },
    }),
    prisma.invoice.findMany({
      where: {
        entityId: parsed.data.entityId,
        status: { in: ['APPROVED', 'PARTIALLY_PAID'] },
        dueDate: { not: null, gte: now, lte: horizonEnd } as never,
      },
      select: {
        id: true,
        totalTtc: true,
        amountPaid: true,
        dueDate: true,
        currency: true,
      },
    }),
    prisma.cashForecastLine.findMany({
      where: {
        cashForecast: { entityId: parsed.data.entityId },
        direction: CashFlowDirection.INFLOW,
        expectedDate: { gte: now, lte: horizonEnd } as never,
      },
      select: { amount: true, label: true, expectedDate: true, cashForecast: { select: { currency: true } } },
    }),
  ]);

  const openingCash = forecastRow ? Number(forecastRow.openingCash.toString()) : 0;
  const currency = forecastRow?.currency ?? 'XOF';

  const projection = buildProjection({
    fromDate: now,
    openingCash,
    weeks: 13,
    payments: scheduledPayments.map((p) => ({
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
    manualInflows: manualLines.map((l) => ({
      expectedDate: l.expectedDate!,
      amount: Number(l.amount.toString()),
      label: l.label,
      currency: l.cashForecast.currency,
    })),
    currency,
  });

  const alerts = detectRuptures(projection);
  const horizon = daysUntilFirstRupture(projection, now);

  const { ip, userAgent } = await getRequestActorContext();

  if (alerts.length > 0) {
    const first = alerts.find((a) => a.isFirstRupture);
    if (first) {
      // Cree une Anomaly (eviter doublons : skip si la meme existe < 7 jours)
      const recentAnomaly = await prisma.anomaly.findFirst({
        where: {
          entityId: parsed.data.entityId,
          type: AnomalyType.OTHER,
          detectionRule: 'CASH_RUPTURE_PROJECTED',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
        },
        select: { id: true },
      });

      if (!recentAnomaly) {
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
            entityId: parsed.data.entityId,
            title:
              'Rupture de tresorerie projetee a J+' +
              horizon +
              ' (deficit ' +
              first.deficit.toFixed(0) +
              ' ' +
              currency +
              ')',
            description:
              'Le cash forecast 13 semaines projette ' +
              alerts.length +
              ' semaine(s) en rupture. Premiere rupture S' +
              first.weekIndex +
              ' (' +
              first.weekStart.toISOString().slice(0, 10) +
              ') avec deficit de ' +
              first.deficit.toFixed(0) +
              ' ' +
              currency +
              '.',
            detectionRule: 'CASH_RUPTURE_PROJECTED',
            evidence: JSON.parse(
              JSON.stringify({
                horizonDays: horizon,
                alerts: alerts.map((a) => ({
                  weekIndex: a.weekIndex,
                  weekStart: a.weekStart.toISOString(),
                  deficit: a.deficit,
                })),
              }),
            ),
          },
        });

        await appendAudit({
          entityType: 'CashForecast',
          entityId: parsed.data.entityId,
          action: AuditAction.CASH_RUPTURE_DETECTED,
          actorId: session.user.id,
          payload: {
            horizonDays: horizon,
            alertCount: alerts.length,
            firstDeficit: first.deficit,
            anomalyId: anomaly.id,
          },
          ip,
          userAgent,
        }).catch(() => undefined);

        // Notification DFG + Tresorier
        await notifyHoldingRole(RoleCode.DFG, {
          title: 'Rupture cash projetee J+' + horizon,
          body: anomaly.title,
          linkUrl: '/cash-forecast',
          entityType: 'Anomaly',
          entityId: anomaly.id,
        }).catch(() => undefined);
        await notifyHoldingRole(RoleCode.TRESORIER_GROUPE, {
          title: 'Rupture cash projetee J+' + horizon,
          body: anomaly.title,
          linkUrl: '/cash-forecast',
          entityType: 'Anomaly',
          entityId: anomaly.id,
        }).catch(() => undefined);
      }
    }
  }

  revalidatePath('/cash-forecast');
  return { ok: true, alertCount: alerts.length };
}
