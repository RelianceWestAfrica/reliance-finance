// =============================================================================
// Pont financier - Authentification d'une requete entrante (HMAC + anti-replay)
// =============================================================================

import { BRIDGE_HEADERS, verifyBridgeSignature } from '@reliance-finance/bridge-contract';

import { getBridgeSecret, isKnownBridgeSource } from './secrets';

export type BridgeAuthResult =
  | { ok: true; source: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * Verifie l'identite et l'integrite d'une requete de pont.
 * `rawBody` DOIT etre le corps brut exact (octets recus), pas un re-stringify.
 */
export function authenticateBridgeRequest(req: Request, rawBody: string): BridgeAuthResult {
  const source = req.headers.get(BRIDGE_HEADERS.SOURCE);
  if (!source) {
    return { ok: false, status: 401, code: 'SOURCE_MISSING', message: 'En-tete source manquant' };
  }
  if (!isKnownBridgeSource(source)) {
    return { ok: false, status: 403, code: 'SOURCE_UNKNOWN', message: 'Source non autorisee' };
  }

  const verdict = verifyBridgeSignature({
    signatureHeader: req.headers.get(BRIDGE_HEADERS.SIGNATURE),
    timestamp: req.headers.get(BRIDGE_HEADERS.TIMESTAMP),
    rawBody,
    secret: getBridgeSecret(source),
  });

  if (!verdict.ok) {
    const mapping: Record<string, { status: number; code: string }> = {
      CONFIG: { status: 503, code: 'BRIDGE_NOT_CONFIGURED' },
      MISSING: { status: 401, code: 'SIGNATURE_MISSING' },
      MALFORMED: { status: 400, code: 'SIGNATURE_MALFORMED' },
      STALE: { status: 401, code: 'TIMESTAMP_STALE' },
      MISMATCH: { status: 403, code: 'SIGNATURE_MISMATCH' },
    };
    const m = mapping[verdict.reason] ?? { status: 403, code: 'SIGNATURE_INVALID' };
    return {
      ok: false,
      status: m.status,
      code: m.code,
      message: 'Signature invalide (' + verdict.reason + ')',
    };
  }

  return { ok: true, source };
}
