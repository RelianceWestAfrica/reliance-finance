import { NextResponse, type NextRequest } from 'next/server';
import { auth, signOut } from '@/lib/auth';
import { buildKeycloakLogoutUrl } from '@/lib/keycloak-logout';

export async function GET(req: NextRequest) {
  const session = await auth();
  const base = process.env.AUTH_URL ?? req.nextUrl.origin;
  const postLogoutRedirectUri = `${base.replace(/\/$/, '')}/login?reason=signed_out`;
  const idToken = session?.idToken;
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_ID;

  await signOut({ redirect: false });

  // Always redirect to Keycloak end_session when the client is configured —
  // even if the legacy session doesn't carry an id_token_hint. Keycloak will
  // show a brief confirmation in that case, but the SSO session WILL be
  // terminated (otherwise silent-SSO loops the user right back in).
  if (issuer && clientId) {
    return NextResponse.redirect(
      buildKeycloakLogoutUrl({ issuer, clientId, postLogoutRedirectUri, idToken }),
    );
  }
  return NextResponse.redirect(postLogoutRedirectUri);
}
