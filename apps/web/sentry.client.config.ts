// =============================================================================
// Sentry config - client (browser)
// =============================================================================
// Initialise Sentry uniquement si NEXT_PUBLIC_SENTRY_DSN est defini, sinon
// no-op pour eviter la friction en dev / preview.
// =============================================================================

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.1,
    // Pas de Session Replay par defaut (privacy + cout)
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
  });
}
