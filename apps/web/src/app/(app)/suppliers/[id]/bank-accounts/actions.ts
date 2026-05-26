'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  RoleCode,
  BankAccountChangeStatus,
  AnomalyType,
  AnomalySeverity,
} from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole, hasAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import {
  canApproveLevel1,
  canApproveLevel2,
  computeQuarantineUntil,
  N1_ROLES,
  N2_ROLES,
} from '@/lib/bank-accounts/change-validation';
import {
  detectSuspiciousRibChange,
  DEFAULT_CONFIG as ANOMALY_CONFIG,
} from '@/lib/bank-accounts/anomaly-detection';
import { notifyHoldingRole } from '@/lib/notifications/send';

const QUARANTINE_HOURS = Number(process.env.ANTI_FRAUD_RIB_QUARANTINE_HOURS ?? 24);

const requestChangeSchema = z.object({
  supplierId: z.string().cuid(),
  // L'ancien RIB (qui sera remplace) - identifie par son ID, optionnel pour creation
  oldBankAccountId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  newBankName: z.string().min(2).max(200).trim(),
  newHolderName: z.string().min(2).max(200).trim(),
  newIban: z
    .string()
    .max(50)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  newRib: z
    .string()
    .max(50)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  justification: z.string().min(10, 'Justification ecrite obligatoire (cadre §8)').max(2000),
});

export async function requestBankAccountChange(
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

  const parsed = requestChangeSchema.safeParse({
    supplierId: formData.get('supplierId'),
    oldBankAccountId: formData.get('oldBankAccountId') ?? undefined,
    newBankName: formData.get('newBankName'),
    newHolderName: formData.get('newHolderName'),
    newIban: formData.get('newIban') ?? undefined,
    newRib: formData.get('newRib') ?? undefined,
    justification: formData.get('justification'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  if (!parsed.data.newIban && !parsed.data.newRib) {
    return { ok: false, error: 'IBAN ou RIB requis' };
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: parsed.data.supplierId },
    select: {
      id: true,
      code: true,
      name: true,
      entityId: true,
      sensitivity: true,
      isStrategic: true,
    },
  });
  if (!supplier) return { ok: false, error: 'Fournisseur introuvable' };

  const oldAccount = parsed.data.oldBankAccountId
    ? await prisma.bankAccount.findUnique({ where: { id: parsed.data.oldBankAccountId } })
    : null;

  const created = await prisma.bankAccountChangeRequest.create({
    data: {
      supplierId: parsed.data.supplierId,
      bankAccountId: parsed.data.oldBankAccountId,
      oldIban: oldAccount?.iban,
      oldRib: oldAccount?.rib,
      newBankName: parsed.data.newBankName,
      newHolderName: parsed.data.newHolderName,
      newIban: parsed.data.newIban,
      newRib: parsed.data.newRib,
      justification: parsed.data.justification,
      status: BankAccountChangeStatus.REQUESTED,
      requestedById: session.user.id,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'BankAccountChangeRequest',
    entityId: created.id,
    action: 'bank_account_change.requested', // catalogue dans audit/types.ts comme BANK_ACCOUNT_CHANGE_REQUESTED
    actorId: session.user.id,
    payload: {
      supplierId: parsed.data.supplierId,
      supplierCode: supplier.code,
      oldIban: oldAccount?.iban,
      newIban: parsed.data.newIban,
      newRib: parsed.data.newRib,
      justification: parsed.data.justification,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  // Notifier les DFG et Tresorier Groupe que validation requise
  await Promise.all([
    notifyHoldingRole(RoleCode.DFG, {
      title: 'Changement RIB a valider',
      body:
        'Fournisseur ' + supplier.code + ' (' + supplier.name + ') : ' + parsed.data.justification,
      linkUrl: '/suppliers/' + supplier.id + '/bank-accounts',
      entityType: 'BankAccountChangeRequest',
      entityId: created.id,
    }),
    notifyHoldingRole(RoleCode.TRESORIER_GROUPE, {
      title: 'Changement RIB en attente N1',
      body: 'Fournisseur ' + supplier.code + ' (' + supplier.name + ')',
      linkUrl: '/suppliers/' + supplier.id + '/bank-accounts',
      entityType: 'BankAccountChangeRequest',
      entityId: created.id,
    }),
  ]).catch(() => undefined);

  revalidatePath('/suppliers/' + parsed.data.supplierId + '/bank-accounts');
  return { ok: true };
}

const approveSchema = z.object({ changeId: z.string().cuid() });

export async function approveChangeLevel1(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, N1_ROLES)) {
    return {
      ok: false,
      error: 'Privilege insuffisant pour validation N1 (DAF Pays ou Finance Filiale)',
    };
  }

  const parsed = approveSchema.safeParse({ changeId: formData.get('changeId') });
  if (!parsed.success) return { ok: false, error: 'changeId invalide' };

  const change = await prisma.bankAccountChangeRequest.findUnique({
    where: { id: parsed.data.changeId },
    include: { supplier: { select: { code: true, name: true } } },
  });
  if (!change) return { ok: false, error: 'Demande introuvable' };

  const verdict = canApproveLevel1(
    {
      status: change.status,
      requestedById: change.requestedById,
      approvedBy1Id: change.approvedBy1Id,
      approvedBy2Id: change.approvedBy2Id,
    },
    { id: session.user.id, memberships },
  );
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  const updated = await prisma.bankAccountChangeRequest.update({
    where: { id: parsed.data.changeId },
    data: {
      status: BankAccountChangeStatus.DUAL_VALIDATION_PENDING,
      approvedBy1Id: session.user.id,
      approvedBy1At: new Date(),
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'BankAccountChangeRequest',
    entityId: updated.id,
    action: AuditAction.BANK_ACCOUNT_CHANGE_APPROVED_1,
    actorId: session.user.id,
    payload: { supplierCode: change.supplier.code },
    ip,
    userAgent,
  }).catch(() => undefined);

  await notifyHoldingRole(RoleCode.DFG, {
    title: 'Validation N2 RIB requise',
    body: 'Le RIB du fournisseur ' + change.supplier.code + ' attend votre validation finale.',
    linkUrl: '/suppliers/' + change.supplierId + '/bank-accounts',
    entityType: 'BankAccountChangeRequest',
    entityId: updated.id,
  }).catch(() => undefined);

  revalidatePath('/suppliers/' + change.supplierId + '/bank-accounts');
  return { ok: true };
}

export async function approveChangeLevel2(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, N2_ROLES)) {
    return { ok: false, error: 'Privilege insuffisant pour validation N2 (Finance Groupe / DFG)' };
  }

  const parsed = approveSchema.safeParse({ changeId: formData.get('changeId') });
  if (!parsed.success) return { ok: false, error: 'changeId invalide' };

  const change = await prisma.bankAccountChangeRequest.findUnique({
    where: { id: parsed.data.changeId },
    include: {
      supplier: {
        select: {
          id: true,
          code: true,
          name: true,
          entityId: true,
          sensitivity: true,
          isStrategic: true,
          createdAt: true,
        },
      },
    },
  });
  if (!change) return { ok: false, error: 'Demande introuvable' };

  const verdict = canApproveLevel2(
    {
      status: change.status,
      requestedById: change.requestedById,
      approvedBy1Id: change.approvedBy1Id,
      approvedBy2Id: change.approvedBy2Id,
    },
    { id: session.user.id, memberships },
  );
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  const now = new Date();
  const quarantineUntil = computeQuarantineUntil(now, QUARANTINE_HOURS);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update change request -> QUARANTINE
    const updatedChange = await tx.bankAccountChangeRequest.update({
      where: { id: parsed.data.changeId },
      data: {
        status: BankAccountChangeStatus.QUARANTINE,
        approvedBy2Id: session.user.id,
        approvedBy2At: now,
        quarantineUntil,
      },
    });

    // 2. Si remplace un RIB existant, le desactiver
    if (change.bankAccountId) {
      await tx.bankAccount.update({
        where: { id: change.bankAccountId },
        data: { isActive: false, isPrimary: false },
      });
    }

    // 3. Creer le nouveau RIB avec quarantineUntil + verifiedAt = now
    //    (verifie car double validation effectuee - cadre §8 conformite)
    const newAccount = await tx.bankAccount.create({
      data: {
        supplierId: change.supplierId,
        bankName: change.newBankName ?? '',
        holderName: change.newHolderName,
        iban: change.newIban,
        rib: change.newRib,
        country: change.supplier.entityId ? undefined : undefined,
        currency: 'XOF',
        isPrimary: true,
        isActive: true,
        verifiedAt: now,
        verifiedById: session.user.id,
        verifiedMethod: 'DOUBLE_VALIDATION_DFG',
        quarantineUntil,
      },
    });

    return { updatedChange, newAccount };
  });

  const { ip, userAgent } = await getRequestActorContext();

  await appendAudit({
    entityType: 'BankAccountChangeRequest',
    entityId: result.updatedChange.id,
    action: AuditAction.BANK_ACCOUNT_CHANGE_APPROVED_2,
    actorId: session.user.id,
    payload: {
      supplierCode: change.supplier.code,
      newBankAccountId: result.newAccount.id,
      quarantineUntil: quarantineUntil.toISOString(),
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  await appendAudit({
    entityType: 'BankAccount',
    entityId: result.newAccount.id,
    action: AuditAction.BANK_ACCOUNT_VERIFIED,
    actorId: session.user.id,
    payload: {
      supplierId: change.supplier.id,
      bankName: result.newAccount.bankName,
      holderName: result.newAccount.holderName,
      iban: result.newAccount.iban,
      verifiedMethod: 'DOUBLE_VALIDATION_DFG',
      quarantineUntil: quarantineUntil.toISOString(),
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  // Detection anomalie - analyser tous les changements ACTIVE/QUARANTINE recents
  const allChanges = await prisma.bankAccountChangeRequest.findMany({
    where: {
      supplierId: change.supplierId,
      status: { in: [BankAccountChangeStatus.ACTIVE, BankAccountChangeStatus.QUARANTINE] },
    },
    select: { id: true, status: true, createdAt: true },
  });
  const verdict2 = detectSuspiciousRibChange(
    {
      isStrategic: change.supplier.isStrategic,
      createdAt: change.supplier.createdAt,
      sensitivity: change.supplier.sensitivity,
    },
    allChanges.map((c) => ({
      id: c.id,
      status: c.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
      createdAt: c.createdAt,
    })),
    now,
    ANOMALY_CONFIG,
  );

  if (verdict2.suspicious) {
    const anomaly = await prisma.anomaly.create({
      data: {
        reference:
          'ANO-' +
          now.getFullYear() +
          '-' +
          String(now.getMonth() + 1).padStart(2, '0') +
          '-' +
          crypto.randomUUID().slice(0, 8).toUpperCase(),
        type: AnomalyType.SUSPICIOUS_RIB_CHANGE,
        severity: verdict2.severity as AnomalySeverity,
        entityId: change.supplier.entityId,
        supplierId: change.supplierId,
        title:
          'Changement RIB suspect : ' + change.supplier.code + ' (' + change.supplier.name + ')',
        description: verdict2.reasons.join(' | '),
        detectionRule: 'SUSPICIOUS_RIB_CHANGE/auto-detect-on-approval',
        evidence: { reasons: verdict2.reasons, changeId: result.updatedChange.id },
      },
    });

    await appendAudit({
      entityType: 'Anomaly',
      entityId: anomaly.id,
      action: AuditAction.ANOMALY_DETECTED,
      actorId: null,
      payload: {
        type: AnomalyType.SUSPICIOUS_RIB_CHANGE,
        severity: verdict2.severity,
        reasons: verdict2.reasons,
        supplierId: change.supplierId,
        changeId: result.updatedChange.id,
      },
      ip,
      userAgent,
    }).catch(() => undefined);

    await notifyHoldingRole(RoleCode.CONTROLEUR_INTERNE, {
      title: 'Anomalie ' + verdict2.severity + ' detectee',
      body: anomaly.title,
      linkUrl: '/suppliers/' + change.supplierId + '/history',
      entityType: 'Anomaly',
      entityId: anomaly.id,
    }).catch(() => undefined);
  }

  revalidatePath('/suppliers/' + change.supplierId + '/bank-accounts');
  return { ok: true };
}

const rejectSchema = z.object({
  changeId: z.string().cuid(),
  reason: z.string().min(5).max(500),
});

export async function rejectChange(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, [...N1_ROLES, ...N2_ROLES, RoleCode.ADMIN])) {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = rejectSchema.safeParse({
    changeId: formData.get('changeId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const change = await prisma.bankAccountChangeRequest.update({
    where: { id: parsed.data.changeId },
    data: {
      status: BankAccountChangeStatus.REJECTED,
      rejectedReason: parsed.data.reason,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'BankAccountChangeRequest',
    entityId: change.id,
    action: AuditAction.BANK_ACCOUNT_CHANGE_REJECTED,
    actorId: session.user.id,
    payload: { reason: parsed.data.reason },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/suppliers/' + change.supplierId + '/bank-accounts');
  return { ok: true };
}

/**
 * Job a appeler par cron : pour chaque changement en QUARANTINE dont
 * quarantineUntil <= now, basculer en ACTIVE et journaliser.
 * Pour l'instant on l'expose comme Server Action manuelle (admin).
 */
export async function activateMatureQuarantines(): Promise<{ ok: boolean; activated: number }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, activated: 0 };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.TRESORIER_GROUPE])) {
    return { ok: false, activated: 0 };
  }

  const now = new Date();
  const candidates = await prisma.bankAccountChangeRequest.findMany({
    where: {
      status: BankAccountChangeStatus.QUARANTINE,
      quarantineUntil: { lte: now },
    },
    select: { id: true, supplierId: true },
  });

  for (const c of candidates) {
    await prisma.bankAccountChangeRequest.update({
      where: { id: c.id },
      data: { status: BankAccountChangeStatus.ACTIVE },
    });
    await appendAudit({
      entityType: 'BankAccountChangeRequest',
      entityId: c.id,
      action: AuditAction.BANK_ACCOUNT_CHANGE_ACTIVATED,
      actorId: session.user.id,
      payload: { supplierId: c.supplierId, activatedAt: now.toISOString() },
    }).catch(() => undefined);
  }

  revalidatePath('/suppliers');
  return { ok: true, activated: candidates.length };
}

export async function verifyExistingBankAccount(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  if (!hasAnyRole(memberships, [...N1_ROLES, ...N2_ROLES, RoleCode.ADMIN])) {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const account = await prisma.bankAccount.findUnique({
    where: { id },
    include: { supplier: { select: { id: true, code: true } } },
  });
  if (!account) return { ok: false, error: 'Compte introuvable' };

  const now = new Date();
  await prisma.bankAccount.update({
    where: { id },
    data: {
      verifiedAt: now,
      verifiedById: session.user.id,
      verifiedMethod: 'CALL_BACK',
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'BankAccount',
    entityId: id,
    action: AuditAction.BANK_ACCOUNT_VERIFIED,
    actorId: session.user.id,
    payload: {
      supplierId: account.supplier.id,
      supplierCode: account.supplier.code,
      method: 'CALL_BACK',
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/suppliers/' + account.supplierId + '/bank-accounts');
  return { ok: true };
}
