'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  DocumentType,
  ReceptionStatus,
  ReceptionType,
  RoleCode,
  SignatureStage,
  PurchaseOrderStatus,
} from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { allocateReference } from '@/lib/document-sequence/allocate';
import { createSignature } from '@/lib/signatures/service';
import { canActorSignReception } from '@/lib/receptions/can-sign';

const STAGE_TO_SIGNATURE: Record<'OPS' | 'TECH' | 'FINANCE', SignatureStage> = {
  OPS: SignatureStage.RECEPTION_OPS,
  TECH: SignatureStage.RECEPTION_TECH,
  FINANCE: SignatureStage.RECEPTION_FINANCE,
};

const STAGE_TO_AUDIT: Record<'OPS' | 'TECH' | 'FINANCE', string> = {
  OPS: AuditAction.RECEPTION_SIGNED_OPS,
  TECH: AuditAction.RECEPTION_SIGNED_TECH,
  FINANCE: AuditAction.RECEPTION_SIGNED_FINANCE,
};

const createSchema = z.object({
  purchaseOrderId: z.string().cuid(),
  type: z.nativeEnum(ReceptionType).default(ReceptionType.GOODS),
  location: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  receptionDate: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  requiresTechnical: z.coerce.boolean().default(true),
});

export async function createReception(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = createSchema.safeParse({
    purchaseOrderId: formData.get('purchaseOrderId'),
    type: formData.get('type') ?? undefined,
    location: formData.get('location') ?? undefined,
    receptionDate: formData.get('receptionDate') ?? undefined,
    requiresTechnical: formData.get('requiresTechnical') === 'on',
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parsed.data.purchaseOrderId },
    include: {
      entity: { select: { id: true, code: true } },
      project: { select: { id: true, code: true } },
      items: { orderBy: { position: 'asc' } },
    },
  });
  if (!po) return { ok: false, error: 'BC introuvable' };

  // Le BC doit etre au moins SIGNED (cadre §6 : pas de reception sans engagement)
  if (
    po.status !== PurchaseOrderStatus.SIGNED &&
    po.status !== PurchaseOrderStatus.SENT_TO_SUPPLIER &&
    po.status !== PurchaseOrderStatus.PARTIAL
  ) {
    return {
      ok: false,
      error: 'BC doit etre signe avant reception (statut courant : ' + po.status + ')',
    };
  }

  const reference = await allocateReference({
    type: DocumentType.PV,
    entityId: po.entity.id,
    entityCode: po.entity.code,
    projectId: po.project?.id ?? null,
    projectCode: po.project?.code ?? null,
  });

  // Pre-remplit les items depuis le BC
  const created = await prisma.reception.create({
    data: {
      reference,
      type: parsed.data.type,
      status: ReceptionStatus.DRAFT,
      entityId: po.entityId,
      projectId: po.projectId,
      purchaseOrderId: po.id,
      createdById: session.user.id,
      location: parsed.data.location,
      receptionDate: parsed.data.receptionDate ? new Date(parsed.data.receptionDate) : new Date(),
      // Note : on stocke `requiresTechnical` dans `decision` faute de champ
      // dedie - une refactorisation propre serait d'ajouter un flag, mais
      // pour M7 on utilise `decision` qui n'est pas encore exploite ailleurs.
      decision: parsed.data.requiresTechnical ? 'REQUIRES_TECHNICAL' : 'NO_TECHNICAL',
      items: {
        create: po.items.map((item) => ({
          position: item.position,
          description: item.description,
          quantityExpected: Number(item.quantity.toString()),
          quantityReceived: Number(item.quantity.toString()), // a ajuster par le receveur
          isCompliant: true,
          purchaseOrderItemId: item.id,
        })),
      },
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Reception',
    entityId: created.id,
    action: AuditAction.RECEPTION_CREATED,
    actorId: session.user.id,
    payload: {
      reference,
      purchaseOrderId: po.id,
      purchaseOrderRef: po.reference,
      type: parsed.data.type,
      itemsCount: po.items.length,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/receptions');
  return { ok: true, id: created.id };
}

// =============================================================================
// UPDATE ITEM (quantite recue + conformite, DRAFT only)
// =============================================================================

const updateItemSchema = z.object({
  itemId: z.string().cuid(),
  quantityReceived: z.coerce.number().min(0),
  isCompliant: z.coerce.boolean().default(true),
  observations: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export async function updateReceptionItem(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = updateItemSchema.safeParse({
    itemId: formData.get('itemId'),
    quantityReceived: formData.get('quantityReceived'),
    isCompliant: formData.get('isCompliant') === 'on',
    observations: formData.get('observations') ?? undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const item = await prisma.receptionItem.findUnique({
    where: { id: parsed.data.itemId },
    include: { reception: { select: { id: true, status: true } } },
  });
  if (!item) return { ok: false, error: 'Item introuvable' };
  if (item.reception.status !== ReceptionStatus.DRAFT) {
    return { ok: false, error: 'PV verrouille (statut : ' + item.reception.status + ')' };
  }

  await prisma.receptionItem.update({
    where: { id: parsed.data.itemId },
    data: {
      quantityReceived: parsed.data.quantityReceived,
      isCompliant: parsed.data.isCompliant,
      observations: parsed.data.observations,
    },
  });

  revalidatePath('/receptions/' + item.reception.id);
  return { ok: true };
}

// =============================================================================
// SIGN (OPS / TECH / FINANCE selon statut)
// =============================================================================

const signSchema = z.object({
  id: z.string().cuid(),
  comment: z.string().max(500).optional(),
});

export async function signReception(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = signSchema.safeParse({
    id: formData.get('id'),
    comment: formData.get('comment') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Donnees invalides' };

  const reception = await prisma.reception.findUnique({
    where: { id: parsed.data.id },
    include: {
      workflowInstance: {
        include: {
          signatures: { select: { stage: true, actorId: true } },
        },
      },
      items: { select: { id: true, isCompliant: true } },
    },
  });
  if (!reception) return { ok: false, error: 'PV introuvable' };

  const requiresTechnical = reception.decision !== 'NO_TECHNICAL';

  const opsSig = reception.workflowInstance?.signatures.find(
    (s) => s.stage === SignatureStage.RECEPTION_OPS,
  );
  const techSig = reception.workflowInstance?.signatures.find(
    (s) => s.stage === SignatureStage.RECEPTION_TECH,
  );
  const financeSig = reception.workflowInstance?.signatures.find(
    (s) => s.stage === SignatureStage.RECEPTION_FINANCE,
  );

  const memberships = await getUserMemberships(session.user.id);
  const actorRoles = memberships.map((m) => m.role);

  const verdict = canActorSignReception(
    {
      status: reception.status,
      createdById: reception.createdById,
      requiresTechnical,
      opsSignerId: opsSig?.actorId ?? null,
      techSignerId: techSig?.actorId ?? null,
      financeSignerId: financeSig?.actorId ?? null,
    },
    { id: session.user.id, roles: actorRoles },
  );
  if (!verdict.canSign) return { ok: false, error: verdict.reason };

  const { ip, userAgent } = await getRequestActorContext();

  // Determine si tous les items sont conformes
  const hasNonCompliant = reception.items.some((i) => !i.isCompliant);

  await prisma.$transaction(async (tx) => {
    // 1. Cree/charge le WorkflowInstance si pas encore present
    let workflowId = reception.workflowInstance?.id;
    if (!workflowId) {
      const wi = await tx.workflowInstance.create({
        data: {
          entityType: DocumentType.PV,
          definitionKey: 'reception_standard',
          definitionVersion: 1,
          currentStatus: reception.status,
          contextSnapshot: { requiresTechnical },
          receptionId: reception.id,
        },
      });
      workflowId = wi.id;
    }

    // 2. Cree la signature
    await createSignature(
      {
        workflowInstanceId: workflowId,
        stepId: null,
        actorId: session.user.id,
        role: actorRoles[0] ?? RoleCode.DEMANDEUR,
        stage: STAGE_TO_SIGNATURE[verdict.stage],
        documentSnapshot: {
          id: reception.id,
          reference: reception.reference,
          purchaseOrderId: reception.purchaseOrderId,
          type: reception.type,
          status: reception.status,
        },
        ip,
        userAgent,
        comment: parsed.data.comment,
      },
      tx as never,
    );

    // 3. Bascule de statut
    const finalStatus =
      verdict.stage === 'FINANCE'
        ? hasNonCompliant
          ? ReceptionStatus.PROVISIONAL
          : ReceptionStatus.DEFINITIVE
        : verdict.nextStatus;

    await tx.reception.update({
      where: { id: reception.id },
      data: { status: finalStatus, hasReserves: hasNonCompliant },
    });
    await tx.workflowInstance.update({
      where: { id: workflowId },
      data: { currentStatus: finalStatus },
    });
  });

  await appendAudit({
    entityType: 'Reception',
    entityId: reception.id,
    action: STAGE_TO_AUDIT[verdict.stage],
    actorId: session.user.id,
    payload: { reference: reception.reference, stage: verdict.stage },
    ip,
    userAgent,
  }).catch(() => undefined);

  if (verdict.stage === 'FINANCE') {
    await appendAudit({
      entityType: 'Reception',
      entityId: reception.id,
      action: AuditAction.RECEPTION_FINALIZED,
      actorId: session.user.id,
      payload: {
        reference: reception.reference,
        hasReserves: hasNonCompliant,
        finalStatus: hasNonCompliant ? ReceptionStatus.PROVISIONAL : ReceptionStatus.DEFINITIVE,
      },
      ip,
      userAgent,
    }).catch(() => undefined);
  }

  revalidatePath('/receptions/' + reception.id);
  return { ok: true };
}

// =============================================================================
// REJECT
// =============================================================================

const rejectSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(5).max(500),
});

export async function rejectReception(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  const actorRoles = memberships.map((m) => m.role);
  const allowedRejectRoles: RoleCode[] = [
    RoleCode.ADMIN,
    RoleCode.DFG,
    RoleCode.DAF_PAYS,
    RoleCode.FINANCE_FIL_N1,
    RoleCode.TECHNIQUE,
  ];
  const canReject = actorRoles.some((r) => allowedRejectRoles.includes(r));
  if (!canReject) return { ok: false, error: 'Privilege insuffisant' };

  const parsed = rejectSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const reception = await prisma.reception.update({
    where: { id: parsed.data.id },
    data: {
      status: ReceptionStatus.REJECTED,
      reservesDetail: parsed.data.reason,
      hasReserves: true,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Reception',
    entityId: reception.id,
    action: AuditAction.RECEPTION_REJECTED,
    actorId: session.user.id,
    payload: { reference: reception.reference, reason: parsed.data.reason },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/receptions/' + reception.id);
  return { ok: true };
}
