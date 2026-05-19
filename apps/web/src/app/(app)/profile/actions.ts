'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';

import { ALLOWED_TIMEZONES, ALLOWED_LOCALES } from './constants';

const schema = z.object({
  name: z.string().min(2).max(100).trim().optional().or(z.literal('').transform(() => undefined)),
  preferredTimezone: z.enum(ALLOWED_TIMEZONES),
  preferredLocale: z.enum(ALLOWED_LOCALES),
});

export async function updatePreferences(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = schema.safeParse({
    name: formData.get('name') ?? undefined,
    preferredTimezone: formData.get('preferredTimezone'),
    preferredLocale: formData.get('preferredLocale'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const before = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, preferredTimezone: true, preferredLocale: true },
  });
  if (!before) return { ok: false, error: 'Utilisateur introuvable' };

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name ?? before.name,
      preferredTimezone: parsed.data.preferredTimezone,
      preferredLocale: parsed.data.preferredLocale,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'User',
    entityId: session.user.id,
    action: AuditAction.USER_PREFERENCES_UPDATED,
    actorId: session.user.id,
    payload: {
      changes: {
        name: { from: before.name, to: parsed.data.name ?? before.name },
        preferredTimezone: { from: before.preferredTimezone, to: parsed.data.preferredTimezone },
        preferredLocale: { from: before.preferredLocale, to: parsed.data.preferredLocale },
      },
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/profile');
  return { ok: true };
}
