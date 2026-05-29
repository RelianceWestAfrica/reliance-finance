// =============================================================================
// API REST - GET /api/v1/bridge/intents/[idempotencyKey]
// =============================================================================
// Reconciliation cote source : statut d'une intention deja poussee.
// Auth : meme HMAC que le POST, calcule sur un corps vide (rawBody = '').
// Une source ne voit que ses propres intentions.
// =============================================================================

import { NextResponse } from 'next/server';

import { authenticateBridgeRequest } from '@/lib/bridge/authenticate';
import { getBridgeIntentStatus } from '@/lib/bridge/process-intent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request, context: { params: Promise<{ idempotencyKey: string }> }) {
  const authResult = authenticateBridgeRequest(req, '');
  if (!authResult.ok) {
    return NextResponse.json(
      { error: { code: authResult.code, message: authResult.message } },
      { status: authResult.status, headers: NO_STORE },
    );
  }

  const { idempotencyKey } = await context.params;
  const status = await getBridgeIntentStatus(idempotencyKey);
  if (!status) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Intention inconnue' } },
      { status: 404, headers: NO_STORE },
    );
  }
  if (status.sourceApp !== authResult.source) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Intention hors perimetre de la source' } },
      { status: 403, headers: NO_STORE },
    );
  }

  return NextResponse.json(status, { headers: NO_STORE });
}
