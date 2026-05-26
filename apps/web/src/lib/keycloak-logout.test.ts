import { describe, it, expect } from 'vitest'
import { buildKeycloakLogoutUrl } from './keycloak-logout'

describe('buildKeycloakLogoutUrl', () => {
  const issuer = 'https://auth.rwa-core.com/realms/rwa'
  it('includes id_token_hint when provided', () => {
    const url = buildKeycloakLogoutUrl({
      issuer, clientId: 'rwa-finances',
      postLogoutRedirectUri: 'https://finances.rwa-core.com/login?reason=signed_out',
      idToken: 'TOK',
    })
    const q = new URL(url).searchParams
    expect(q.get('id_token_hint')).toBe('TOK')
    expect(q.get('client_id')).toBe('rwa-finances')
  })
  it('omits id_token_hint when absent', () => {
    const url = buildKeycloakLogoutUrl({
      issuer, clientId: 'rwa-finances',
      postLogoutRedirectUri: 'https://finances.rwa-core.com/login',
    })
    expect(new URL(url).searchParams.has('id_token_hint')).toBe(false)
  })
})
