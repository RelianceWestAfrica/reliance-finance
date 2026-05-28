/**
 * Build the Keycloak RP-initiated logout (end-session) URL for front-channel
 * Single-Logout. Pure function (no env reads) so it is unit-testable.
 */
export function buildKeycloakLogoutUrl(params: {
  issuer: string; // e.g. https://auth.rwa-core.com/realms/rwa
  clientId: string;
  postLogoutRedirectUri: string;
  idToken?: string;
}): string {
  const base = `${params.issuer}/protocol/openid-connect/logout`;
  const query = new URLSearchParams({
    post_logout_redirect_uri: params.postLogoutRedirectUri,
    client_id: params.clientId,
  });
  if (params.idToken) query.set('id_token_hint', params.idToken);
  return `${base}?${query.toString()}`;
}
