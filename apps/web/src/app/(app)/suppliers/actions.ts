'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  RoleCode,
  SupplierSensitivity,
  SupplierStatus,
} from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import {
  getUserMemberships,
  requireAnyRole,
  hasAnyRole,
} from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';

const baseSupplierFields = {
  entityId: z.string().cuid(),
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, 'Code MAJUSCULES, chiffres, _ ou -')
    .toUpperCase()
    .trim(),
  name: z.string().min(2).max(200).trim(),
  rccm: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  ifu: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  phone: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  address: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
  country: z
    .string()
    .length(2)
    .toUpperCase()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  sensitivity: z.nativeEnum(SupplierSensitivity).default(SupplierSensitivity.STANDARD),
  isStrategic: z.coerce.boolean().default(false),
  notes: z.string().max(2000).optional().or(z.literal('').transform(() => undefined)),
  // RIB initial (optionnel - on peut creer le supplier et le RIB plus tard)
  bankName: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
  holderName: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
  iban: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  rib: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  swift: z.string().max(20).optional().or(z.literal('').transform(() => undefined)),
  currency: z.string().length(3).toUpperCase().default('XOF'),
};

const createSchema = z.object(baseSupplierFields);

export async function createSupplier(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.DAF_PAYS,
      RoleCode.AP_OFFICER,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant pour creer un fournisseur' };
  }

  const parsed = createSchema.safeParse({
    entityId: formData.get('entityId'),
    code: formData.get('code'),
    name: formData.get('name'),
    rccm: formData.get('rccm') ?? undefined,
    ifu: formData.get('ifu') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    address: formData.get('address') ?? undefined,
    country: formData.get('country') ?? undefined,
    sensitivity: formData.get('sensitivity') ?? SupplierSensitivity.STANDARD,
    isStrategic: formData.get('isStrategic') === 'on',
    notes: formData.get('notes') ?? undefined,
    bankName: formData.get('bankName') ?? undefined,
    holderName: formData.get('holderName') ?? undefined,
    iban: formData.get('iban') ?? undefined,
    rib: formData.get('rib') ?? undefined,
    swift: formData.get('swift') ?? undefined,
    currency: formData.get('currency') ?? 'XOF',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const existing = await prisma.supplier.findUnique({
    where: { entityId_code: { entityId: parsed.data.entityId, code: parsed.data.code } },
  });
  if (existing) return { ok: false, error: 'Code fournisseur deja utilise pour cette entite' };

  const hasInitialRib = parsed.data.bankName && parsed.data.holderName && (parsed.data.iban || parsed.data.rib);

  const created = await prisma.supplier.create({
    data: {
      entityId: parsed.data.entityId,
      code: parsed.data.code,
      name: parsed.data.name,
      rccm: parsed.data.rccm,
      ifu: parsed.data.ifu,
      email: parsed.data.email,
      phone: parsed.data.phone,
      address: parsed.data.address,
      country: parsed.data.country,
      sensitivity: parsed.data.sensitivity,
      isStrategic: parsed.data.isStrategic,
      status: SupplierStatus.ACTIVE,
      notes: parsed.data.notes,
      createdById: session.user.id,
      ...(hasInitialRib
        ? {
            bankAccounts: {
              create: [
                {
                  bankName: parsed.data.bankName!,
                  holderName: parsed.data.holderName!,
                  iban: parsed.data.iban,
                  rib: parsed.data.rib,
                  swift: parsed.data.swift,
                  currency: parsed.data.currency,
                  country: parsed.data.country,
                  isPrimary: true,
                  isActive: true,
                  // RIB initial : marque NON verifie - le DAF Pays devra le verifier
                  // dans l'UI bank-accounts
                },
              ],
            },
          }
        : {}),
    },
    include: { bankAccounts: true },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Supplier',
    entityId: created.id,
    action: AuditAction.SUPPLIER_CREATED,
    actorId: session.user.id,
    payload: {
      code: created.code,
      name: created.name,
      entityId: created.entityId,
      sensitivity: created.sensitivity,
      isStrategic: created.isStrategic,
      hasInitialBankAccount: hasInitialRib,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  if (created.bankAccounts[0]) {
    await appendAudit({
      entityType: 'BankAccount',
      entityId: created.bankAccounts[0].id,
      action: AuditAction.BANK_ACCOUNT_CREATED,
      actorId: session.user.id,
      payload: {
        supplierId: created.id,
        bankName: created.bankAccounts[0].bankName,
        holderName: created.bankAccounts[0].holderName,
        iban: parsed.data.iban,
        rib: parsed.data.rib,
        currency: parsed.data.currency,
        verifiedAtCreation: false,
      },
      ip,
      userAgent,
    }).catch(() => undefined);
  }

  revalidatePath('/suppliers');
  return { ok: true, id: created.id };
}

const updateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(2).max(200).trim(),
  rccm: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  ifu: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  phone: z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
  address: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
  country: z
    .string()
    .length(2)
    .toUpperCase()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  sensitivity: z.nativeEnum(SupplierSensitivity),
  isStrategic: z.coerce.boolean().default(false),
  notes: z.string().max(2000).optional().or(z.literal('').transform(() => undefined)),
});

export async function updateSupplier(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.DAF_PAYS,
      RoleCode.AP_OFFICER,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    rccm: formData.get('rccm') ?? undefined,
    ifu: formData.get('ifu') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    address: formData.get('address') ?? undefined,
    country: formData.get('country') ?? undefined,
    sensitivity: formData.get('sensitivity'),
    isStrategic: formData.get('isStrategic') === 'on',
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const before = await prisma.supplier.findUnique({ where: { id: parsed.data.id } });
  if (!before) return { ok: false, error: 'Fournisseur introuvable' };

  const sensitivityChanged = before.sensitivity !== parsed.data.sensitivity;

  const updated = await prisma.supplier.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      rccm: parsed.data.rccm,
      ifu: parsed.data.ifu,
      email: parsed.data.email,
      phone: parsed.data.phone,
      address: parsed.data.address,
      country: parsed.data.country,
      sensitivity: parsed.data.sensitivity,
      isStrategic: parsed.data.isStrategic,
      notes: parsed.data.notes,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();

  await appendAudit({
    entityType: 'Supplier',
    entityId: updated.id,
    action: AuditAction.SUPPLIER_UPDATED,
    actorId: session.user.id,
    payload: {
      changes: {
        name: { from: before.name, to: updated.name },
        sensitivity: { from: before.sensitivity, to: updated.sensitivity },
        isStrategic: { from: before.isStrategic, to: updated.isStrategic },
      },
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  // Si la sensibilite change, log dedie pour tracabilite (cadre §6.3)
  if (sensitivityChanged) {
    await appendAudit({
      entityType: 'Supplier',
      entityId: updated.id,
      action: AuditAction.SUPPLIER_SENSITIVITY_CHANGED,
      actorId: session.user.id,
      payload: { from: before.sensitivity, to: updated.sensitivity },
      ip,
      userAgent,
    }).catch(() => undefined);
  }

  // Pour les operations sur fournisseurs sensibles/strategiques, exiger un role Groupe
  // (cadre §6.3 - controle renforce) - garde a posteriori via audit only en M3,
  // verification a l'execution paiement en M10.
  if (
    (updated.sensitivity === SupplierSensitivity.STRATEGIC || updated.isStrategic) &&
    !hasAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.FINANCE_GROUPE,
    ])
  ) {
    // Note d'avertissement - non bloquant a ce stade
    console.warn(
      'WARN: fournisseur strategique modifie par role non-Groupe. ' +
        'A verifier par le DFG.',
    );
  }

  revalidatePath('/suppliers');
  revalidatePath('/suppliers/' + updated.id);
  return { ok: true };
}

const archiveSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(5).max(500),
});

export async function archiveSupplier(
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

  const parsed = archiveSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  await prisma.supplier.update({
    where: { id: parsed.data.id },
    data: {
      status: SupplierStatus.ARCHIVED,
      archivedAt: new Date(),
      archivedById: session.user.id,
      archiveReason: parsed.data.reason,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Supplier',
    entityId: parsed.data.id,
    action: AuditAction.SUPPLIER_ARCHIVED,
    actorId: session.user.id,
    payload: { reason: parsed.data.reason },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/suppliers');
  return { ok: true };
}
