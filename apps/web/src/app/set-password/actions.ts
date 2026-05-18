'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import argon2 from 'argon2';

import { prisma } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';

const schema = z
  .object({
    password: z
      .string()
      .min(12, '12 caracteres minimum')
      .max(128, 'Trop long')
      .refine((v) => /[A-Z]/.test(v), 'Au moins 1 majuscule')
      .refine((v) => /[a-z]/.test(v), 'Au moins 1 minuscule')
      .refine((v) => /[0-9]/.test(v), 'Au moins 1 chiffre'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  });

export type SetPasswordResult =
  | { ok: false; error: string }
  | { ok: true };

export async function setPasswordAction(formData: FormData): Promise<SetPasswordResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Session expiree, reconnectez-vous.' };
  }

  const parsed = schema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'Donnees invalides' };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, hashedPassword: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return { ok: false, error: 'Compte introuvable ou desactive.' };
  }

  const hashed = await argon2.hash(parsed.data.password, {
    type: argon2.argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19456),
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { hashedPassword: hashed, emailVerified: new Date() },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'User',
    entityId: user.id,
    action: user.hashedPassword ? AuditAction.PASSWORD_CHANGE : AuditAction.PASSWORD_SET,
    actorId: user.id,
    payload: {},
    ip,
    userAgent,
  }).catch(() => undefined);

  redirect('/dashboard');
}
