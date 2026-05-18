'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma, RoleCode } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';

const addSchema = z.object({
  userId: z.string().cuid(),
  entityId: z.string().cuid(),
  role: z.nativeEnum(RoleCode),
});

export async function addMembership(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = addSchema.safeParse({
    userId: formData.get('userId'),
    entityId: formData.get('entityId'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { ok: false, error: 'Donnees invalides' };

  const [user, entity] = await Promise.all([
    prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, email: true },
    }),
    prisma.entity.findUnique({
      where: { id: parsed.data.entityId },
      select: { id: true, code: true },
    }),
  ]);
  if (!user || !entity) return { ok: false, error: 'User ou entite introuvable' };

  const existing = await prisma.membership.findUnique({
    where: {
      userId_entityId_role: {
        userId: parsed.data.userId,
        entityId: parsed.data.entityId,
        role: parsed.data.role,
      },
    },
  });
  if (existing && existing.isActive) {
    return { ok: false, error: 'Ce role est deja actif pour cet utilisateur sur cette entite.' };
  }

  await prisma.membership.upsert({
    where: {
      userId_entityId_role: {
        userId: parsed.data.userId,
        entityId: parsed.data.entityId,
        role: parsed.data.role,
      },
    },
    create: {
      userId: parsed.data.userId,
      entityId: parsed.data.entityId,
      role: parsed.data.role,
      isActive: true,
    },
    update: { isActive: true },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Membership',
    entityId: parsed.data.userId,
    action: AuditAction.MEMBERSHIP_ADDED,
    actorId: session.user.id,
    payload: {
      userId: parsed.data.userId,
      userEmail: user.email,
      entityId: parsed.data.entityId,
      entityCode: entity.code,
      role: parsed.data.role,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/memberships');
  return { ok: true };
}

const revokeSchema = z.object({ membershipId: z.string().cuid() });

export async function revokeMembership(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = revokeSchema.safeParse({ membershipId: formData.get('membershipId') });
  if (!parsed.success) return { ok: false, error: 'Donnees invalides' };

  const membership = await prisma.membership.findUnique({
    where: { id: parsed.data.membershipId },
    include: {
      user: { select: { email: true } },
      entity: { select: { code: true } },
    },
  });
  if (!membership) return { ok: false, error: 'Membership introuvable' };

  await prisma.membership.update({
    where: { id: parsed.data.membershipId },
    data: { isActive: false },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Membership',
    entityId: membership.userId,
    action: AuditAction.MEMBERSHIP_REVOKED,
    actorId: session.user.id,
    payload: {
      userEmail: membership.user.email,
      entityCode: membership.entity.code,
      role: membership.role,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/memberships');
  return { ok: true };
}
