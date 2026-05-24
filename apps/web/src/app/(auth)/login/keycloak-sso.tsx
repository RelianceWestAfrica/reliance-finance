'use client';

import { useEffect, useTransition } from 'react';
import { signInWithKeycloakAction } from './sso-actions';

/**
 * Entrée SSO RWA Core (Keycloak). Quand `auto` est vrai, redirige vers le
 * portail d'authentification dès le montage (aucune saisie locale). En cas
 * d'erreur SSO (param `error`), on n'auto-redirige PAS pour éviter une boucle.
 */
export function KeycloakSso({
  callbackUrl,
  auto = false,
}: {
  callbackUrl?: string;
  auto?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function go() {
    startTransition(() => {
      void signInWithKeycloakAction(callbackUrl);
    });
  }

  useEffect(() => {
    if (auto) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <button
      type="button"
      onClick={go}
      disabled={isPending}
      className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-2 disabled:opacity-60"
    >
      {auto ? 'Redirection vers le portail RWA Core…' : 'Continuer avec le portail (SSO)'}
    </button>
  );
}
