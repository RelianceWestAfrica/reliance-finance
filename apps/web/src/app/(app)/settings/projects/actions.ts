'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma, RoleCode } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';

const projectSchema = z.object({
  entityId: z.string().cuid(),
  code: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, 'Code en MAJUSCULES, chiffres, _ ou -')
    .toUpperCase()
    .trim(),
  name: z.string().min(2).max(200).trim(),
  description: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  budget: z.coerce
    .number()
    .min(0)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  currency: z.string().length(3).toUpperCase().default('XOF'),
  startDate: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  endDate: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export async function createProject(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.DAF_PAYS]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = projectSchema.safeParse({
    entityId: formData.get('entityId'),
    code: formData.get('code'),
    name: formData.get('name'),
    description: formData.get('description') ?? undefined,
    budget: formData.get('budget') ?? undefined,
    currency: formData.get('currency') ?? 'XOF',
    startDate: formData.get('startDate') ?? undefined,
    endDate: formData.get('endDate') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const existing = await prisma.project.findUnique({
    where: { entityId_code: { entityId: parsed.data.entityId, code: parsed.data.code } },
  });
  if (existing) return { ok: false, error: 'Code projet deja utilise pour cette entite' };

  const created = await prisma.project.create({
    data: {
      entityId: parsed.data.entityId,
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description,
      budget: parsed.data.budget,
      currency: parsed.data.currency,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Project',
    entityId: created.id,
    action: AuditAction.PROJECT_CREATED,
    actorId: session.user.id,
    payload: {
      code: created.code,
      name: created.name,
      entityId: created.entityId,
      budget: created.budget?.toString(),
      currency: created.currency,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/projects');
  return { ok: true };
}

export async function archiveProject(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.DAF_PAYS]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  await prisma.project.update({ where: { id }, data: { isActive: false } });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Project',
    entityId: id,
    action: AuditAction.PROJECT_ARCHIVED,
    actorId: session.user.id,
    payload: {},
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/projects');
  return { ok: true };
}

const costCenterSchema = z.object({
  entityId: z.string().cuid(),
  projectId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  code: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, 'Code en MAJUSCULES, chiffres, _ ou -')
    .toUpperCase(),
  name: z.string().min(2).max(200).trim(),
});

export async function createCostCenter(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.DAF_PAYS]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = costCenterSchema.safeParse({
    entityId: formData.get('entityId'),
    projectId: formData.get('projectId') ?? undefined,
    code: formData.get('code'),
    name: formData.get('name'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const existing = await prisma.costCenter.findUnique({
    where: { entityId_code: { entityId: parsed.data.entityId, code: parsed.data.code } },
  });
  if (existing) return { ok: false, error: 'Code centre de cout deja utilise pour cette entite' };

  const created = await prisma.costCenter.create({
    data: {
      entityId: parsed.data.entityId,
      projectId: parsed.data.projectId,
      code: parsed.data.code,
      name: parsed.data.name,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'CostCenter',
    entityId: created.id,
    action: AuditAction.COST_CENTER_CREATED,
    actorId: session.user.id,
    payload: {
      code: created.code,
      name: created.name,
      entityId: created.entityId,
      projectId: created.projectId,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/projects');
  return { ok: true };
}

export async function archiveCostCenter(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.DAF_PAYS]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  await prisma.costCenter.update({ where: { id }, data: { isActive: false } });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'CostCenter',
    entityId: id,
    action: AuditAction.COST_CENTER_ARCHIVED,
    actorId: session.user.id,
    payload: {},
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/settings/projects');
  return { ok: true };
}
