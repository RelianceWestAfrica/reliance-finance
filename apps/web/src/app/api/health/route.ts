// =============================================================================
// Endpoint : /api/health
// =============================================================================
// Public liveness + readiness probe pour Traefik, Docker healthcheck et tout
// monitoring externe (UptimeRobot, Healthchecks.io, etc.).
//
// Retours :
//   200 { status: 'ok',         db: 'up',   uptimeSec: ... }
//   503 { status: 'degraded',   db: 'down', error: '...' }
//
// On ne renvoie AUCUNE info sensible (versions exactes, schema, etc.).
// =============================================================================

import { NextResponse } from 'next/server';

import { prisma } from '@reliance-finance/database';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const startedAt = Date.now();

export async function GET() {
  const checkedAt = new Date().toISOString();
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: 'ok', db: 'up', uptimeSec, checkedAt },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { status: 'degraded', db: 'down', uptimeSec, checkedAt, error: message },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
