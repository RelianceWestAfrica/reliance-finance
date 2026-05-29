// =============================================================================
// Pont financier - Orchestration de la reception (idempotence + dispatch)
// =============================================================================
// Gate atomique via la contrainte UNIQUE sur BridgeInbox.idempotencyKey :
// - 1ere reception -> create RECEIVED puis traitement -> COMMITTED / REJECTED / FAILED
// - rejeu d'une intention COMMITTED -> 200 idempotent (meme financeRef)
// v1 : DISBURSEMENT (decaissement -> ExpenseRequest) et COLLECTION (encaissement
// -> JournalEntry + CashForecastLine) sont mappes. PAYROLL_BATCH/INTERCO = ulterieurs.
// =============================================================================

import { sha256Hex, type FinancialIntent } from '@reliancewestafrica/bridge-contract';
import { BridgeInboxStatus, Prisma, prisma } from '@reliance-finance/database';

import { appendAudit, AuditAction } from '@/lib/audit/log';

import { createCollectionFromIntent } from './create-collection-from-intent';
import { createExpenseRequestFromIntent } from './create-expense-request-from-intent';

export interface ProcessIntentParams {
  source: string;
  rawBody: string;
  idempotencyKey: string;
  intent: FinancialIntent;
}

export interface ProcessIntentResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

async function markRejected(inboxId: string, code: string, message: string): Promise<void> {
  await prisma.bridgeInbox
    .update({
      where: { id: inboxId },
      data: { status: BridgeInboxStatus.REJECTED, errorCode: code, errorMessage: message },
    })
    .catch(() => undefined);
  await appendAudit({
    entityType: 'BridgeInbox',
    entityId: inboxId,
    action: AuditAction.BRIDGE_INTENT_REJECTED,
    actorId: null,
    payload: { code, message },
  }).catch(() => undefined);
}

export async function processFinancialIntent(
  params: ProcessIntentParams,
): Promise<ProcessIntentResult> {
  const { source, rawBody, idempotencyKey, intent } = params;
  const payloadHash = sha256Hex(rawBody);

  // --- Gate idempotent atomique -------------------------------------------
  let inboxId: string;
  try {
    const inbox = await prisma.bridgeInbox.create({
      data: {
        idempotencyKey,
        sourceApp: source,
        flowType: intent.flowType,
        schemaVersion: intent.schemaVersion,
        payloadHash,
        payload: intent as unknown as Prisma.InputJsonValue,
        status: BridgeInboxStatus.RECEIVED,
      },
      select: { id: true },
    });
    inboxId = inbox.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await prisma.bridgeInbox.findUnique({ where: { idempotencyKey } });
      if (existing?.status === BridgeInboxStatus.COMMITTED) {
        await appendAudit({
          entityType: 'BridgeInbox',
          entityId: existing.id,
          action: AuditAction.BRIDGE_INTENT_DUPLICATE,
          actorId: null,
          payload: { idempotencyKey, source },
        }).catch(() => undefined);
        return {
          httpStatus: 200,
          body: {
            received: true,
            idempotent: true,
            idempotencyKey,
            financeRef: existing.financeRef,
            financeObjectType: existing.financeObjectType,
            financeObjectId: existing.financeObjectId,
            status: existing.status,
          },
        };
      }
      return {
        httpStatus: 409,
        body: {
          received: false,
          idempotencyKey,
          status: existing?.status ?? 'UNKNOWN',
          error: {
            code: 'IN_PROGRESS_OR_REJECTED',
            message: 'Intention deja recue (en cours de traitement ou rejetee)',
          },
        },
      };
    }
    throw e;
  }

  // --- Dispatch par flowType ----------------------------------------------
  // v1 : DISBURSEMENT (decaissement) et COLLECTION (encaissement) sont mappes.
  if (intent.flowType !== 'DISBURSEMENT' && intent.flowType !== 'COLLECTION') {
    await markRejected(
      inboxId,
      'FLOW_NOT_IMPLEMENTED',
      'flowType ' + intent.flowType + ' non implemente en v1 (DISBURSEMENT, COLLECTION)',
    );
    return {
      httpStatus: 422,
      body: {
        received: false,
        idempotencyKey,
        error: { code: 'FLOW_NOT_IMPLEMENTED', message: 'flowType non supporte en v1' },
      },
    };
  }

  try {
    await prisma.bridgeInbox.update({
      where: { id: inboxId },
      data: { status: BridgeInboxStatus.PROCESSING, attempts: { increment: 1 } },
    });

    let financeObjectType: string;
    let financeObjectId: string;
    let financeRef: string;
    let financeStatus: string;

    if (intent.flowType === 'DISBURSEMENT') {
      const res = await createExpenseRequestFromIntent({ intent, source, bridgeInboxId: inboxId });
      if (!res.ok) {
        await markRejected(inboxId, res.code, res.message);
        return {
          httpStatus: 422,
          body: {
            received: false,
            idempotencyKey,
            error: { code: res.code, message: res.message, field: res.field },
          },
        };
      }
      financeObjectType = 'ExpenseRequest';
      financeObjectId = res.expenseRequestId;
      financeRef = res.reference;
      financeStatus = res.status;
    } else {
      const res = await createCollectionFromIntent({ intent, source, bridgeInboxId: inboxId });
      if (!res.ok) {
        await markRejected(inboxId, res.code, res.message);
        return {
          httpStatus: 422,
          body: {
            received: false,
            idempotencyKey,
            error: { code: res.code, message: res.message, field: res.field },
          },
        };
      }
      financeObjectType = 'JournalEntry';
      financeObjectId = res.journalEntryId;
      financeRef = res.reference;
      financeStatus = res.status;
    }

    await prisma.bridgeInbox.update({
      where: { id: inboxId },
      data: {
        status: BridgeInboxStatus.COMMITTED,
        committedAt: new Date(),
        financeObjectType,
        financeObjectId,
        financeRef,
        errorCode: null,
        errorMessage: null,
      },
    });
    await appendAudit({
      entityType: 'BridgeInbox',
      entityId: inboxId,
      action: AuditAction.BRIDGE_INTENT_COMMITTED,
      actorId: null,
      payload: {
        source,
        idempotencyKey,
        flowType: intent.flowType,
        financeRef,
        financeObjectId,
      },
    }).catch(() => undefined);

    return {
      httpStatus: 202,
      body: {
        received: true,
        idempotencyKey,
        financeRef,
        financeObjectType,
        financeObjectId,
        status: financeStatus,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    await prisma.bridgeInbox
      .update({
        where: { id: inboxId },
        data: { status: BridgeInboxStatus.FAILED, errorCode: 'INTERNAL', errorMessage: message },
      })
      .catch(() => undefined);
    await appendAudit({
      entityType: 'BridgeInbox',
      entityId: inboxId,
      action: AuditAction.BRIDGE_INTENT_FAILED,
      actorId: null,
      payload: { source, idempotencyKey, error: message },
    }).catch(() => undefined);
    return {
      httpStatus: 500,
      body: {
        received: false,
        idempotencyKey,
        error: { code: 'INTERNAL', message: 'Erreur interne lors du traitement' },
      },
    };
  }
}

/** Statut d'une intention pour la reconciliation cote source (GET). */
export async function getBridgeIntentStatus(idempotencyKey: string) {
  return prisma.bridgeInbox.findUnique({
    where: { idempotencyKey },
    select: {
      idempotencyKey: true,
      sourceApp: true,
      flowType: true,
      status: true,
      financeObjectType: true,
      financeObjectId: true,
      financeRef: true,
      errorCode: true,
      errorMessage: true,
      receivedAt: true,
      committedAt: true,
    },
  });
}
