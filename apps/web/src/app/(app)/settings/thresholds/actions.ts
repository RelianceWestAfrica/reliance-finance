'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma, RoleCode, ThresholdType } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';

const createSchema = z
  .object({
    type: z.nativeEnum(ThresholdType),
    entityId: z
      .string()
      .cuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    amount: z.coerce
      .number()
      .min(0)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    value: z.coerce
      .number()
      .min(0)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    currency: z.string().length(3).toUpperCase().default('XOF'),
    description: z
      .string()
      .max(500)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .refine((d) => d.amount !== undefined || d.value !== undefined, {
    message: 'Renseignez amount (XOF) ou value (heures/pourcentage)',
  });

/**
 * "Replace" : cree un nouveau seuil avec effectiveFrom = now et cloture
 * l'ancien actif (effectiveTo = now, isActive = false). Versioning natif.
 */
export async function replaceThreshold(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    // Seuls le DFG et l'ADMIN peuvent modifier les seuils (cadre §3, §5)
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege ADMIN ou DFG requis' };
  }

  const parsed = createSchema.safeParse({
    type: formData.get('type'),
    entityId: formData.get('entityId') ?? undefined,
    amount: formData.get('amount') ?? undefined,
    value: formData.get('value') ?? undefined,
    currency: formData.get('currency') ?? 'XOF',
    description: formData.get('description') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    // Cloture les seuils actifs du meme type + meme scope (entityId)
    const closed = await tx.threshold.updateMany({
      where: {
        type: parsed.data.type,
        entityId: parsed.data.entityId ?? null,
        isActive: true,
      },
      data: { effectiveTo: now, isActive: false },
    });

    const created = await tx.threshold.create({
      data: {
        type: parsed.data.type,
        entityId: parsed.data.entityId,
        amount: parsed.data.amount,
        value: parsed.data.value,
        currency: parsed.data.amount !== undefined ? parsed.data.currency : null,
        description: parsed.data.description,
        effectiveFrom: now,
        isActive: true,
      },
    });
    return { created, closed: closed.count };
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Threshold',
    entityId: result.created.id,
    action: result.closed > 0 ? AuditAction.THRESHOLD_REPLACED : AuditAction.THRESHOLD_CREATED,
    actorId: session.user.id,
    payload: {
      type: parsed.data.type,
      entityId: parsed.data.entityId,
      amount: parsed.data.amount,
      value: parsed.data.value,
      currency: parsed.data.currency,
      description: parsed.data.description,
      closedPreviousCount: result.closed,
      effectiveFrom: now.toISOString(),
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/thresholds');
  return { ok: true };
}

export async function deactivateThreshold(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const now = new Date();
  await prisma.threshold.update({
    where: { id },
    data: { isActive: false, effectiveTo: now },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Threshold',
    entityId: id,
    action: AuditAction.THRESHOLD_DEACTIVATED,
    actorId: session.user.id,
    payload: { effectiveTo: now.toISOString() },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/thresholds');
  return { ok: true };
}
