// =============================================================================
// Route : GET /api/purchase-orders/[id]/pdf
// =============================================================================
// Genere le BC (Modele 4) en PDF avec snapshot RIB anti-fraude + QR de
// verification chaine audit.
// =============================================================================

import { createElement } from 'react';

import { prisma } from '@reliance-finance/database';

import { PurchaseOrderPdf, type PurchaseOrderPdfData } from '@/lib/pdf/templates/purchase-order';
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

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      supplier: { select: { code: true, name: true, address: true } },
      expenseRequest: { select: { reference: true } },
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
  if (!po) return new Response('Not found', { status: 404 });

  const denied = assertEntityVisible(a, po.entityId);
  if (denied) return denied;

  // RIB snapshot
  let ribSnapshot: { iban?: string | null; rib?: string | null; holderName?: string | null } | null =
    null;
  if (po.bankAccountSnapshotId) {
    const ba = await prisma.bankAccount.findUnique({
      where: { id: po.bankAccountSnapshotId },
      select: { iban: true, rib: true, holderName: true },
    });
    if (ba) ribSnapshot = ba;
  }

  const envelope = await buildVerifyEnvelope({
    baseUrl: resolveBaseUrl(req),
    entityType: 'PurchaseOrder',
    entityId: po.id,
  });

  const signedAt = po.workflowInstance?.signatures.at(-1)?.signedAt ?? null;
  const vatRate = po.totalTtc.toString() !== po.subtotalHt.toString()
    ? (
        ((Number(po.totalTtc.toString()) - Number(po.subtotalHt.toString())) /
          Number(po.subtotalHt.toString())) *
        100
      ).toFixed(2)
    : '0';

  const data: PurchaseOrderPdfData = {
    reference: po.reference,
    status: po.status,
    title: po.objet,
    amountHT: po.subtotalHt.toString(),
    amountTTC: po.totalTtc.toString(),
    vatRate,
    currency: po.currency,
    signedAt,
    createdAt: po.createdAt,
    deliveryAddress: po.deliveryLocation,
    paymentTerms: po.paymentTerms,
    warrantyMonths: po.warrantyMonths,
    penaltyClause: po.penaltyPerDay ? `${formatAmount(po.penaltyPerDay.toString(), 0)} ${po.currency}/jour` : null,
    entity: po.entity,
    supplier: {
      code: po.supplier.code,
      name: po.supplier.name,
      address: po.supplier.address,
      rib: ribSnapshot?.iban ?? ribSnapshot?.rib ?? null,
      rib_holder: ribSnapshot?.holderName ?? null,
    },
    expenseRequestRef: po.expenseRequest?.reference ?? null,
    items: po.items.map((it) => ({
      position: it.position,
      description: it.description,
      quantity: it.quantity.toString(),
      unit: it.unit,
      unitPrice: formatAmount(it.unitPrice.toString(), 0),
      total: formatAmount(it.totalHt.toString(), 0),
    })),
    signatures: (po.workflowInstance?.signatures ?? []).map((s) => ({
      role: s.role,
      name: s.actor.name ?? s.actor.email,
      date: s.signedAt,
      hash: s.signatureHash,
    })),
    verifyUrl: envelope.verifyUrl,
    qrDataUrl: envelope.qrDataUrl,
    chainTip: envelope.chainTip,
  };

  const buffer = await renderPdfBuffer(createElement(PurchaseOrderPdf, { data }));
  return pdfResponse(buffer, `${po.reference}.pdf`, { inline: true });
}
