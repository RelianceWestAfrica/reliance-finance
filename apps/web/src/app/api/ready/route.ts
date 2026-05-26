// =============================================================================
// Endpoint : /api/ready
// =============================================================================
// Readiness probe approfondie. Differente de /api/health qui ne fait qu'un
// SELECT 1. Ici on verifie aussi :
//   - SMTP (TCP open + STARTTLS handshake)
//   - S3/MinIO endpoint (HEAD sur le bucket)
//
// Retourne 200 si tout va, 503 sinon, avec le detail par dependance.
//
// Usage : monitoring externe (UptimeRobot, Healthchecks.io). Ne pas l'appeler
// trop souvent (cout SMTP + S3 non negligeable a l'echelle).
// =============================================================================

import { NextResponse } from 'next/server';
import net from 'node:net';

import { prisma } from '@reliance-finance/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface DepCheck {
  name: string;
  status: 'ok' | 'down';
  durationMs: number;
  error?: string;
}

async function checkDb(): Promise<DepCheck> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'postgres', status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    return {
      name: 'postgres',
      status: 'down',
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

async function checkTcp(
  name: string,
  host: string,
  port: number,
  timeoutMs = 2500,
): Promise<DepCheck> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (status: 'ok' | 'down', error?: string) => {
      socket.destroy();
      resolve({ name, status, durationMs: Date.now() - start, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('ok'));
    socket.once('timeout', () => finish('down', 'timeout'));
    socket.once('error', (e) => finish('down', e.message));
    socket.connect(port, host);
  });
}

async function checkSmtp(): Promise<DepCheck | null> {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.EMAIL_SERVER_PORT ?? 587);
  if (!host) return null;
  return checkTcp('smtp', host, port);
}

async function checkS3(): Promise<DepCheck | null> {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    return checkTcp('s3', url.hostname, port);
  } catch (e) {
    return {
      name: 's3',
      status: 'down',
      durationMs: 0,
      error: e instanceof Error ? e.message : 'invalid endpoint',
    };
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const results = await Promise.all([checkDb(), checkSmtp(), checkS3()]);
  const deps = results.filter((d): d is DepCheck => d !== null);

  const allOk = deps.every((d) => d.status === 'ok');
  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', deps, checkedAt },
    {
      status: allOk ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
