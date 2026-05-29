import { afterEach, describe, expect, it } from 'vitest';

import { bridgeSecretEnvKey, getBridgeSecret, isKnownBridgeSource } from './secrets.js';

describe('bridgeSecretEnvKey', () => {
  it('normalise le nom d app en cle d env', () => {
    expect(bridgeSecretEnvKey('rwa-btp')).toBe('BRIDGE_SECRET__RWA_BTP');
    expect(bridgeSecretEnvKey('rwa-achats-logistique')).toBe(
      'BRIDGE_SECRET__RWA_ACHATS_LOGISTIQUE',
    );
    expect(bridgeSecretEnvKey('reliance-domains')).toBe('BRIDGE_SECRET__RELIANCE_DOMAINS');
  });
});

describe('isKnownBridgeSource', () => {
  it('reconnait les sources autorisees', () => {
    expect(isKnownBridgeSource('rwa-btp')).toBe(true);
    expect(isKnownBridgeSource('reliance-domains')).toBe(true);
    expect(isKnownBridgeSource('reliance-escalade')).toBe(true);
  });
  it('rejette une source inconnue', () => {
    expect(isKnownBridgeSource('evil-app')).toBe(false);
    expect(isKnownBridgeSource('')).toBe(false);
  });
});

describe('getBridgeSecret', () => {
  const KEY = 'BRIDGE_SECRET__RWA_BTP';
  afterEach(() => {
    delete process.env[KEY];
  });
  it('lit la variable d env correspondante', () => {
    process.env[KEY] = 'super-secret-value-of-32-characters!!';
    expect(getBridgeSecret('rwa-btp')).toBe('super-secret-value-of-32-characters!!');
  });
  it('retourne undefined si non configuree', () => {
    expect(getBridgeSecret('rwa-btp')).toBeUndefined();
  });
});
