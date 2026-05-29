// =============================================================================
// Pont financier - Resolution des secrets HMAC par source
// =============================================================================
// Un secret partage par app source : BRIDGE_SECRET__<APP> (>= 32 chars).
// Ex : BRIDGE_SECRET__RWA_BTP, BRIDGE_SECRET__RWA_ACHATS_LOGISTIQUE.
// Tant qu'aucun secret n'est configure, l'endpoint refuse la source (inerte).
// =============================================================================

import { BRIDGE_SOURCE_APPS, type BridgeSourceApp } from '@reliancewestafrica/bridge-contract';

/** Normalise un nom d'app en suffixe d'env var (RWA-BTP -> RWA_BTP). */
export function bridgeSecretEnvKey(app: string): string {
  return 'BRIDGE_SECRET__' + app.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function isKnownBridgeSource(app: string): app is BridgeSourceApp {
  return (BRIDGE_SOURCE_APPS as readonly string[]).includes(app);
}

export function getBridgeSecret(app: string): string | undefined {
  return process.env[bridgeSecretEnvKey(app)];
}
