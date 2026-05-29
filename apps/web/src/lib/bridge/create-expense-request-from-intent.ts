// =============================================================================
// Pont financier - Creation systeme d'une ExpenseRequest depuis une intention
// =============================================================================
// Reproduit fidelement le coeur de createExpenseRequest + submitExpenseRequest
// (cf. app/(app)/expense-requests/actions.ts) mais SANS session NextAuth :
// l'acteur est le compte de service du pont. Le dossier atterrit directement
// dans la cascade de visas (Lignes 2->6), la Ligne 1 ayant ete faite cote source.
// =============================================================================

import type { FinancialIntent } from '@reliance-finance/bridge-contract';
import {
  DocumentType,
  ExpenseRequestStatus,
  ExpenseRequestType,
  RoleCode,
  SignatureStage,
  ThresholdType,
  WorkflowStepStatus,
  prisma,
} from '@reliance-finance/database';
import { transitionWorkflow } from '@reliance-finance/workflow-engine';

import { appendAudit, AuditAction } from '@/lib/audit/log';
import { allocateReference } from '@/lib/document-sequence/allocate';
import {
  computeApprovalChain,
  type ApprovalSlot,
  type SignatureStageId,
} from '@/lib/expense-requests/approval-chain';
import { computeRegularizationDeadline } from '@/lib/expense-requests/emergency-guards';
import {
  expenseRequestEmergencyWorkflow,
  expenseRequestStandardWorkflow,
} from '@/lib/expense-requests/workflow-definitions';
import { getActiveThresholdAmount } from '@/lib/thresholds';
import { notifyHoldingRole } from '@/lib/notifications/send';

import {
  amountToNumber,
  buildApprovalCtx,
  buildItemsInput,
  deriveExpenseRequestType,
  documentTypeFor,
  mapOpexCapex,
  mapUrgency,
} from './map-disbursement';
import { resolveSupplier, resolveTargets } from './resolve-targets';
import { ensureBridgeSystemUser } from './system-user';

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

export interface CreateFromIntentParams {
  intent: FinancialIntent;
  source: string;
  bridgeInboxId: string;
}

export type CreateFromIntentResult =
  | { ok: true; expenseRequestId: string; reference: string; status: ExpenseRequestStatus }
  | { ok: false; code: string; message: string; field?: string };

export async function createExpenseRequestFromIntent(
  params: CreateFromIntentParams,
): Promise<CreateFromIntentResult> {
  const { intent, source, bridgeInboxId } = params;

  const systemUserId = await ensureBridgeSystemUser();

  const resolved = await resolveTargets(intent.target);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message, field: resolved.field };
  }
  const targets = resolved.targets;
  const supplier = await resolveSupplier(targets.entityId, intent.counterparty);

  const type = deriveExpenseRequestType(intent);
  const docType = documentTypeFor(type);
  const isUrgence = type === ExpenseRequestType.FD_URGENCE;
  const amountStr = intent.amount.value;
  const currency = intent.amount.currency;
  const amountInGroupCurrency = amountToNumber(intent);

  const [filN2, groupe, ag, threeOffers, urgenceHours] = await Promise.all([
    getActiveThresholdAmount(ThresholdType.FILIALE_N2_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.GROUPE_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.AG_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.THREE_OFFERS_REQUIRED_ABOVE, null),
    getActiveThresholdAmount(ThresholdType.URGENCY_REGULARIZATION_HOURS, null),
  ]);

  const ctx = buildApprovalCtx({
    intent,
    type,
    amountInGroupCurrency,
    threeOffersThreshold: threeOffers,
  });

  const definition = isUrgence ? expenseRequestEmergencyWorkflow : expenseRequestStandardWorkflow;

  // Verifie la garde de transition `submit` (l'acteur systeme n'a aucun role,
  // ce qui suffit : la transition `submit` ne porte pas de requiredRoles).
  const verdict = await transitionWorkflow({
    definition,
    currentStatus: ExpenseRequestStatus.DRAFT,
    action: 'submit',
    context: ctx,
    actor: { id: systemUserId, roles: [] },
  });
  if (!verdict.ok) {
    return {
      ok: false,
      code: 'WORKFLOW_GUARD_BLOCKED',
      message: verdict.message ?? 'Transition submit bloquee par une garde',
    };
  }

  const approvalChain = computeApprovalChain(
    {
      amountInGroupCurrency,
      isOutOfBudget: intent.budget?.isOutOfBudget ?? false,
      supplierSensitivity: supplier.sensitivity,
      supplierIsStrategic: supplier.isStrategic,
    },
    { filialeN2RequiredAbove: filN2, groupeRequiredAbove: groupe, agRequiredAbove: ag },
  );

  const effectiveChain: ApprovalSlot[] = isUrgence
    ? [
        {
          stage: 'AUTHORIZATION_AG',
          allowedRoles: [RoleCode.AG, RoleCode.DFG],
          reason: 'Procedure urgence (cadre §7)',
          position: 1,
        },
      ]
    : approvalChain;

  const initialStatus = isUrgence
    ? ExpenseRequestStatus.AG_APPROVAL_PENDING
    : ExpenseRequestStatus.FINANCE_FIL_VISA_PENDING;

  const emergencyDeadlineAt =
    isUrgence && urgenceHours ? computeRegularizationDeadline(new Date(), urgenceHours) : undefined;

  const reference = await allocateReference({
    type: docType,
    entityId: targets.entityId,
    entityCode: targets.entityCode,
    projectId: targets.projectId,
    projectCode: targets.projectCode,
  });

  const items = buildItemsInput(intent);

  const created = await prisma.$transaction(async (tx) => {
    const er = await tx.expenseRequest.create({
      data: {
        reference,
        type,
        status: initialStatus,
        entityId: targets.entityId,
        projectId: targets.projectId ?? undefined,
        costCenterId: targets.costCenterId ?? undefined,
        supplierId: supplier.supplierId ?? undefined,
        createdById: systemUserId,
        title: intent.content.title,
        description: intent.content.description,
        justification: intent.content.justification,
        urgency: mapUrgency(intent),
        urgencyReason: intent.classification?.urgencyReason ?? undefined,
        opexCapex: mapOpexCapex(intent),
        amount: amountStr,
        currency,
        amountInGroupCurrency: currency === 'XOF' ? amountStr : null,
        budgetLineRef: intent.budget?.lineRef ?? undefined,
        isOutOfBudget: intent.budget?.isOutOfBudget ?? false,
        desiredDate: intent.content.desiredDate ? new Date(intent.content.desiredDate) : undefined,
        location: intent.content.location,
        emergencyDeadlineAt,
        originApp: source,
        originRef: intent.source.objectRef,
        bridgeInboxId,
        items: items.length
          ? {
              create: items.map((it) => ({
                position: it.position,
                description: it.description,
                quantity: it.quantity,
                unit: it.unit,
                unitPrice: it.unitPrice,
                totalPrice: it.totalPrice,
                notes: it.notes,
              })),
            }
          : undefined,
      },
      select: { id: true },
    });

    const instance = await tx.workflowInstance.create({
      data: {
        entityType: DocumentType.FD,
        definitionKey: definition.key,
        definitionVersion: definition.version,
        currentStatus: initialStatus,
        contextSnapshot: JSON.parse(JSON.stringify(ctx)),
        expenseRequestId: er.id,
      },
      select: { id: true },
    });

    for (const slot of effectiveChain) {
      await tx.workflowStep.create({
        data: {
          workflowInstanceId: instance.id,
          position: slot.position,
          stage: STAGE_TO_SIGNATURE_STAGE[slot.stage],
          fromStatus: slot.position === 1 ? initialStatus : '<pending>',
          toStatus: STAGE_TO_STATUS[slot.stage],
          action: 'sign',
          status: WorkflowStepStatus.PENDING,
        },
      });
    }

    return er;
  });

  await appendAudit({
    entityType: 'ExpenseRequest',
    entityId: created.id,
    action: AuditAction.BRIDGE_INTENT_RECEIVED,
    actorId: systemUserId,
    payload: {
      reference,
      type,
      amount: amountStr,
      currency,
      bridgeSource: source,
      intentId: intent.intentId,
      originRef: intent.source.objectRef,
      bridgeInboxId,
      approvalChain: effectiveChain.map((s) => ({ stage: s.stage, reason: s.reason })),
      upstreamValidations: (intent.upstreamValidations ?? []).map((v) => ({
        stage: v.stage,
        role: v.role ?? null,
        decision: v.decision,
        signedAt: v.signedAt,
      })),
    },
  }).catch(() => undefined);

  await appendAudit({
    entityType: 'ExpenseRequest',
    entityId: created.id,
    action: AuditAction.EXPENSE_REQUEST_SUBMITTED,
    actorId: systemUserId,
    payload: { reference, via: 'bridge', initialStatus },
  }).catch(() => undefined);

  // Notifier les approbateurs du premier cran (best-effort).
  const firstSlot = effectiveChain[0];
  if (firstSlot) {
    for (const role of firstSlot.allowedRoles) {
      await notifyHoldingRole(role, {
        title: 'Demande a valider (pont) : ' + reference,
        body: intent.content.title + ' (' + amountStr + ' ' + currency + ') — source ' + source,
        linkUrl: '/expense-requests/' + created.id,
        entityType: 'ExpenseRequest',
        entityId: created.id,
      }).catch(() => undefined);
    }
  }

  return { ok: true, expenseRequestId: created.id, reference, status: initialStatus };
}
