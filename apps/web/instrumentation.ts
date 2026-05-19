// =============================================================================
// Next.js instrumentation - hook officiel pour SDK observability
// =============================================================================
// Appele une fois par worker au demarrage. On charge Sentry server ou edge
// selon le runtime. Si SENTRY_DSN n'est pas defini, les configs no-op.
// =============================================================================

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config.js');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config.js');
  }
}

export { captureRequestError } from '@sentry/nextjs';
