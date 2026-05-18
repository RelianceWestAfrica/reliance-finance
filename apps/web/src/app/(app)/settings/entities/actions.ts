'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma, RoleCode, EntityKind } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';

const createSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, 'Code en MAJUSCULES, chiffres, _ ou -')
    .toUpperCase()
    .trim(),
  name: z.string().min(2).max(200).trim(),
  kind: z.nativeEnum(EntityKind),
  country: z.string().length(2).toUpperCase().optional().or(z.literal('').transform(() => undefined)),
  defaultCurrency: z.string().min(3).max(3).toUpperCase().default('XOF'),
  parentEntityId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
  rccm: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  ifu: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  address: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
});

export async function createEntity(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege ADMIN ou DFG requis' };
  }

  const parsed = createSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    kind: formData.get('kind'),
    country: formData.get('country') ?? undefined,
    defaultCurrency: formData.get('defaultCurrency') ?? 'XOF',
    parentEntityId: formData.get('parentEntityId') ?? undefined,
    rccm: formData.get('rccm') ?? undefined,
    ifu: formData.get('ifu') ?? undefined,
    address: formData.get('address') ?? undefined,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'Donnees invalides' };
  }

  // Cas particulier : Holding ne peut pas avoir de parent
  if (parsed.data.kind === EntityKind.HOLDING && parsed.data.parentEntityId) {
    return { ok: false, error: 'Une Holding ne peut pas avoir d\'entite parente' };
  }
  // Subsidiary et SPV doivent avoir un parent
  if (parsed.data.kind !== EntityKind.HOLDING && !parsed.data.parentEntityId) {
    return {
      ok: false,
      error: 'Une Filiale ou un SPV doit etre rattache a une entite parente',
    };
  }

  // Verifie qu'aucune Holding existe deja si on tente d'en creer une
  if (parsed.data.kind === EntityKind.HOLDING) {
    const existing = await prisma.entity.findFirst({
      where: { kind: EntityKind.HOLDING, isActive: true },
    });
    if (existing) {
      return {
        ok: false,
        error: 'Une Holding active existe deja (' + existing.code + '). Un seul Groupe est supporte.',
      };
    }
  }

  const exists = await prisma.entity.findUnique({ where: { code: parsed.data.code } });
  if (exists) {
    return { ok: false, error: 'Code deja utilise par une autre entite (' + parsed.data.code + ')' };
  }

  const created = await prisma.entity.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      kind: parsed.data.kind,
      country: parsed.data.country,
      defaultCurrency: parsed.data.defaultCurrency,
      parentEntityId: parsed.data.parentEntityId,
      rccm: parsed.data.rccm,
      ifu: parsed.data.ifu,
      address: parsed.data.address,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Entity',
    entityId: created.id,
    action: AuditAction.ENTITY_CREATED,
    actorId: session.user.id,
    payload: {
      code: created.code,
      name: created.name,
      kind: created.kind,
      country: created.country,
      parentEntityId: created.parentEntityId,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/entities');
  return { ok: true };
}

const updateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(2).max(200).trim(),
  country: z.string().length(2).toUpperCase().optional().or(z.literal('').transform(() => undefined)),
  defaultCurrency: z.string().min(3).max(3).toUpperCase(),
  rccm: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  ifu: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  address: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
});

export async function updateEntity(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    country: formData.get('country') ?? undefined,
    defaultCurrency: formData.get('defaultCurrency'),
    rccm: formData.get('rccm') ?? undefined,
    ifu: formData.get('ifu') ?? undefined,
    address: formData.get('address') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const before = await prisma.entity.findUnique({ where: { id: parsed.data.id } });
  if (!before) return { ok: false, error: 'Entite introuvable' };

  const updated = await prisma.entity.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      country: parsed.data.country,
      defaultCurrency: parsed.data.defaultCurrency,
      rccm: parsed.data.rccm,
      ifu: parsed.data.ifu,
      address: parsed.data.address,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Entity',
    entityId: updated.id,
    action: AuditAction.ENTITY_UPDATED,
    actorId: session.user.id,
    payload: {
      changes: {
        name: { from: before.name, to: updated.name },
        country: { from: before.country, to: updated.country },
        defaultCurrency: { from: before.defaultCurrency, to: updated.defaultCurrency },
        rccm: { from: before.rccm, to: updated.rccm },
        ifu: { from: before.ifu, to: updated.ifu },
        address: { from: before.address, to: updated.address },
      },
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/entities');
  return { ok: true };
}

const archiveSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(5).max(500),
});

export async function archiveEntity(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = archiveSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  // Garde : on ne peut pas archiver une entite avec des enfants actifs
  const children = await prisma.entity.count({
    where: { parentEntityId: parsed.data.id, isActive: true },
  });
  if (children > 0) {
    return {
      ok: false,
      error:
        'Impossible d\'archiver : ' +
        children +
        ' entite(s) enfant(s) active(s). Archivez-les d\'abord.',
    };
  }

  await prisma.entity.update({
    where: { id: parsed.data.id },
    data: { isActive: false },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Entity',
    entityId: parsed.data.id,
    action: AuditAction.ENTITY_ARCHIVED,
    actorId: session.user.id,
    payload: { reason: parsed.data.reason },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/entities');
  return { ok: true };
}
