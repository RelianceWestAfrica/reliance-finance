// =============================================================================
// Sentry config - server (Node runtime)
// =============================================================================

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.1,
    // Ne pas envoyer le contenu des audits (sensible) - filtrage simple
    beforeSend(event) {
      if (event.request?.data) {
        delete event.request.data;
      }
      return event;
    },
  });
}
