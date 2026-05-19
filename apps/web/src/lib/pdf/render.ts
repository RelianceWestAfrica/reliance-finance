// =============================================================================
// PDF render - point d'entree unique
// =============================================================================
// Convertit un element React (template) en Buffer PDF cote serveur.
// Utilise par les Route Handlers /api/[resource]/[id]/pdf.
//
// IMPORTANT : doit tourner sur le runtime Node (pas Edge) car @react-pdf
// repose sur fs / fontkit. Les routes doivent declarer `export const runtime
// = 'nodejs'`.
// =============================================================================

import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

import { prisma } from '@reliance-finance/database';

import { buildVerifyUrl, generateVerifyQrDataUrl } from './qr.js';

export interface VerifyMeta {
  baseUrl: string;
  entityType: string;
  entityId: string;
}

export interface VerifyEnvelope {
  verifyUrl: string;
  qrDataUrl: string;
  chainTip: string | null;
}

/**
 * Construit le bloc de verification : QR code + lien + chain tip (8 premiers
 * chars du hash du dernier event audit sur cette entite).
 */
export async function buildVerifyEnvelope(meta: VerifyMeta): Promise<VerifyEnvelope> {
  const [qrDataUrl, lastEvent] = await Promise.all([
    generateVerifyQrDataUrl(meta),
    prisma.auditLog.findFirst({
      where: { entityType: meta.entityType, entityId: meta.entityId },
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    }),
  ]);
  return {
    verifyUrl: buildVerifyUrl(meta),
    qrDataUrl,
    chainTip: lastEvent?.hash?.slice(0, 16) ?? null,
  };
}

/**
 * Render un document React vers un Buffer PDF.
 *
 * Note: @react-pdf/renderer accepte directement le ReactElement de notre
 * Document (pas besoin de createElement explicite).
 */
export async function renderPdfBuffer(document: ReactElement): Promise<Buffer> {
  // @ts-expect-error renderToBuffer accepte un ReactElement Document; types
  // upstream sont stricts sur DocumentProps mais le runtime accepte tout
  // composant qui rend un <Document>.
  return renderToBuffer(document);
}

/**
 * Convertit le Buffer en Response Next.js avec les headers PDF.
 */
export function pdfResponse(
  buffer: Buffer,
  filename: string,
  options: { inline?: boolean } = {},
): Response {
  const disposition = options.inline ? 'inline' : 'attachment';
  // Convert Buffer to Uint8Array for Response (Web standard)
  const body = new Uint8Array(buffer);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${disposition}; filename="${sanitizeFilename(filename)}"`,
      'cache-control': 'private, no-store',
    },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export function resolveBaseUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
