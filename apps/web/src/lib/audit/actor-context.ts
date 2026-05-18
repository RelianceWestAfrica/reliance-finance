// =============================================================================
// Audit - Capture IP / User-Agent depuis les headers Next.js
// =============================================================================

import { headers } from 'next/headers';

export async function getRequestActorContext() {
  const h = await headers();
  const forwardedFor = h.get('x-forwarded-for');
  const ip =
    (forwardedFor && forwardedFor.split(',')[0]?.trim()) ??
    h.get('x-real-ip') ??
    null;
  const userAgent = h.get('user-agent') ?? null;
  return { ip, userAgent };
}
