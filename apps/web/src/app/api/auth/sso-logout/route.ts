import { NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';
import { buildKeycloakLogoutUrl } from '@/lib/keycloak-logout';

export async function GET() {
  // After logout, land on the central RWA Core portal (single SSO entry point),
  // not this app's own login page. Override with PORTAL_URL if needed.
  const portalBase = (process.env.PORTAL_URL ?? 'https://portal.rwa-core.com').replace(/\/$/, '');
  const postLogoutRedirectUri = `${portalBase}/login?reason=signed_out`;
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_ID;

  // Clear the local NextAuth cookie.
  await signOut({ redirect: false });

  // Redirect to Keycloak end_session to terminate the SSO session too
  // (front-channel single-logout), then back to the portal.
  if (issuer && clientId) {
    return NextResponse.redirect(
      buildKeycloakLogoutUrl({ issuer, clientId, postLogoutRedirectUri }),
    );
  }
  return NextResponse.redirect(postLogoutRedirectUri);
}

// The logout button is a server-action <form action={logoutAction}> that submits
// via POST; Next.js forwards that POST (not a GET) to this route handler. Alias
// POST to GET so single-logout works regardless of the HTTP method.
export const POST = GET;
