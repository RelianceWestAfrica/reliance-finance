// =============================================================================
// Sentry config - edge runtime (middleware, edge routes)
// =============================================================================
// Reliance Finance n'utilise pas le runtime edge (toutes les routes sont en
// runtime nodejs pour Prisma + auth). Ce fichier est requis par
// @sentry/nextjs mais reste minimal.
// =============================================================================

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.1,
  });
}
