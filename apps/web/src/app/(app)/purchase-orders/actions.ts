'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  DocumentType,
  PurchaseOrderStatus,
  PurchaseOrderType,
  RoleCode,
  SignatureStage,
  ThresholdType,
  WorkflowStepStatus,
  OfferComparisonStatus,
} from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { allocateReference } from '@/lib/document-sequence/allocate';
import { createSignature } from '@/lib/signatures/service';
import { getActiveThresholdAmount } from '@/lib/thresholds';
import {
  computeApprovalChain,
  type ApprovalSlot,
  type SignatureStageId,
} from '@/lib/expense-requests/approval-chain';
import { canActorSignNext } from '@/lib/expense-requests/can-act';
import { checkSourcing } from '@/lib/purchase-orders/sourcing-check';
import { notifyHoldingRole, sendNotification } from '@/lib/notifications/send';
import { isBankAccountUsable } from '@/lib/bank-accounts/usability';

const STAGE_TO_SIGNATURE_STAGE: Record<SignatureStageId, SignatureStage> = {
  VISA_FILIALE_N1: SignatureStage.VISA_FILIALE_N1,
  VISA_FILIALE_N2: SignatureStage.VISA_FILIALE_N2,
  VISA_GROUPE: SignatureStage.VISA_GROUPE,
  AUTHORIZATION_AG: SignatureStage.AUTHORIZATION_AG,
};

function stageFromSignatureStage(s: SignatureStage): SignatureStageId {
  switch (s) {
    case SignatureStage.VISA_FILIALE_N1:
      return 'VISA_FILIALE_N1';
    case SignatureStage.VISA_FILIALE_N2:
      return 'VISA_FILIALE_N2';
    case SignatureStage.VISA_GROUPE:
      return 'VISA_GROUPE';
    case SignatureStage.AUTHORIZATION_AG:
      return 'AUTHORIZATION_AG';
    default:
      return 'VISA_FILIALE_N1';
  }
}

function rolesForStage(s: SignatureStage): RoleCode[] {
  switch (s) {
    case SignatureStage.VISA_FILIALE_N1:
      return [RoleCode.FINANCE_FIL_N1, RoleCode.DAF_PAYS];
    case SignatureStage.VISA_FILIALE_N2:
      return [RoleCode.FINANCE_FIL_N2, RoleCode.DAF_PAYS];
    case SignatureStage.VISA_GROUPE:
      return [RoleCode.FINANCE_GROUPE, RoleCode.DFG];
    case SignatureStage.AUTHORIZATION_AG:
      return [RoleCode.AG, RoleCode.DFG];
    default:
      return [];
  }
}

// ============================================================================
// CREATE PURCHASE ORDER (avec snapshot RIB)
// ============================================================================

const createSchema = z.object({
  type: z.nativeEnum(PurchaseOrderType).default(PurchaseOrderType.BC),
  entityId: z.string().cuid(),
  projectId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  supplierId: z.string().cuid(),
  expenseRequestId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  objet: z.string().min(3).max(500),
  description: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  deliveryLocation: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  deliveryDeadline: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  incoterm: z
    .string()
    .max(20)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  currency: z.string().length(3).toUpperCase().default('XOF'),
  paymentTerms: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  depositPercent: z.coerce
    .number()
    .min(0)
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  requiresReceptionPv: z.coerce.boolean().default(true),
  requiresServiceDone: z.coerce.boolean().default(false),
  requiresWorkAttachment: z.coerce.boolean().default(false),
  warrantyMonths: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  penaltyPerDay: z.coerce
    .number()
    .min(0)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export async function createPurchaseOrder(
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
      RoleCode.CHEF_PROJET,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant pour creer un BC' };
  }

  const parsed = createSchema.safeParse({
    type: formData.get('type') ?? undefined,
    entityId: formData.get('entityId'),
    projectId: formData.get('projectId') ?? undefined,
    supplierId: formData.get('supplierId'),
    expenseRequestId: formData.get('expenseRequestId') ?? undefined,
    objet: formData.get('objet'),
    description: formData.get('description') ?? undefined,
    deliveryLocation: formData.get('deliveryLocation') ?? undefined,
    deliveryDeadline: formData.get('deliveryDeadline') ?? undefined,
    incoterm: formData.get('incoterm') ?? undefined,
    currency: formData.get('currency') ?? 'XOF',
    paymentTerms: formData.get('paymentTerms') ?? undefined,
    depositPercent: formData.get('depositPercent') ?? undefined,
    requiresReceptionPv: formData.get('requiresReceptionPv') === 'on',
    requiresServiceDone: formData.get('requiresServiceDone') === 'on',
    requiresWorkAttachment: formData.get('requiresWorkAttachment') === 'on',
    warrantyMonths: formData.get('warrantyMonths') ?? undefined,
    penaltyPerDay: formData.get('penaltyPerDay') ?? undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const [entity, project, supplier] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: parsed.data.entityId },
      select: { id: true, code: true },
    }),
    parsed.data.projectId
      ? prisma.project.findUnique({
          where: { id: parsed.data.projectId },
          select: { id: true, code: true },
        })
      : Promise.resolve(null),
    prisma.supplier.findUnique({
      where: { id: parsed.data.supplierId },
      select: {
        id: true,
        code: true,
        name: true,
        bankAccounts: {
          where: { isPrimary: true, isActive: true },
          select: { id: true, verifiedAt: true, quarantineUntil: true, isActive: true },
        },
      },
    }),
  ]);
  if (!entity) return { ok: false, error: 'Entite introuvable' };
  if (!supplier) return { ok: false, error: 'Fournisseur introuvable' };

  // Snapshot du RIB primary actif au moment du BC (anti-fraude cadre §8)
  // Note : la quarantaine ne bloque PAS la creation du BC (seulement le paiement
  // en M10). Le snapshot fige juste la reference au RIB.
  const primaryBankAccount = supplier.bankAccounts[0];
  const bankAccountSnapshotId = primaryBankAccount?.id;

  const reference = await allocateReference({
    type: parsed.data.type === PurchaseOrderType.CONTRACT ? DocumentType.CONTRACT : DocumentType.BC,
    entityId: entity.id,
    entityCode: entity.code,
    projectId: project?.id ?? null,
    projectCode: project?.code ?? null,
  });

  const created = await prisma.purchaseOrder.create({
    data: {
      reference,
      type: parsed.data.type,
      status: PurchaseOrderStatus.DRAFT,
      entityId: parsed.data.entityId,
      projectId: parsed.data.projectId,
      supplierId: parsed.data.supplierId,
      expenseRequestId: parsed.data.expenseRequestId,
      createdById: session.user.id,
      objet: parsed.data.objet,
      description: parsed.data.description,
      deliveryLocation: parsed.data.deliveryLocation,
      deliveryDeadline: parsed.data.deliveryDeadline
        ? new Date(parsed.data.deliveryDeadline)
        : undefined,
      incoterm: parsed.data.incoterm,
      // Totaux a 0 initialement - calcules quand on ajoute les items
      subtotalHt: 0,
      taxAmount: 0,
      retentionAmount: 0,
      totalTtc: 0,
      currency: parsed.data.currency,
      paymentTerms: parsed.data.paymentTerms,
      depositPercent:
        typeof parsed.data.depositPercent === 'number' ? parsed.data.depositPercent : undefined,
      requiresReceptionPv: parsed.data.requiresReceptionPv,
      requiresServiceDone: parsed.data.requiresServiceDone,
      requiresWorkAttachment: parsed.data.requiresWorkAttachment,
      warrantyMonths:
        typeof parsed.data.warrantyMonths === 'number' ? parsed.data.warrantyMonths : undefined,
      penaltyPerDay:
        typeof parsed.data.penaltyPerDay === 'number' ? parsed.data.penaltyPerDay : undefined,
      bankAccountSnapshotId,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'PurchaseOrder',
    entityId: created.id,
    action: AuditAction.PURCHASE_ORDER_CREATED,
    actorId: session.user.id,
    payload: {
      reference,
      type: parsed.data.type,
      supplierId: parsed.data.supplierId,
      supplierCode: supplier.code,
      expenseRequestId: parsed.data.expenseRequestId ?? null,
      bankAccountSnapshotId: bankAccountSnapshotId ?? null,
      hasBankAccount: !!primaryBankAccount,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  if (!primaryBankAccount) {
    console.warn(
      'WARN: BC ' + reference + ' cree sans RIB snapshot (fournisseur sans RIB primary actif)',
    );
  }

  revalidatePath('/purchase-orders');
  return { ok: true, id: created.id };
}

// ============================================================================
// ADD / REMOVE ITEMS (DRAFT only)
// ============================================================================

const addItemSchema = z.object({
  purchaseOrderId: z.string().cuid(),
  position: z.coerce.number().int().positive(),
  description: z.string().min(2).max(500),
  quantity: z.coerce.number().positive(),
  unit: z
    .string()
    .max(20)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  unitPrice: z.coerce.number().positive(),
});

export async function addPurchaseOrderItem(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = addItemSchema.safeParse({
    purchaseOrderId: formData.get('purchaseOrderId'),
    position: formData.get('position'),
    description: formData.get('description'),
    quantity: formData.get('quantity'),
    unit: formData.get('unit') ?? undefined,
    unitPrice: formData.get('unitPrice'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parsed.data.purchaseOrderId },
    select: { id: true, status: true, taxAmount: true, retentionAmount: true, createdById: true },
  });
  if (!po) return { ok: false, error: 'BC introuvable' };
  if (po.status !== PurchaseOrderStatus.DRAFT) {
    return { ok: false, error: 'BC verrouille (statut : ' + po.status + ')' };
  }

  const totalHt = parsed.data.quantity * parsed.data.unitPrice;

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderItem.create({
      data: {
        purchaseOrderId: parsed.data.purchaseOrderId,
        position: parsed.data.position,
        description: parsed.data.description,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        unitPrice: parsed.data.unitPrice,
        totalHt,
      },
    });

    // Recalculer le total du BC
    const items = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: parsed.data.purchaseOrderId },
      select: { totalHt: true },
    });
    const subtotalHt = items.reduce((sum, i) => sum + Number(i.totalHt.toString()), 0);
    const totalTtc =
      subtotalHt + Number(po.taxAmount.toString()) - Number(po.retentionAmount.toString());

    await tx.purchaseOrder.update({
      where: { id: parsed.data.purchaseOrderId },
      data: { subtotalHt, totalTtc },
    });
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'PurchaseOrder',
    entityId: parsed.data.purchaseOrderId,
    action: AuditAction.PURCHASE_ORDER_ITEM_ADDED,
    actorId: session.user.id,
    payload: { position: parsed.data.position, totalHt },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/purchase-orders/' + parsed.data.purchaseOrderId);
  return { ok: true };
}

export async function removePurchaseOrderItem(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID item manquant' };

  const item = await prisma.purchaseOrderItem.findUnique({
    where: { id },
    select: {
      id: true,
      purchaseOrderId: true,
      purchaseOrder: { select: { status: true, taxAmount: true, retentionAmount: true } },
    },
  });
  if (!item) return { ok: false, error: 'Item introuvable' };
  if (item.purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
    return { ok: false, error: 'BC verrouille' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderItem.delete({ where: { id } });
    const items = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: item.purchaseOrderId },
      select: { totalHt: true },
    });
    const subtotalHt = items.reduce((sum, i) => sum + Number(i.totalHt.toString()), 0);
    const totalTtc =
      subtotalHt +
      Number(item.purchaseOrder.taxAmount.toString()) -
      Number(item.purchaseOrder.retentionAmount.toString());
    await tx.purchaseOrder.update({
      where: { id: item.purchaseOrderId },
      data: { subtotalHt, totalTtc },
    });
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'PurchaseOrder',
    entityId: item.purchaseOrderId,
    action: AuditAction.PURCHASE_ORDER_ITEM_REMOVED,
    actorId: session.user.id,
    payload: { itemId: id },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/purchase-orders/' + item.purchaseOrderId);
  return { ok: true };
}

// ============================================================================
// SUBMIT (lance signatures + check sourcing)
// ============================================================================

async function hasApprovedSoleSourceForER(expenseRequestId: string): Promise<boolean> {
  const ssj = await prisma.soleSourceJustification.findUnique({
    where: { expenseRequestId },
    select: { id: true },
  });
  if (!ssj) return false;
  // Approbation enregistree dans l'audit log
  const approvedAudit = await prisma.auditLog.findFirst({
    where: {
      entityType: 'SoleSourceJustification',
      entityId: ssj.id,
      action: AuditAction.SOLE_SOURCE_APPROVED,
    },
    select: { id: true },
  });
  return !!approvedAudit;
}

export async function submitPurchaseOrder(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { sensitivity: true, isStrategic: true } },
      items: { select: { id: true } },
    },
  });
  if (!po) return { ok: false, error: 'BC introuvable' };
  if (po.status !== PurchaseOrderStatus.DRAFT) {
    return { ok: false, error: 'Soumission impossible : statut ' + po.status };
  }
  if (po.items.length === 0) {
    return { ok: false, error: 'Au moins 1 item requis avant soumission' };
  }
  if (Number(po.totalTtc.toString()) <= 0) {
    return { ok: false, error: 'Total TTC doit etre > 0' };
  }

  // Resoudre les seuils
  const [filN2, groupe, ag, threeOffers] = await Promise.all([
    getActiveThresholdAmount(ThresholdType.FILIALE_N2_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.GROUPE_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.AG_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.THREE_OFFERS_REQUIRED_ABOVE, null),
  ]);

  // Conversion en devise Groupe (XOF) - si autre devise, M11 fera la conversion
  const amountInGroupCurrency =
    po.currency === 'XOF' ? Number(po.totalTtc.toString()) : Number(po.totalTtc.toString());

  // Garde sourcing : si lie a une ER et > seuil 3 offres, exige OC ou SSJ approuves
  if (po.expenseRequestId) {
    const [oc, hasSsj] = await Promise.all([
      prisma.offerComparison.findFirst({
        where: { expenseRequestId: po.expenseRequestId, status: OfferComparisonStatus.APPROVED },
        select: { id: true },
      }),
      hasApprovedSoleSourceForER(po.expenseRequestId),
    ]);
    const sourcingVerdict = checkSourcing({
      amountInGroupCurrency,
      threeOffersThreshold: threeOffers,
      hasApprovedOfferComparison: !!oc,
      hasApprovedSoleSourceJustification: hasSsj,
    });
    if (!sourcingVerdict.ok) return { ok: false, error: sourcingVerdict.reason };
  } else {
    // BC standalone (sans ER) : meme garde
    const sourcingVerdict = checkSourcing({
      amountInGroupCurrency,
      threeOffersThreshold: threeOffers,
      hasApprovedOfferComparison: false,
      hasApprovedSoleSourceJustification: false,
    });
    if (!sourcingVerdict.ok) return { ok: false, error: sourcingVerdict.reason };
  }

  // Construire la chaine d'approbation
  const approvalChain: ApprovalSlot[] = computeApprovalChain(
    {
      amountInGroupCurrency,
      isOutOfBudget: false, // BC = engagement de depense, "hors budget" est sur l'ER
      supplierSensitivity: po.supplier.sensitivity,
      supplierIsStrategic: po.supplier.isStrategic,
    },
    {
      filialeN2RequiredAbove: filN2,
      groupeRequiredAbove: groupe,
      agRequiredAbove: ag,
    },
  );

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.PENDING_SIGNATURES },
    });

    const instance = await tx.workflowInstance.create({
      data: {
        entityType: DocumentType.BC,
        definitionKey: 'purchase_order_standard',
        definitionVersion: 1,
        currentStatus: PurchaseOrderStatus.PENDING_SIGNATURES,
        contextSnapshot: { amountInGroupCurrency },
        purchaseOrderId: id,
      },
    });

    for (const slot of approvalChain) {
      await tx.workflowStep.create({
        data: {
          workflowInstanceId: instance.id,
          position: slot.position,
          stage: STAGE_TO_SIGNATURE_STAGE[slot.stage],
          fromStatus: PurchaseOrderStatus.PENDING_SIGNATURES,
          toStatus: PurchaseOrderStatus.SIGNED,
          action: 'sign',
          status: WorkflowStepStatus.PENDING,
        },
      });
    }
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'PurchaseOrder',
    entityId: id,
    action: AuditAction.PURCHASE_ORDER_SUBMITTED,
    actorId: session.user.id,
    payload: {
      reference: po.reference,
      approvalChain: approvalChain.map((s) => s.stage),
      totalTtc: po.totalTtc.toString(),
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  // Notifier le premier slot
  const firstSlot = approvalChain[0];
  if (firstSlot) {
    for (const role of firstSlot.allowedRoles) {
      await notifyHoldingRole(role, {
        title: 'BC a valider : ' + po.reference,
        body: po.objet + ' (' + po.totalTtc.toString() + ' ' + po.currency + ')',
        linkUrl: '/purchase-orders/' + id,
        entityType: 'PurchaseOrder',
        entityId: id,
      }).catch(() => undefined);
    }
  }

  revalidatePath('/purchase-orders/' + id);
  return { ok: true };
}

// ============================================================================
// SIGN (cascade)
// ============================================================================

const signSchema = z.object({
  id: z.string().cuid(),
  comment: z.string().max(500).optional(),
});

export async function signPurchaseOrder(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = signSchema.safeParse({
    id: formData.get('id'),
    comment: formData.get('comment') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Donnees invalides' };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parsed.data.id },
    include: {
      workflowInstance: {
        include: {
          steps: { orderBy: { position: 'asc' } },
          signatures: { select: { stage: true, actorId: true } },
        },
      },
    },
  });
  if (!po || !po.workflowInstance) {
    return { ok: false, error: 'BC ou workflow introuvable' };
  }

  const memberships = await getUserMemberships(session.user.id);
  const actorRoles = memberships.map((m) => m.role);

  const approvalChain: ApprovalSlot[] = po.workflowInstance.steps
    .filter((s) => s.status !== WorkflowStepStatus.SKIPPED)
    .map((s) => ({
      stage: stageFromSignatureStage(s.stage),
      allowedRoles: rolesForStage(s.stage),
      reason: '',
      position: s.position,
    }));

  const existingSignatures = po.workflowInstance.signatures.map((s) => ({
    stage: stageFromSignatureStage(s.stage),
    actorId: s.actorId,
  }));

  const verdict = canActorSignNext(
    { approvalChain, existingSignatures, requesterId: po.createdById },
    { id: session.user.id, roles: actorRoles },
  );
  if (!verdict.canAct) return { ok: false, error: verdict.reason };

  const slot = verdict.slot;
  const pendingStep = po.workflowInstance.steps.find(
    (s) => s.position === slot.position && s.status === WorkflowStepStatus.PENDING,
  );
  if (!pendingStep) return { ok: false, error: 'Etape pendante introuvable' };

  const { ip, userAgent } = await getRequestActorContext();
  const role = actorRoles.find((r) => slot.allowedRoles.includes(r)) ?? actorRoles[0];
  if (!role) return { ok: false, error: 'Aucun role exploitable' };

  await prisma.$transaction(async (tx) => {
    await createSignature(
      {
        workflowInstanceId: po.workflowInstance!.id,
        stepId: pendingStep.id,
        actorId: session.user.id,
        role,
        stage: pendingStep.stage,
        documentSnapshot: {
          id: po.id,
          reference: po.reference,
          type: po.type,
          totalTtc: po.totalTtc.toString(),
          currency: po.currency,
          supplierId: po.supplierId,
          bankAccountSnapshotId: po.bankAccountSnapshotId,
          entityId: po.entityId,
        },
        ip,
        userAgent,
        comment: parsed.data.comment,
      },
      tx as never,
    );

    await tx.workflowStep.update({
      where: { id: pendingStep.id },
      data: { status: WorkflowStepStatus.COMPLETED, completedAt: new Date() },
    });

    const isLastSlot = approvalChain[approvalChain.length - 1]?.position === slot.position;
    const newStatus = isLastSlot
      ? PurchaseOrderStatus.SIGNED
      : PurchaseOrderStatus.PENDING_SIGNATURES;

    await tx.purchaseOrder.update({ where: { id: parsed.data.id }, data: { status: newStatus } });
    await tx.workflowInstance.update({
      where: { id: po.workflowInstance!.id },
      data: { currentStatus: newStatus },
    });
  });

  await appendAudit({
    entityType: 'PurchaseOrder',
    entityId: po.id,
    action: AuditAction.PURCHASE_ORDER_SIGNED,
    actorId: session.user.id,
    payload: {
      reference: po.reference,
      stage: slot.stage,
      position: slot.position,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  const isLastSlot = approvalChain[approvalChain.length - 1]?.position === slot.position;
  if (isLastSlot) {
    await sendNotification({
      userId: po.createdById,
      title: 'BC signe : ' + po.reference,
      body: 'Tous les visas requis ont ete recueillis. Le BC peut etre envoye au fournisseur.',
      linkUrl: '/purchase-orders/' + po.id,
      entityType: 'PurchaseOrder',
      entityId: po.id,
    }).catch(() => undefined);
  } else {
    const next = approvalChain[approvalChain.indexOf(slot) + 1];
    if (next) {
      for (const r of next.allowedRoles) {
        await notifyHoldingRole(r, {
          title: 'BC a valider : ' + po.reference,
          body: 'Etape suivante : ' + next.stage,
          linkUrl: '/purchase-orders/' + po.id,
          entityType: 'PurchaseOrder',
          entityId: po.id,
        }).catch(() => undefined);
      }
    }
  }

  revalidatePath('/purchase-orders/' + po.id);
  return { ok: true };
}

// ============================================================================
// SEND TO SUPPLIER
// ============================================================================

export async function sendPurchaseOrderToSupplier(
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

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, status: true, reference: true, bankAccountSnapshotId: true },
  });
  if (!po) return { ok: false, error: 'BC introuvable' };
  if (po.status !== PurchaseOrderStatus.SIGNED) {
    return {
      ok: false,
      error:
        'Envoi possible seulement apres signature complete (statut courant : ' + po.status + ')',
    };
  }

  // Garde optionnelle : verifier que le RIB snapshot est encore utilisable
  // (informatif, non bloquant ici - bloquera au paiement en M10)
  if (po.bankAccountSnapshotId) {
    const account = await prisma.bankAccount.findUnique({
      where: { id: po.bankAccountSnapshotId },
      select: { isActive: true, verifiedAt: true, quarantineUntil: true },
    });
    if (account) {
      const usability = isBankAccountUsable(account);
      if (!usability.usable) {
        console.warn(
          'WARN: BC ' +
            po.reference +
            ' envoye au fournisseur alors que RIB snapshot est ' +
            usability.reason,
        );
      }
    }
  }

  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: PurchaseOrderStatus.SENT_TO_SUPPLIER },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'PurchaseOrder',
    entityId: id,
    action: AuditAction.PURCHASE_ORDER_SENT,
    actorId: session.user.id,
    payload: { reference: po.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/purchase-orders/' + id);
  return { ok: true };
}

// ============================================================================
// CANCEL (DRAFT only)
// ============================================================================

const cancelSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(5).max(500),
});

export async function cancelPurchaseOrder(
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

  const parsed = cancelSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parsed.data.id },
    select: { status: true, reference: true },
  });
  if (!po) return { ok: false, error: 'BC introuvable' };
  if (
    po.status !== PurchaseOrderStatus.DRAFT &&
    po.status !== PurchaseOrderStatus.PENDING_SIGNATURES
  ) {
    return {
      ok: false,
      error:
        "Annulation impossible apres signature complete - utiliser une procedure d'avenant (statut : " +
        po.status +
        ')',
    };
  }

  await prisma.purchaseOrder.update({
    where: { id: parsed.data.id },
    data: {
      status: PurchaseOrderStatus.CANCELLED,
      cancellationReason: parsed.data.reason,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'PurchaseOrder',
    entityId: parsed.data.id,
    action: AuditAction.PURCHASE_ORDER_CANCELLED,
    actorId: session.user.id,
    payload: { reference: po.reference, reason: parsed.data.reason },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/purchase-orders/' + parsed.data.id);
  return { ok: true };
}
