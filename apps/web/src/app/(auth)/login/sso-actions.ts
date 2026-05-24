'use server';

import { signIn } from '@/lib/auth';

// Déclenche la redirection vers le portail SSO RWA Core (Keycloak).
// signIn() lève une redirection (NEXT_REDIRECT) gérée par Next.js.
export async function signInWithKeycloakAction(callbackUrl?: string): Promise<void> {
  await signIn('keycloak', { redirectTo: callbackUrl || '/dashboard' });
}
