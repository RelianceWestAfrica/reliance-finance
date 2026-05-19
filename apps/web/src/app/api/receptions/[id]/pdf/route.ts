// =============================================================================
// Route : GET /api/receptions/[id]/pdf
// =============================================================================
// Genere le PV de reception (Modele 5) avec signatures Operations + Technique
// + Finance + QR de verification.
// =============================================================================

import { createElement } from 'react';

import { prisma } from '@reliance-finance/database';

import { ReceptionPdf, type ReceptionPdfData } from '@/lib/pdf/templates/reception';
import {
  buildVerifyEnvelope,
  pdfResponse,
  renderPdfBuffer,
  resolveBaseUrl,
} from '@/lib/pdf/render';
import { requirePdfAuth, assertEntityVisible } from '@/lib/pdf/auth-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requirePdfAuth();
  if (!a.ok) return a.response;

  const { id } = await ctx.params;

  const r = await prisma.reception.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      purchaseOrder: {
        select: { reference: true, supplierId: true, supplier: { select: { code: true, name: true } } },
      },
      items: { orderBy: { position: 'asc' } },
      workflowInstance: {
        include: {
          signatures: {
            orderBy: { signedAt: 'asc' },
            include: { actor: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });
  if (!r) return new Response('Not found', { status: 404 });

  const denied = assertEntityVisible(a, r.entityId);
  if (denied) return denied;

  const envelope = await buildVerifyEnvelope({
    baseUrl: resolveBaseUrl(req),
    entityType: 'Reception',
    entityId: r.id,
  });

  const conformity = r.isFullyCompliant
    ? 'FULL'
    : r.hasReserves
      ? 'PARTIAL'
      : 'NON_CONFORM';

  const data: ReceptionPdfData = {
    reference: r.reference,
    status: r.status,
    type: r.type,
    receivedAt: r.receptionDate,
    location: r.location,
    notes: r.decision,
    conformity,
    observations: r.reservesDetail,
    createdAt: r.createdAt,
    entity: r.entity,
    supplier: r.purchaseOrder.supplier,
    purchaseOrderRef: r.purchaseOrder.reference,
    items: r.items.map((it) => ({
      position: it.position,
      description: it.description,
      quantity: `${it.quantityReceived.toString()} / ${it.quantityExpected.toString()}`,
      unit: null,
      unitPrice: null,
      total: it.isCompliant ? 'OK' : 'NC',
    })),
    signatures: (r.workflowInstance?.signatures ?? []).map((s) => ({
      role: s.role,
      name: s.actor.name ?? s.actor.email,
      date: s.signedAt,
      hash: s.signatureHash,
    })),
    verifyUrl: envelope.verifyUrl,
    qrDataUrl: envelope.qrDataUrl,
    chainTip: envelope.chainTip,
  };

  const buffer = await renderPdfBuffer(createElement(ReceptionPdf, { data }));
  return pdfResponse(buffer, `${r.reference}.pdf`, { inline: true });
}
