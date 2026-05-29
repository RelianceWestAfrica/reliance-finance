// =============================================================================
// Pont financier - Callback de statut Finance -> source (P2, cf. ADR 0003)
// =============================================================================
// Quand un dossier issu du pont change de statut (APPROVED / REJECTED / PAID),
// Finance POSTe un callback signe HMAC vers le endpoint de la source. Signe avec
// le MEME secret partage que la reception (la source verifie avec son propre
// FINANCE_BRIDGE_SECRET). Best-effort : la source dispose aussi du GET de
// reconciliation (P0) en repli.
// =============================================================================

import { BRIDGE_HEADERS, computeBridgeSignature } from '@reliancewestafrica/bridge-contract';

import { prisma } from '@reliance-finance/database';

import { appendAudit, AuditAction } from '@/lib/audit/log';

import { getBridgeCallbackUrl, getBridgeSecret } from './secrets';

export interface CallbackResult {
  ok: boolean;
  httpStatus: number;
  error?: string;
}

export async function dispatchBridgeStatusCallback(params: {
  intentId: string;
  sourceApp: string;
  status: string;
  financeRef?: string | null;
}): Promise<CallbackResult> {
  const url = getBridgeCallbackUrl(params.sourceApp);
  const secret = getBridgeSecret(params.sourceApp);
  if (!url || !secret) {
    return { ok: false, httpStatus: 0, error: 'callback non configure (URL/secret absent)' };
  }

  const body = JSON.stringify({
    intentId: params.intentId,
    status: params.status,
    financeRef: params.financeRef ?? undefined,
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = computeBridgeSignature(ts, body, secret);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [BRIDGE_HEADERS.SOURCE]: 'reliance-finance',
        [BRIDGE_HEADERS.TIMESTAMP]: ts,
        [BRIDGE_HEADERS.SIGNATURE]: signature,
      },
      body,
    });
  } catch (e) {
    return { ok: false, httpStatus: 0, error: e instanceof Error ? e.message : 'erreur reseau' };
  }

  const ok = res.status >= 200 && res.status < 300;
  return { ok, httpStatus: res.status, error: ok ? undefined : `HTTP ${res.status}` };
}

/**
 * Notifie la source du nouveau statut d'un ExpenseRequest issu du pont.
 * No-op si l'ExpenseRequest n'a pas d'origine pont (pas de BridgeInbox associe).
 */
export async function notifyBridgeOnExpenseStatus(
  expenseRequestId: string,
  status: string,
): Promise<void> {
  const inbox = await prisma.bridgeInbox.findFirst({
    where: { financeObjectType: 'ExpenseRequest', financeObjectId: expenseRequestId },
    select: { id: true, idempotencyKey: true, sourceApp: true, financeRef: true },
  });
  if (!inbox) return; // dossier non issu du pont

  const result = await dispatchBridgeStatusCallback({
    intentId: inbox.idempotencyKey,
    sourceApp: inbox.sourceApp,
    status,
    financeRef: inbox.financeRef,
  });

  await appendAudit({
    entityType: 'BridgeInbox',
    entityId: inbox.id,
    action: result.ok ? AuditAction.BRIDGE_CALLBACK_SENT : AuditAction.BRIDGE_CALLBACK_FAILED,
    actorId: null,
    payload: {
      source: inbox.sourceApp,
      status,
      financeRef: inbox.financeRef,
      httpStatus: result.httpStatus,
      error: result.error,
    },
  }).catch(() => undefined);
}
