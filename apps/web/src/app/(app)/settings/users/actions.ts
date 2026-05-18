'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma, RoleCode } from '@reliance-finance/database';
import { auth, signIn } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { ValidationError, BusinessRuleError } from '@/lib/errors';

const inviteSchema = z.object({
  email: z.string().email('Email invalide').max(254).toLowerCase().trim(),
  name: z.string().min(2, 'Nom requis (2 caracteres min)').max(100).trim(),
  entityId: z.string().cuid('Entite invalide'),
  role: z.nativeEnum(RoleCode),
});

export type InviteResult =
  | { ok: true; userId: string; sent: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function inviteUser(formData: FormData): Promise<InviteResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Authentification requise' };
  }

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant (ADMIN ou DFG requis)' };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    entityId: formData.get('entityId'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Donnees invalides',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { email, name, entityId, role } = parsed.data;
  const { ip, userAgent } = await getRequestActorContext();

  // Verifie l'existence preliminaire pour eviter de creer un user en collision
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, hashedPassword: true },
  });
  if (existing) {
    return {
      ok: false,
      error: 'Un utilisateur avec cet email existe deja.',
    };
  }

  // Verifie que l'entite existe
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, code: true },
  });
  if (!entity) {
    return { ok: false, error: 'Entite introuvable' };
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name,
        isActive: true,
        // hashedPassword: null intentionnel - sera defini via /set-password
      },
      select: { id: true, email: true, name: true },
    });

    await tx.membership.create({
      data: { userId: user.id, entityId, role, isActive: true },
    });

    return user;
  });

  await appendAudit({
    entityType: 'User',
    entityId: created.id,
    action: AuditAction.USER_INVITED,
    actorId: session.user.id,
    payload: { email, name, role, entityId, entityCode: entity.code },
    ip,
    userAgent,
  }).catch(() => undefined);

  await appendAudit({
    entityType: 'Membership',
    entityId: created.id,
    action: AuditAction.MEMBERSHIP_ADDED,
    actorId: session.user.id,
    payload: { userId: created.id, role, entityId, entityCode: entity.code },
    ip,
    userAgent,
  }).catch(() => undefined);

  // Envoi du magic link via NextAuth Email Provider
  let sent = false;
  try {
    await signIn('nodemailer', {
      email,
      redirect: false,
      redirectTo: '/set-password',
    });
    sent = true;
  } catch (error) {
    console.warn('Echec envoi email magic link', error);
  }

  revalidatePath('/settings/users');
  return { ok: true, userId: created.id, sent };
}

const deactivateSchema = z.object({ userId: z.string().cuid() });

export async function deactivateUser(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Authentification requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = deactivateSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return { ok: false, error: 'Donnees invalides' };

  if (parsed.data.userId === session.user.id) {
    return { ok: false, error: 'Impossible de se desactiver soi-meme' };
  }

  const { ip, userAgent } = await getRequestActorContext();
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { isActive: false },
  });

  await appendAudit({
    entityType: 'User',
    entityId: parsed.data.userId,
    action: AuditAction.USER_DEACTIVATED,
    actorId: session.user.id,
    payload: {},
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/users');
  return { ok: true };
}

// Helpers internes utilises par d'autres pages (revoke membership)
export type _Unused = typeof BusinessRuleError | typeof ValidationError;
