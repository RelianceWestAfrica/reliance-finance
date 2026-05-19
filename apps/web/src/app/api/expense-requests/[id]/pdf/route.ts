// =============================================================================
// Route : GET /api/expense-requests/[id]/pdf
// =============================================================================
// Genere le dossier FDA/FD (Modele 1 procedure) en PDF avec QR de
// verification de la chaine audit.
// =============================================================================

import { createElement } from 'react';

import { prisma } from '@reliance-finance/database';

import { ExpenseRequestPdf, type ExpenseRequestPdfData } from '@/lib/pdf/templates/expense-request';
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

  const er = await prisma.expenseRequest.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      project: { select: { code: true, name: true } },
      costCenter: { select: { code: true, name: true } },
      supplier: { select: { code: true, name: true } },
      createdBy: { select: { name: true, email: true } },
      items: { orderBy: { position: 'asc' } },
      attachments: { select: { id: true } },
      workflowInstance: {
        include: {
          signatures: {
            orderBy: { signedAt: 'asc' },
            include: {
              actor: { select: { name: true, email: true } },
              step: { select: { stage: true, action: true } },
            },
          },
        },
      },
    },
  });
  if (!er) return new Response('Not found', { status: 404 });

  const denied = assertEntityVisible(a, er.entityId);
  if (denied) return denied;

  const envelope = await buildVerifyEnvelope({
    baseUrl: resolveBaseUrl(req),
    entityType: 'ExpenseRequest',
    entityId: er.id,
  });

  const data: ExpenseRequestPdfData = {
    reference: er.reference,
    type: er.type,
    status: er.status,
    title: er.title,
    description: er.description,
    justification: er.justification,
    urgency: er.urgency,
    urgencyReason: er.urgencyReason,
    opexCapex: er.opexCapex,
    amount: er.amount.toString(),
    currency: er.currency,
    budgetLineRef: er.budgetLineRef,
    isOutOfBudget: er.isOutOfBudget,
    desiredDate: er.desiredDate,
    emergencyDeadlineAt: er.emergencyDeadlineAt,
    regularizedAt: er.regularizedAt,
    location: er.location,
    createdAt: er.createdAt,
    entity: er.entity,
    project: er.project,
    costCenter: er.costCenter,
    supplier: er.supplier,
    createdBy: er.createdBy,
    items: er.items.map((it) => ({
      position: it.position,
      description: it.description,
      quantity: it.quantity?.toString(),
      unit: it.unit,
      unitPrice: it.unitPrice ? formatAmount(it.unitPrice.toString(), 0) : null,
      total: it.totalPrice ? formatAmount(it.totalPrice.toString(), 0) : null,
    })),
    signatures: (er.workflowInstance?.signatures ?? []).map((s) => ({
      role: formatStageRole(s.stage, s.role),
      name: s.actor.name ?? s.actor.email,
      date: s.signedAt,
      hash: s.signatureHash,
    })),
    attachmentsCount: er.attachments.length,
    verifyUrl: envelope.verifyUrl,
    qrDataUrl: envelope.qrDataUrl,
    chainTip: envelope.chainTip,
  };

  const buffer = await renderPdfBuffer(createElement(ExpenseRequestPdf, { data }));
  return pdfResponse(buffer, `${er.reference}.pdf`, { inline: true });
}

function formatStageRole(stage: string, role: string): string {
  const stageLabel: Record<string, string> = {
    REQUEST: 'Demande',
    APPROVAL_LEVEL_1: 'Validation N1',
    APPROVAL_LEVEL_2: 'Validation N2',
    APPROVAL_GROUP: 'Validation Groupe',
    APPROVAL_AG: 'Validation AG',
    SIGNATURE: 'Signature',
    EXECUTION: 'Execution',
    RECEPTION: 'Reception',
    ACKNOWLEDGE: 'Prise en compte',
  };
  return `${stageLabel[stage] ?? stage} - ${role}`;
}
