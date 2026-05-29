import { afterEach, describe, expect, it } from 'vitest';

import { bridgeCallbackUrlEnvKey, getBridgeCallbackUrl } from './secrets.js';

describe('bridgeCallbackUrlEnvKey', () => {
  it('normalise le nom d app en cle d env', () => {
    expect(bridgeCallbackUrlEnvKey('rwa-btp')).toBe('BRIDGE_CALLBACK_URL__RWA_BTP');
    expect(bridgeCallbackUrlEnvKey('reliance-domains')).toBe(
      'BRIDGE_CALLBACK_URL__RELIANCE_DOMAINS',
    );
  });
});

describe('getBridgeCallbackUrl', () => {
  const KEY = 'BRIDGE_CALLBACK_URL__RWA_BTP';
  afterEach(() => {
    delete process.env[KEY];
  });
  it('lit la variable d env correspondante', () => {
    process.env[KEY] = 'https://chantier.rwa-core.com/api/bridge/callbacks';
    expect(getBridgeCallbackUrl('rwa-btp')).toBe(
      'https://chantier.rwa-core.com/api/bridge/callbacks',
    );
  });
  it('retourne undefined si non configuree', () => {
    expect(getBridgeCallbackUrl('rwa-btp')).toBeUndefined();
  });
});
