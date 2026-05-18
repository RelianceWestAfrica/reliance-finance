// =============================================================================
// Cron - Authentification des endpoints planifies
// =============================================================================
// Les endpoints /api/cron/* sont appeles par un container `cron` interne au
// reseau Docker. Ils doivent etre proteges contre les appels externes
// directs (Traefik les expose sur le meme domaine).
//
// Strategie : header `X-Cron-Secret` doit egaler la variable d'env
// CRON_SECRET. Comparaison constant-time pour eviter timing attacks.
// =============================================================================

import { timingSafeEqual } from 'node:crypto';

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 500; message: string };

export function checkCronAuth(req: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) {
    return {
      ok: false,
      status: 500,
      message: 'CRON_SECRET non configure ou trop court (>=16 chars)',
    };
  }

  const provided = req.headers.get('x-cron-secret');
  if (!provided) {
    return { ok: false, status: 401, message: 'Header X-Cron-Secret manquant' };
  }

  // Comparaison constant-time
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    return { ok: false, status: 403, message: 'Secret invalide' };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, status: 403, message: 'Secret invalide' };
  }

  return { ok: true };
}
