// =============================================================================
// Pont financier - Signature HMAC (calque la convention org "IAM contract")
// =============================================================================
// Signature = HMAC-SHA256( `${timestamp}.${rawBody}` , secret ) en hex, prefixee
// `sha256=`. Verification timing-safe + fenetre anti-replay sur le timestamp.
// Le `rawBody` DOIT etre le corps brut exact (octets recus), jamais un re-stringify
// (sinon la signature ne correspond plus).
// =============================================================================

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { BRIDGE_TIMESTAMP_TOLERANCE_SECONDS } from './constants.js';

/** Calcule l'en-tete de signature `sha256=<hex>` pour un corps brut donne. */
export function computeBridgeSignature(
  timestamp: string | number,
  rawBody: string,
  secret: string,
): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `sha256=${mac}`;
}

/** SHA-256 hex d'une chaine (utilise pour le payloadHash d'idempotence). */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export type BridgeVerifyFailure =
  | 'CONFIG' // secret absent / trop court cote serveur
  | 'MISSING' // header signature ou timestamp absent
  | 'MALFORMED' // format de signature invalide
  | 'STALE' // timestamp hors fenetre anti-replay
  | 'MISMATCH'; // signature ne correspond pas

export type BridgeVerifyResult = { ok: true } | { ok: false; reason: BridgeVerifyFailure };

/** Verifie que le timestamp (epoch secondes) est dans la fenetre de tolerance. */
export function isTimestampFresh(
  timestamp: string,
  nowMs: number = Date.now(),
  toleranceSeconds: number = BRIDGE_TIMESTAMP_TOLERANCE_SECONDS,
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const deltaSeconds = Math.abs(nowMs / 1000 - ts);
  return deltaSeconds <= toleranceSeconds;
}

/**
 * Verifie une signature de pont entrante. Comparaison constant-time.
 * `secret` est le secret partage propre a la source emettrice.
 */
export function verifyBridgeSignature(params: {
  signatureHeader: string | null | undefined;
  timestamp: string | null | undefined;
  rawBody: string;
  secret: string | undefined;
  nowMs?: number;
  toleranceSeconds?: number;
}): BridgeVerifyResult {
  const { signatureHeader, timestamp, rawBody, secret } = params;

  if (!secret || secret.length < 16) return { ok: false, reason: 'CONFIG' };
  if (!signatureHeader || !timestamp) return { ok: false, reason: 'MISSING' };
  if (!/^sha256=[a-f0-9]{64}$/i.test(signatureHeader)) return { ok: false, reason: 'MALFORMED' };
  if (!isTimestampFresh(timestamp, params.nowMs, params.toleranceSeconds)) {
    return { ok: false, reason: 'STALE' };
  }

  const expected = computeBridgeSignature(timestamp, rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return { ok: false, reason: 'MISMATCH' };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'MISMATCH' };

  return { ok: true };
}
