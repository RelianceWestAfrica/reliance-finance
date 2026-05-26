'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma, RoleCode } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;

const createSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[0-9]+$/, 'Code SYSCOHADA : chiffres uniquement')
    .trim(),
  label: z.string().min(3).max(200).trim(),
  classCode: z.string().min(1).max(2).trim(),
  className: z.string().min(2).max(200).trim(),
  type: z.enum(ACCOUNT_TYPES),
});

export async function createChartAccount(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.CHIEF_ACCOUNTANT]);
  } catch {
    return {
      ok: false,
      error: 'Privilege requis : ADMIN, DFG ou Chief Accountant',
    };
  }

  const parsed = createSchema.safeParse({
    code: formData.get('code'),
    label: formData.get('label'),
    classCode: formData.get('classCode'),
    className: formData.get('className'),
    type: formData.get('type'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const exists = await prisma.chartAccount.findUnique({
    where: { code: parsed.data.code },
  });
  if (exists) return { ok: false, error: 'Compte deja existant : ' + parsed.data.code };

  const created = await prisma.chartAccount.create({ data: parsed.data });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'ChartAccount',
    entityId: created.id,
    action: AuditAction.CHART_ACCOUNT_CREATED,
    actorId: session.user.id,
    payload: { ...parsed.data },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/chart-accounts');
  return { ok: true };
}

export async function toggleChartAccount(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.CHIEF_ACCOUNTANT]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const code = String(formData.get('code') ?? '');
  if (!code) return { ok: false, error: 'Code manquant' };

  const existing = await prisma.chartAccount.findUnique({ where: { code } });
  if (!existing) return { ok: false, error: 'Compte introuvable' };

  const updated = await prisma.chartAccount.update({
    where: { code },
    data: { isActive: !existing.isActive },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'ChartAccount',
    entityId: updated.id,
    action: AuditAction.CHART_ACCOUNT_TOGGLED,
    actorId: session.user.id,
    payload: { code, from: existing.isActive, to: updated.isActive },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/chart-accounts');
  return { ok: true };
}
