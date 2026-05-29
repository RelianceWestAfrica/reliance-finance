// =============================================================================
// API REST - POST /api/v1/bridge/intents
// =============================================================================
// Reception entrante du pont financier inter-plateformes (cf. ADR 0003).
// Auth : HMAC-SHA256 par source (X-RWA-Bridge-Signature sur `${ts}.${rawBody}`)
// + anti-replay (timestamp) + idempotence (Idempotency-Key).
// Aucune session NextAuth : appel machine-a-machine.
// Inerte tant qu'aucun secret BRIDGE_SECRET__<APP> n'est configure.
// =============================================================================

import { NextResponse } from 'next/server';

import { BRIDGE_HEADERS, parseFinancialIntent } from '@reliancewestafrica/bridge-contract';

import { authenticateBridgeRequest } from '@/lib/bridge/authenticate';
import { processFinancialIntent } from '@/lib/bridge/process-intent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  // Corps BRUT exact : indispensable pour recalculer la signature HMAC.
  const rawBody = await req.text();

  const authResult = authenticateBridgeRequest(req, rawBody);
  if (!authResult.ok) {
    return NextResponse.json(
      { received: false, error: { code: authResult.code, message: authResult.message } },
      { status: authResult.status, headers: NO_STORE },
    );
  }

  const idempotencyKey = req.headers.get(BRIDGE_HEADERS.IDEMPOTENCY_KEY);
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return NextResponse.json(
      {
        received: false,
        error: {
          code: 'IDEMPOTENCY_KEY_MISSING',
          message: 'En-tete Idempotency-Key requis (>= 8 caracteres)',
        },
      },
      { status: 400, headers: NO_STORE },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { received: false, error: { code: 'INVALID_JSON', message: 'Corps JSON invalide' } },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = parseFinancialIntent(json);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        received: false,
        error: { code: 'SCHEMA_INVALID', message: parsed.error.message, field: parsed.error.path },
      },
      { status: 422, headers: NO_STORE },
    );
  }

  // Coherences transport <-> payload
  if (parsed.intent.source.app !== authResult.source) {
    return NextResponse.json(
      {
        received: false,
        error: { code: 'SOURCE_MISMATCH', message: 'source.app != en-tete X-RWA-Bridge-Source' },
      },
      { status: 400, headers: NO_STORE },
    );
  }
  if (parsed.intent.intentId !== idempotencyKey) {
    return NextResponse.json(
      {
        received: false,
        error: { code: 'IDEMPOTENCY_MISMATCH', message: 'intentId doit egaler Idempotency-Key' },
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await processFinancialIntent({
    source: authResult.source,
    rawBody,
    idempotencyKey,
    intent: parsed.intent,
  });

  return NextResponse.json(result.body, { status: result.httpStatus, headers: NO_STORE });
}
