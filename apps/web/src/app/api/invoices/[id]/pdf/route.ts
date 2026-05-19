// =============================================================================
// Route : GET /api/invoices/[id]/pdf
// =============================================================================
// Genere la facture / l'avoir avec 3-way match status + QR de verification.
// =============================================================================

import { createElement } from 'react';

import { prisma } from '@reliance-finance/database';

import { InvoicePdf, type InvoicePdfData } from '@/lib/pdf/templates/invoice';
import { formatAmount } from '@/lib/pdf/components';
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

  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      supplier: { select: { code: true, name: true } },
      purchaseOrder: { select: { reference: true } },
      reception: { select: { reference: true } },
      lines: { orderBy: { position: 'asc' } },
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
  if (!inv) return new Response('Not found', { status: 404 });

  const denied = assertEntityVisible(a, inv.entityId);
  if (denied) return denied;

  const envelope = await buildVerifyEnvelope({
    baseUrl: resolveBaseUrl(req),
    entityType: 'Invoice',
    entityId: inv.id,
  });

  // 3-way match status : MISSING_PV si pas de receptionId, sinon OK
  // (la detection d'ecart leve un Anomaly, ici on affiche un resume)
  const threeWayMatchStatus = !inv.receptionId
    ? 'MISSING_PV'
    : inv.disputeReason
      ? 'MISMATCH'
      : 'OK';

  const data: InvoicePdfData = {
    reference: inv.reference,
    type: inv.type,
    status: inv.status,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    totalHt: inv.subtotalHt.toString(),
    vatAmount: inv.taxAmount.toString(),
    totalTtc: inv.totalTtc.toString(),
    amountPaid: inv.amountPaid.toString(),
    currency: inv.currency,
    threeWayMatchStatus,
    createdAt: inv.receivedAt,
    entity: inv.entity,
    supplier: inv.supplier,
    purchaseOrderRef: inv.purchaseOrder?.reference ?? null,
    receptionRef: inv.reception?.reference ?? null,
    lines: inv.lines.map((l) => ({
      position: l.position,
      description: l.description,
      quantity: l.quantity?.toString() ?? null,
      unit: null,
      unitPrice: l.unitPrice ? formatAmount(l.unitPrice.toString(), 0) : null,
      total: formatAmount(l.totalHt.toString(), 0),
    })),
    signatures: (inv.workflowInstance?.signatures ?? []).map((s) => ({
      role: s.role,
      name: s.actor.name ?? s.actor.email,
      date: s.signedAt,
      hash: s.signatureHash,
    })),
    verifyUrl: envelope.verifyUrl,
    qrDataUrl: envelope.qrDataUrl,
    chainTip: envelope.chainTip,
  };

  const buffer = await renderPdfBuffer(createElement(InvoicePdf, { data }));
  return pdfResponse(buffer, `${inv.reference}.pdf`, { inline: true });
}
