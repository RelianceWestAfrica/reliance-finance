// =============================================================================
// Route : GET /api/payments/[id]/pdf
// =============================================================================
// Genere le recu de paiement avec double validation anti-fraude + QR de
// verification.
// =============================================================================

import { createElement } from 'react';

import { prisma } from '@reliance-finance/database';

import { PaymentReceiptPdf, type PaymentReceiptPdfData } from '@/lib/pdf/templates/payment-receipt';
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

  const p = await prisma.payment.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      invoice: {
        select: {
          reference: true,
          supplier: { select: { code: true, name: true } },
          purchaseOrder: { select: { reference: true } },
        },
      },
      bankAccount: { select: { bankName: true, iban: true, rib: true, holderName: true } },
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
  if (!p) return new Response('Not found', { status: 404 });

  const denied = assertEntityVisible(a, p.entityId);
  if (denied) return denied;

  const envelope = await buildVerifyEnvelope({
    baseUrl: resolveBaseUrl(req),
    entityType: 'Payment',
    entityId: p.id,
  });

  const supplier = p.invoice?.supplier ?? { code: '-', name: p.beneficiaryName };

  const data: PaymentReceiptPdfData = {
    reference: p.reference,
    status: p.status,
    method: p.method,
    amount: p.amount.toString(),
    currency: p.currency,
    scheduledAt: p.scheduledAt,
    executedAt: p.executedAt,
    proofUrl: p.bankProofUrl,
    entity: p.entity,
    supplier,
    invoiceRef: p.invoice?.reference ?? null,
    purchaseOrderRef: p.invoice?.purchaseOrder?.reference ?? null,
    beneficiaryRib:
      p.beneficiaryIban ?? p.beneficiaryRib ?? p.bankAccount.iban ?? p.bankAccount.rib ?? '-',
    beneficiaryHolderName: p.beneficiaryName ?? p.bankAccount.holderName,
    bankName: p.bankAccount.bankName,
    signatures: (p.workflowInstance?.signatures ?? []).map((s) => ({
      role: s.role,
      name: s.actor.name ?? s.actor.email,
      date: s.signedAt,
      hash: s.signatureHash,
    })),
    verifyUrl: envelope.verifyUrl,
    qrDataUrl: envelope.qrDataUrl,
    chainTip: envelope.chainTip,
  };

  const buffer = await renderPdfBuffer(createElement(PaymentReceiptPdf, { data }));
  return pdfResponse(buffer, `${p.reference}.pdf`, { inline: true });
}
