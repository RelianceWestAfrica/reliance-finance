'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  DocumentType,
  ExpenseRequestStatus,
  ExpenseRequestType,
  OpexCapex,
  RoleCode,
  SignatureStage,
  ThresholdType,
  UrgencyLevel,
  WorkflowStepStatus,
  AnomalyType,
  AnomalySeverity,
} from '@reliance-finance/database';
import { transitionWorkflow } from '@reliance-finance/workflow-engine';

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
import {
  computeRegularizationDeadline,
  isStaleRegularization,
} from '@/lib/expense-requests/emergency-guards';
import {
  expenseRequestStandardWorkflow,
  expenseRequestEmergencyWorkflow,
  type ExpenseRequestCtx,
} from '@/lib/expense-requests/workflow-definitions';
import { notifyHoldingRole, sendNotification } from '@/lib/notifications/send';

const STAGE_TO_SIGNATURE_STAGE: Record<SignatureStageId, SignatureStage> = {
  VISA_FILIALE_N1: SignatureStage.VISA_FILIALE_N1,
  VISA_FILIALE_N2: SignatureStage.VISA_FILIALE_N2,
  VISA_GROUPE: SignatureStage.VISA_GROUPE,
  AUTHORIZATION_AG: SignatureStage.AUTHORIZATION_AG,
};

const STAGE_TO_STATUS: Record<SignatureStageId, ExpenseRequestStatus> = {
  VISA_FILIALE_N1: ExpenseRequestStatus.FINANCE_FIL_VISA_OK,
  VISA_FILIALE_N2: ExpenseRequestStatus.FINANCE_FIL_VISA_OK,
  VISA_GROUPE: ExpenseRequestStatus.FINANCE_GROUPE_VISA_OK,
  AUTHORIZATION_AG: ExpenseRequestStatus.AG_APPROVED,
};

// ============================================================================
// CREATE
// ============================================================================

const createSchema = z.object({
  type: z.nativeEnum(ExpenseRequestType).default(ExpenseRequestType.FD),
  entityId: z.string().cuid(),
  projectId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  costCenterId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  supplierId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  title: z.string().min(3).max(200).trim(),
  description: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  justification: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  urgency: z.nativeEnum(UrgencyLevel).default(UrgencyLevel.LOW),
  urgencyReason: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  opexCapex: z.nativeEnum(OpexCapex).default(OpexCapex.OPEX),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).toUpperCase().default('XOF'),
  budgetLineRef: z
    .string()
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  isOutOfBudget: z.coerce.boolean().default(false),
  desiredDate: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  location: z
    .string()
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export async function createExpenseRequest(
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
      RoleCode.DEMANDEUR,
      RoleCode.CHEF_PROJET,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = createSchema.safeParse({
    type: formData.get('type') ?? undefined,
    entityId: formData.get('entityId'),
    projectId: formData.get('projectId') ?? undefined,
    costCenterId: formData.get('costCenterId') ?? undefined,
    supplierId: formData.get('supplierId') ?? undefined,
    title: formData.get('title'),
    description: formData.get('description') ?? undefined,
    justification: formData.get('justification') ?? undefined,
    urgency: formData.get('urgency') ?? undefined,
    urgencyReason: formData.get('urgencyReason') ?? undefined,
    opexCapex: formData.get('opexCapex') ?? undefined,
    amount: formData.get('amount'),
    currency: formData.get('currency') ?? 'XOF',
    budgetLineRef: formData.get('budgetLineRef') ?? undefined,
    isOutOfBudget: formData.get('isOutOfBudget') === 'on',
    desiredDate: formData.get('desiredDate') ?? undefined,
    location: formData.get('location') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  // Resolve codes for the reference
  const [entity, project] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: parsed.data.entityId },
      select: { id: true, code: true, defaultCurrency: true },
    }),
    parsed.data.projectId
      ? prisma.project.findUnique({
          where: { id: parsed.data.projectId },
          select: { id: true, code: true },
        })
      : Promise.resolve(null),
  ]);
  if (!entity) return { ok: false, error: 'Entite introuvable' };

  // Map ExpenseRequestType -> DocumentType for the reference
  const docType =
    parsed.data.type === ExpenseRequestType.FDA
      ? DocumentType.FDA
      : parsed.data.type === ExpenseRequestType.FD_URGENCE
        ? DocumentType.FD_URGENCE
        : DocumentType.FD;

  const reference = await allocateReference({
    type: docType,
    entityId: entity.id,
    entityCode: entity.code,
    projectId: project?.id ?? null,
    projectCode: project?.code ?? null,
  });

  const created = await prisma.expenseRequest.create({
    data: {
      reference,
      type: parsed.data.type,
      status: ExpenseRequestStatus.DRAFT,
      entityId: parsed.data.entityId,
      projectId: parsed.data.projectId,
      costCenterId: parsed.data.costCenterId,
      supplierId: parsed.data.supplierId,
      createdById: session.user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      justification: parsed.data.justification,
      urgency: parsed.data.urgency,
      urgencyReason: parsed.data.urgencyReason,
      opexCapex: parsed.data.opexCapex,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      // En l'absence de conversion multi-devise dynamique, on prend amount tel quel
      // si currency == defaultCurrency du Groupe (XOF). Sinon, conversion en M11.
      amountInGroupCurrency: parsed.data.currency === 'XOF' ? parsed.data.amount : null,
      budgetLineRef: parsed.data.budgetLineRef,
      isOutOfBudget: parsed.data.isOutOfBudget,
      desiredDate: parsed.data.desiredDate ? new Date(parsed.data.desiredDate) : undefined,
      location: parsed.data.location,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'ExpenseRequest',
    entityId: created.id,
    action: AuditAction.EXPENSE_REQUEST_CREATED,
    actorId: session.user.id,
    payload: {
      reference: created.reference,
      type: created.type,
      amount: created.amount.toString(),
      currency: created.currency,
      entityCode: entity.code,
      projectCode: project?.code ?? null,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/expense-requests');
  return { ok: true, id: created.id };
}

// ============================================================================
// SUBMIT - cree le WorkflowInstance + les WorkflowSteps de la chaine
// ============================================================================

export async function submitExpenseRequest(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const er = await prisma.expenseRequest.findUnique({
    where: { id },
    include: {
      supplier: { select: { sensitivity: true, isStrategic: true } },
      offerComparison: { select: { id: true } },
      soleSourceJustification: { select: { id: true } },
    },
  });
  if (!er) return { ok: false, error: 'Demande introuvable' };

  // Resoudre les seuils en vigueur
  // URGENCY_MAX_AMOUNT verifie en amont via emergency-guards lors du submit
  const [filN2, groupe, ag, threeOffers, urgenceHours] = await Promise.all([
    getActiveThresholdAmount(ThresholdType.FILIALE_N2_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.GROUPE_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.AG_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.THREE_OFFERS_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.URGENCY_REGULARIZATION_HOURS, null),
  ]);

  const amountInGroupCurrency = Number(
    er.amountInGroupCurrency?.toString() ?? er.amount.toString(),
  );

  // Contexte pour le moteur de workflow
  const ctx: ExpenseRequestCtx = {
    amountInGroupCurrency,
    hasOfferComparison: !!er.offerComparison,
    hasSoleSourceJustification: !!er.soleSourceJustification,
    threeOffersThreshold: threeOffers,
    hasPV: false, // M7 - pour l'instant pas de PV en M4
    isFinalPayment: false, // Sera true au moment de cloturer en APPROVED
    isUrgence: er.type === ExpenseRequestType.FD_URGENCE,
    emergencyConditionsMet: er.type === ExpenseRequestType.FD_URGENCE, // verifie en amont
  };

  const memberships = await getUserMemberships(session.user.id);
  const actorRoles = memberships.map((m) => m.role);

  const definition =
    er.type === ExpenseRequestType.FD_URGENCE
      ? expenseRequestEmergencyWorkflow
      : expenseRequestStandardWorkflow;

  const verdict = await transitionWorkflow({
    definition,
    currentStatus: er.status,
    action: 'submit',
    context: ctx,
    actor: { id: session.user.id, roles: actorRoles },
  });
  if (!verdict.ok) return { ok: false, error: verdict.message };

  // Construire la chaine d'approbation depuis les seuils
  const approvalChain = computeApprovalChain(
    {
      amountInGroupCurrency,
      isOutOfBudget: er.isOutOfBudget,
      supplierSensitivity: er.supplier?.sensitivity ?? null,
      supplierIsStrategic: er.supplier?.isStrategic ?? false,
    },
    {
      filialeN2RequiredAbove: filN2,
      groupeRequiredAbove: groupe,
      agRequiredAbove: ag,
    },
  );

  // Pour FD_URGENCE : raccourci direct vers AG
  const effectiveChain: ApprovalSlot[] =
    er.type === ExpenseRequestType.FD_URGENCE
      ? [
          {
            stage: 'AUTHORIZATION_AG',
            allowedRoles: [RoleCode.AG, RoleCode.DFG],
            reason: 'Procedure urgence (cadre §7)',
            position: 1,
          },
        ]
      : approvalChain;

  const emergencyDeadlineAt =
    er.type === ExpenseRequestType.FD_URGENCE && urgenceHours
      ? computeRegularizationDeadline(new Date(), urgenceHours)
      : undefined;

  await prisma.$transaction(async (tx) => {
    // 1. Update ER status
    await tx.expenseRequest.update({
      where: { id },
      data: {
        status:
          er.type === ExpenseRequestType.FD_URGENCE
            ? ExpenseRequestStatus.AG_APPROVAL_PENDING
            : ExpenseRequestStatus.FINANCE_FIL_VISA_PENDING,
        amountInGroupCurrency,
        emergencyDeadlineAt,
      },
    });

    // 2. Create WorkflowInstance
    const instance = await tx.workflowInstance.create({
      data: {
        entityType: DocumentType.FD,
        definitionKey: definition.key,
        definitionVersion: definition.version,
        currentStatus:
          er.type === ExpenseRequestType.FD_URGENCE
            ? ExpenseRequestStatus.AG_APPROVAL_PENDING
            : ExpenseRequestStatus.FINANCE_FIL_VISA_PENDING,
        contextSnapshot: JSON.parse(JSON.stringify(ctx)),
        expenseRequestId: id,
      },
    });

    // 3. Create WorkflowStep pour chaque slot de la chaine
    for (const slot of effectiveChain) {
      await tx.workflowStep.create({
        data: {
          workflowInstanceId: instance.id,
          position: slot.position,
          stage: STAGE_TO_SIGNATURE_STAGE[slot.stage],
          fromStatus:
            slot.position === 1
              ? er.type === ExpenseRequestType.FD_URGENCE
                ? ExpenseRequestStatus.AG_APPROVAL_PENDING
                : ExpenseRequestStatus.FINANCE_FIL_VISA_PENDING
              : '<pending>',
          toStatus: STAGE_TO_STATUS[slot.stage],
          action: 'sign',
          status: WorkflowStepStatus.PENDING,
        },
      });
    }

    return instance;
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'ExpenseRequest',
    entityId: id,
    action: AuditAction.EXPENSE_REQUEST_SUBMITTED,
    actorId: session.user.id,
    payload: {
      reference: er.reference,
      approvalChain: effectiveChain.map((s) => ({ stage: s.stage, reason: s.reason })),
      amountInGroupCurrency,
      type: er.type,
      emergencyDeadlineAt: emergencyDeadlineAt?.toISOString(),
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  // Notifier les approbateurs du premier slot
  const firstSlot = effectiveChain[0];
  if (firstSlot) {
    for (const role of firstSlot.allowedRoles) {
      await notifyHoldingRole(role, {
        title: 'Demande a valider : ' + er.reference,
        body: er.title + ' (' + er.amount.toString() + ' ' + er.currency + ')',
        linkUrl: '/expense-requests/' + id,
        entityType: 'ExpenseRequest',
        entityId: id,
      }).catch(() => undefined);
    }
  }

  revalidatePath('/expense-requests');
  revalidatePath('/expense-requests/' + id);
  return { ok: true };
}

// ============================================================================
// SIGN - prochaine etape de la chaine d'approbation
// ============================================================================

const signSchema = z.object({
  id: z.string().cuid(),
  comment: z.string().max(500).optional(),
});

export async function signExpenseRequest(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = signSchema.safeParse({
    id: formData.get('id'),
    comment: formData.get('comment') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Donnees invalides' };

  const er = await prisma.expenseRequest.findUnique({
    where: { id: parsed.data.id },
    include: {
      supplier: { select: { sensitivity: true, isStrategic: true } },
      workflowInstance: {
        include: {
          steps: { orderBy: { position: 'asc' } },
          signatures: { select: { stage: true, actorId: true } },
        },
      },
    },
  });
  if (!er || !er.workflowInstance) {
    return { ok: false, error: 'Demande ou instance workflow introuvable' };
  }

  const memberships = await getUserMemberships(session.user.id);
  const actorRoles = memberships.map((m) => m.role);

  // Reconstruire la chaine depuis les steps actuels
  const approvalChain: ApprovalSlot[] = er.workflowInstance.steps
    .filter((s) => s.status !== WorkflowStepStatus.SKIPPED)
    .map((s) => ({
      stage: stageFromSignatureStage(s.stage),
      allowedRoles: rolesForStage(s.stage),
      reason: '',
      position: s.position,
    }));

  const existingSignatures = er.workflowInstance.signatures.map((s) => ({
    stage: stageFromSignatureStage(s.stage),
    actorId: s.actorId,
  }));

  const verdict = canActorSignNext(
    {
      approvalChain,
      existingSignatures,
      requesterId: er.createdById,
    },
    { id: session.user.id, roles: actorRoles },
  );
  if (!verdict.canAct) return { ok: false, error: verdict.reason };

  const slot = verdict.slot;
  const pendingStep = er.workflowInstance.steps.find(
    (s) => s.position === slot.position && s.status === WorkflowStepStatus.PENDING,
  );
  if (!pendingStep) return { ok: false, error: 'Etape pendante introuvable' };

  const { ip, userAgent } = await getRequestActorContext();
  const role = actorRoles.find((r) => slot.allowedRoles.includes(r)) ?? actorRoles[0];
  if (!role) return { ok: false, error: 'Aucun role exploitable' };

  await prisma.$transaction(async (tx) => {
    // 1. Creer la Signature avec hash chaine
    await createSignature(
      {
        workflowInstanceId: er.workflowInstance!.id,
        stepId: pendingStep.id,
        actorId: session.user.id,
        role,
        stage: pendingStep.stage,
        documentSnapshot: {
          id: er.id,
          reference: er.reference,
          amount: er.amount.toString(),
          currency: er.currency,
          title: er.title,
          status: er.status,
          supplierId: er.supplierId,
          entityId: er.entityId,
          projectId: er.projectId,
        },
        ip,
        userAgent,
        comment: parsed.data.comment,
      },
      tx as never,
    );

    // 2. Marquer l'etape COMPLETED
    await tx.workflowStep.update({
      where: { id: pendingStep.id },
      data: {
        status: WorkflowStepStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    // 3. Calculer le nouveau statut de l'ER
    const isLastSlot = approvalChain[approvalChain.length - 1]?.position === slot.position;
    const newStatus = isLastSlot ? ExpenseRequestStatus.APPROVED : STAGE_TO_STATUS[slot.stage];

    await tx.expenseRequest.update({
      where: { id: parsed.data.id },
      data: { status: newStatus },
    });
    await tx.workflowInstance.update({
      where: { id: er.workflowInstance!.id },
      data: { currentStatus: newStatus },
    });
  });

  await appendAudit({
    entityType: 'ExpenseRequest',
    entityId: er.id,
    action: AuditAction.EXPENSE_REQUEST_SIGNED,
    actorId: session.user.id,
    payload: {
      reference: er.reference,
      stage: slot.stage,
      position: slot.position,
      comment: parsed.data.comment ?? null,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  // Si APPROVED, notifier le demandeur + la tresorerie
  const isLastSlot = approvalChain[approvalChain.length - 1]?.position === slot.position;
  if (isLastSlot) {
    await sendNotification({
      userId: er.createdById,
      title: 'Demande approuvee : ' + er.reference,
      body: 'Tous les visas requis ont ete recueillis. La depense est autorisee.',
      linkUrl: '/expense-requests/' + er.id,
      entityType: 'ExpenseRequest',
      entityId: er.id,
    }).catch(() => undefined);

    await appendAudit({
      entityType: 'ExpenseRequest',
      entityId: er.id,
      action: AuditAction.EXPENSE_REQUEST_APPROVED,
      actorId: session.user.id,
      payload: { reference: er.reference, finalAmount: er.amount.toString() },
      ip,
      userAgent,
    }).catch(() => undefined);
  } else {
    // Notifier les approbateurs de la prochaine etape
    const nextSlot = approvalChain[approvalChain.indexOf(slot) + 1];
    if (nextSlot) {
      for (const r of nextSlot.allowedRoles) {
        await notifyHoldingRole(r, {
          title: 'Demande a valider : ' + er.reference,
          body: 'Etape suivante : ' + nextSlot.stage,
          linkUrl: '/expense-requests/' + er.id,
          entityType: 'ExpenseRequest',
          entityId: er.id,
        }).catch(() => undefined);
      }
    }
  }

  revalidatePath('/expense-requests/' + er.id);
  return { ok: true };
}

// ============================================================================
// REJECT
// ============================================================================

const rejectSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(5).max(500),
});

export async function rejectExpenseRequest(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.AG,
      RoleCode.DAF_PAYS,
      RoleCode.FINANCE_FIL_N1,
      RoleCode.FINANCE_FIL_N2,
      RoleCode.FINANCE_GROUPE,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = rejectSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const er = await prisma.expenseRequest.update({
    where: { id: parsed.data.id },
    data: {
      status: ExpenseRequestStatus.REJECTED,
      rejectionReason: parsed.data.reason,
    },
    include: { workflowInstance: true },
  });

  if (er.workflowInstance) {
    await prisma.workflowInstance.update({
      where: { id: er.workflowInstance.id },
      data: { currentStatus: ExpenseRequestStatus.REJECTED },
    });
  }

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'ExpenseRequest',
    entityId: er.id,
    action: AuditAction.EXPENSE_REQUEST_REJECTED,
    actorId: session.user.id,
    payload: { reference: er.reference, reason: parsed.data.reason },
    ip,
    userAgent,
  }).catch(() => undefined);

  await sendNotification({
    userId: er.createdById,
    title: 'Demande rejetee : ' + er.reference,
    body: parsed.data.reason,
    linkUrl: '/expense-requests/' + er.id,
    entityType: 'ExpenseRequest',
    entityId: er.id,
  }).catch(() => undefined);

  revalidatePath('/expense-requests/' + er.id);
  return { ok: true };
}

// ============================================================================
// CANCEL (par le demandeur, depuis DRAFT seulement)
// ============================================================================

export async function cancelExpenseRequest(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const er = await prisma.expenseRequest.findUnique({
    where: { id },
    select: { id: true, status: true, createdById: true, reference: true },
  });
  if (!er) return { ok: false, error: 'Demande introuvable' };
  if (er.createdById !== session.user.id) {
    return { ok: false, error: 'Seul le demandeur peut annuler sa propre demande' };
  }
  if (er.status !== ExpenseRequestStatus.DRAFT) {
    return {
      ok: false,
      error: 'Annulation possible seulement en DRAFT. Statut courant : ' + er.status,
    };
  }

  await prisma.expenseRequest.update({
    where: { id },
    data: { status: ExpenseRequestStatus.CANCELLED },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'ExpenseRequest',
    entityId: id,
    action: AuditAction.EXPENSE_REQUEST_CANCELLED,
    actorId: session.user.id,
    payload: { reference: er.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/expense-requests');
  return { ok: true };
}

// ============================================================================
// REGULARIZE FD_URGENCE
// ============================================================================

export async function regularizeEmergency(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const er = await prisma.expenseRequest.findUnique({ where: { id } });
  if (!er) return { ok: false, error: 'Demande introuvable' };
  if (er.type !== ExpenseRequestType.FD_URGENCE) {
    return { ok: false, error: 'Cette action est reservee aux FD_URGENCE' };
  }

  await prisma.expenseRequest.update({
    where: { id },
    data: { regularizedAt: new Date(), status: ExpenseRequestStatus.ARCHIVED },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'ExpenseRequest',
    entityId: id,
    action: AuditAction.EXPENSE_REQUEST_REGULARIZED,
    actorId: session.user.id,
    payload: { reference: er.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/expense-requests/' + id);
  return { ok: true };
}

// ============================================================================
// DETECTSTALEREGULARIZATIONS (job cron-able)
// ============================================================================

export async function detectStaleRegularizations(): Promise<{
  ok: boolean;
  flagged: number;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, flagged: 0 };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [RoleCode.ADMIN, RoleCode.DFG, RoleCode.CONTROLEUR_INTERNE]);
  } catch {
    return { ok: false, flagged: 0 };
  }

  const now = new Date();
  const candidates = await prisma.expenseRequest.findMany({
    where: {
      type: ExpenseRequestType.FD_URGENCE,
      emergencyDeadlineAt: { lte: now },
      regularizedAt: null,
      status: { notIn: [ExpenseRequestStatus.ARCHIVED, ExpenseRequestStatus.CANCELLED] },
    },
    select: {
      id: true,
      reference: true,
      entityId: true,
      emergencyDeadlineAt: true,
      regularizedAt: true,
      createdById: true,
    },
  });

  let flagged = 0;
  for (const er of candidates) {
    if (!isStaleRegularization(er.emergencyDeadlineAt, er.regularizedAt, now)) continue;

    // Eviter les doublons : verifier si une Anomaly existe deja sur cet ER
    const existing = await prisma.anomaly.findFirst({
      where: {
        type: AnomalyType.REPEATED_URGENCY,
        expenseRequestId: er.id,
      },
    });
    if (existing) continue;

    const anomaly = await prisma.anomaly.create({
      data: {
        reference:
          'ANO-' +
          now.getFullYear() +
          '-' +
          String(now.getMonth() + 1).padStart(2, '0') +
          '-' +
          crypto.randomUUID().slice(0, 8).toUpperCase(),
        type: AnomalyType.REPEATED_URGENCY,
        severity: AnomalySeverity.HIGH,
        entityId: er.entityId,
        expenseRequestId: er.id,
        title: 'FD_URGENCE non regularisee : ' + er.reference,
        description:
          'Le delai de regularisation (' +
          er.emergencyDeadlineAt?.toISOString() +
          ') est depasse sans regularisation. Cadre §7.',
        detectionRule: 'EMERGENCY_OVERDUE/detectStaleRegularizations',
        evidence: {
          deadlineAt: er.emergencyDeadlineAt?.toISOString(),
          regularizedAt: null,
          checkedAt: now.toISOString(),
        },
      },
    });

    await appendAudit({
      entityType: 'ExpenseRequest',
      entityId: er.id,
      action: AuditAction.EXPENSE_REQUEST_EMERGENCY_OVERDUE,
      actorId: null,
      payload: { reference: er.reference, anomalyId: anomaly.id },
    }).catch(() => undefined);

    await notifyHoldingRole(RoleCode.CONTROLEUR_INTERNE, {
      title: 'Urgence non regularisee : ' + er.reference,
      body: anomaly.title,
      linkUrl: '/expense-requests/' + er.id,
      entityType: 'Anomaly',
      entityId: anomaly.id,
    }).catch(() => undefined);

    flagged++;
  }

  revalidatePath('/expense-requests');
  return { ok: true, flagged };
}

// ============================================================================
// HELPERS PRIVES
// ============================================================================

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
      // Stages non-ER (reception, paiement) ne devraient pas arriver ici
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
