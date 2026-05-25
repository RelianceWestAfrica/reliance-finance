import { NextResponse, type NextRequest } from 'next/server';
import { auth, signOut } from '@/lib/auth';
import { buildKeycloakLogoutUrl } from '@/lib/keycloak-logout';

export async function GET(req: NextRequest) {
  const session = await auth();
  const postLogoutRedirectUri = `${req.nextUrl.origin}/login?reason=signed_out`;
  const idToken = session?.idToken;
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_ID;

  await signOut({ redirect: false });

  if (idToken && issuer && clientId) {
    return NextResponse.redirect(
      buildKeycloakLogoutUrl({ issuer, clientId, postLogoutRedirectUri, idToken }),
    );
  }
  return NextResponse.redirect(postLogoutRedirectUri);
}
