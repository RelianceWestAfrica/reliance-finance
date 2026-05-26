'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import {
  prisma,
  DocumentType,
  InvoiceStatus,
  InvoiceType,
  RoleCode,
  AnomalyType,
  AnomalySeverity,
} from '@reliance-finance/database';

import { auth } from '@/lib/auth';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import { getRequestActorContext } from '@/lib/audit/actor-context';
import { allocateReference } from '@/lib/document-sequence/allocate';
import { threeWayMatch, DEFAULT_MATCH_CONFIG } from '@/lib/three-way-match/match';

// =============================================================================
// CREATE INVOICE
// =============================================================================

const createSchema = z.object({
  type: z.nativeEnum(InvoiceType).default(InvoiceType.STANDARD),
  entityId: z.string().cuid(),
  projectId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  supplierId: z.string().cuid(),
  purchaseOrderId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  receptionId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  originalInvoiceId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  invoiceNumber: z.string().min(1).max(100),
  invoiceDate: z.string(),
  dueDate: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  subtotalHt: z.coerce.number().min(0),
  taxAmount: z.coerce.number().min(0).default(0),
  retentionAmount: z.coerce.number().min(0).default(0),
  totalTtc: z.coerce.number().min(0),
  currency: z.string().length(3).toUpperCase().default('XOF'),
  taxLabel: z
    .string()
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  taxRate: z.coerce
    .number()
    .min(0)
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export async function createInvoice(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.DAF_PAYS,
      RoleCode.AP_OFFICER,
      RoleCode.COMPTABLE_PAYS,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = createSchema.safeParse({
    type: formData.get('type') ?? undefined,
    entityId: formData.get('entityId'),
    projectId: formData.get('projectId') ?? undefined,
    supplierId: formData.get('supplierId'),
    purchaseOrderId: formData.get('purchaseOrderId') ?? undefined,
    receptionId: formData.get('receptionId') ?? undefined,
    originalInvoiceId: formData.get('originalInvoiceId') ?? undefined,
    invoiceNumber: formData.get('invoiceNumber'),
    invoiceDate: formData.get('invoiceDate'),
    dueDate: formData.get('dueDate') ?? undefined,
    subtotalHt: formData.get('subtotalHt'),
    taxAmount: formData.get('taxAmount') ?? 0,
    retentionAmount: formData.get('retentionAmount') ?? 0,
    totalTtc: formData.get('totalTtc'),
    currency: formData.get('currency') ?? 'XOF',
    taxLabel: formData.get('taxLabel') ?? undefined,
    taxRate: formData.get('taxRate') ?? undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  // Si CREDIT_NOTE, originalInvoiceId obligatoire
  if (parsed.data.type === InvoiceType.CREDIT_NOTE && !parsed.data.originalInvoiceId) {
    return {
      ok: false,
      error: 'Un avoir (CREDIT_NOTE) doit etre rattache a une facture originale',
    };
  }

  // Verifier unicite (supplierId + invoiceNumber)
  const duplicate = await prisma.invoice.findUnique({
    where: {
      supplierId_invoiceNumber: {
        supplierId: parsed.data.supplierId,
        invoiceNumber: parsed.data.invoiceNumber,
      },
    },
    select: { id: true, reference: true },
  });
  if (duplicate) {
    return {
      ok: false,
      error:
        'Doublon detecte : facture ' +
        parsed.data.invoiceNumber +
        ' deja enregistree (' +
        duplicate.reference +
        ')',
    };
  }

  const [entity, project] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: parsed.data.entityId },
      select: { id: true, code: true },
    }),
    parsed.data.projectId
      ? prisma.project.findUnique({
          where: { id: parsed.data.projectId },
          select: { id: true, code: true },
        })
      : Promise.resolve(null),
  ]);
  if (!entity) return { ok: false, error: 'Entite introuvable' };

  const reference = await allocateReference({
    type: DocumentType.INVOICE,
    entityId: entity.id,
    entityCode: entity.code,
    projectId: project?.id ?? null,
    projectCode: project?.code ?? null,
  });

  const created = await prisma.invoice.create({
    data: {
      reference,
      type: parsed.data.type,
      status: InvoiceStatus.RECEIVED,
      entityId: parsed.data.entityId,
      projectId: parsed.data.projectId,
      supplierId: parsed.data.supplierId,
      purchaseOrderId: parsed.data.purchaseOrderId,
      receptionId: parsed.data.receptionId,
      originalInvoiceId: parsed.data.originalInvoiceId,
      createdById: session.user.id,
      invoiceNumber: parsed.data.invoiceNumber,
      invoiceDate: new Date(parsed.data.invoiceDate),
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      subtotalHt: parsed.data.subtotalHt,
      taxAmount: parsed.data.taxAmount,
      retentionAmount: parsed.data.retentionAmount,
      totalTtc: parsed.data.totalTtc,
      currency: parsed.data.currency,
      taxLabel: parsed.data.taxLabel,
      taxRate: typeof parsed.data.taxRate === 'number' ? parsed.data.taxRate : undefined,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Invoice',
    entityId: created.id,
    action:
      parsed.data.type === InvoiceType.CREDIT_NOTE
        ? AuditAction.CREDIT_NOTE_CREATED
        : AuditAction.INVOICE_CREATED,
    actorId: session.user.id,
    payload: {
      reference,
      type: parsed.data.type,
      invoiceNumber: parsed.data.invoiceNumber,
      supplierId: parsed.data.supplierId,
      totalTtc: parsed.data.totalTtc,
      originalInvoiceId: parsed.data.originalInvoiceId ?? null,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/invoices');
  return { ok: true, id: created.id };
}

// =============================================================================
// ADD INVOICE LINE
// =============================================================================

const addLineSchema = z.object({
  invoiceId: z.string().cuid(),
  position: z.coerce.number().int().positive(),
  description: z.string().min(2).max(500),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().positive(),
});

export async function addInvoiceLine(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const parsed = addLineSchema.safeParse({
    invoiceId: formData.get('invoiceId'),
    position: formData.get('position'),
    description: formData.get('description'),
    quantity: formData.get('quantity'),
    unitPrice: formData.get('unitPrice'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const invoice = await prisma.invoice.findUnique({
    where: { id: parsed.data.invoiceId },
    select: { status: true },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };
  if (invoice.status !== InvoiceStatus.RECEIVED) {
    return { ok: false, error: 'Edition impossible (statut : ' + invoice.status + ')' };
  }

  const totalHt = parsed.data.quantity * parsed.data.unitPrice;

  await prisma.invoiceLine.create({
    data: {
      invoiceId: parsed.data.invoiceId,
      position: parsed.data.position,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
      totalHt,
    },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Invoice',
    entityId: parsed.data.invoiceId,
    action: AuditAction.INVOICE_LINE_ADDED,
    actorId: session.user.id,
    payload: { position: parsed.data.position, totalHt },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/invoices/' + parsed.data.invoiceId);
  return { ok: true };
}

// =============================================================================
// RUN 3-WAY MATCH
// =============================================================================

export async function runThreeWayMatch(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; matchOk?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: 'asc' } },
      purchaseOrder: { include: { items: { orderBy: { position: 'asc' } } } },
      reception: { include: { items: { orderBy: { position: 'asc' } } } },
    },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };
  if (!invoice.purchaseOrder) {
    return { ok: false, error: 'Facture non rattachee a un BC - 3-way match impossible' };
  }

  await prisma.invoice.update({
    where: { id },
    data: { status: InvoiceStatus.CONTROL_3WAY_PENDING },
  });

  const bcItems = invoice.purchaseOrder.items.map((i) => ({
    position: i.position,
    description: i.description,
    quantity: Number(i.quantity.toString()),
    unitPrice: Number(i.unitPrice.toString()),
    totalHt: Number(i.totalHt.toString()),
  }));
  const recItems = invoice.reception
    ? invoice.reception.items.map((i) => ({
        position: i.position,
        description: i.description,
        quantityExpected: Number(i.quantityExpected.toString()),
        quantityReceived: Number(i.quantityReceived.toString()),
        isCompliant: i.isCompliant,
      }))
    : null;
  const invLines = invoice.lines.map((l) => ({
    position: l.position,
    description: l.description,
    quantity: Number(l.quantity.toString()),
    unitPrice: Number(l.unitPrice.toString()),
    totalHt: Number(l.totalHt.toString()),
  }));

  const result = threeWayMatch(
    bcItems,
    recItems,
    invLines,
    Number(invoice.subtotalHt.toString()),
    Number(invoice.purchaseOrder.subtotalHt.toString()),
    {
      ...DEFAULT_MATCH_CONFIG,
      // Si la facture n'a pas de reception liee, on relache cette garde
      requiresReception: !!invoice.receptionId,
    },
  );

  const { ip, userAgent } = await getRequestActorContext();
  const matchAction = result.ok
    ? AuditAction.INVOICE_THREE_WAY_MATCH_OK
    : AuditAction.INVOICE_THREE_WAY_MATCH_KO;

  await prisma.$transaction(async (tx) => {
    // Persist le resultat
    await tx.threeWayMatch.upsert({
      where: { invoiceId: invoice.id },
      create: {
        invoiceId: invoice.id,
        purchaseOrderId: invoice.purchaseOrder!.id,
        receptionId: invoice.receptionId ?? '',
        quantityMatch: result.quantityMatch,
        priceMatch: result.priceMatch,
        totalMatch: result.totalMatch,
        discrepancies: JSON.parse(JSON.stringify(result.discrepancies)),
        checkedById: session.user.id,
      },
      update: {
        purchaseOrderId: invoice.purchaseOrder!.id,
        receptionId: invoice.receptionId ?? '',
        quantityMatch: result.quantityMatch,
        priceMatch: result.priceMatch,
        totalMatch: result.totalMatch,
        discrepancies: JSON.parse(JSON.stringify(result.discrepancies)),
        checkedAt: new Date(),
        checkedById: session.user.id,
      },
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: result.ok ? InvoiceStatus.CONTROL_3WAY_OK : InvoiceStatus.CONTROL_3WAY_KO },
    });
  });

  await appendAudit({
    entityType: 'Invoice',
    entityId: invoice.id,
    action: AuditAction.INVOICE_THREE_WAY_MATCH_RUN,
    actorId: session.user.id,
    payload: {
      reference: invoice.reference,
      ok: result.ok,
      quantityMatch: result.quantityMatch,
      priceMatch: result.priceMatch,
      totalMatch: result.totalMatch,
      discrepancyCount: result.discrepancies.length,
    },
    ip,
    userAgent,
  }).catch(() => undefined);

  await appendAudit({
    entityType: 'Invoice',
    entityId: invoice.id,
    action: matchAction,
    actorId: session.user.id,
    payload: { discrepancies: result.discrepancies },
    ip,
    userAgent,
  }).catch(() => undefined);

  // Si ecart prix > 5%, creer une Anomaly AUTO (cadre acceptance criteria)
  const priceVariance = result.discrepancies.find((d) => d.type === 'PRICE_VARIANCE');
  if (priceVariance) {
    const now = new Date();
    await prisma.anomaly.create({
      data: {
        reference:
          'ANO-' +
          now.getFullYear() +
          '-' +
          String(now.getMonth() + 1).padStart(2, '0') +
          '-' +
          crypto.randomUUID().slice(0, 8).toUpperCase(),
        type: AnomalyType.ABNORMAL_PRICE,
        severity: AnomalySeverity.HIGH,
        entityId: invoice.entityId,
        invoiceId: invoice.id,
        supplierId: invoice.supplierId,
        title:
          'Ecart prix anormal sur facture ' +
          invoice.reference +
          ' : ligne ' +
          priceVariance.position,
        description: priceVariance.message,
        detectionRule: 'PRICE_VARIANCE/3-way-match',
        evidence: JSON.parse(
          JSON.stringify({ discrepancy: priceVariance, allDiscrepancies: result.discrepancies }),
        ),
      },
    });

    await appendAudit({
      entityType: 'Invoice',
      entityId: invoice.id,
      action: AuditAction.ANOMALY_DETECTED,
      actorId: null,
      payload: {
        type: AnomalyType.ABNORMAL_PRICE,
        variancePercent: priceVariance.variancePercent,
      },
      ip,
      userAgent,
    }).catch(() => undefined);
  }

  revalidatePath('/invoices/' + invoice.id);
  return { ok: true, matchOk: result.ok };
}

// =============================================================================
// APPROVE / DISPUTE
// =============================================================================

export async function approveInvoice(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.DAF_PAYS,
      RoleCode.FINANCE_FIL_N2,
      RoleCode.FINANCE_GROUPE,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'ID manquant' };

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      status: true,
      receptionId: true,
      reception: { select: { status: true } },
    },
  });
  if (!invoice) return { ok: false, error: 'Facture introuvable' };

  // Garde §4.1 : sans PV definitif, pas d'approbation pour paiement
  if (!invoice.reception || invoice.reception.status !== 'DEFINITIVE') {
    return {
      ok: false,
      error: 'PV de reception DEFINITIVE requis avant approbation paiement (cadre §4.1).',
    };
  }

  if (
    invoice.status !== InvoiceStatus.CONTROL_3WAY_OK &&
    invoice.status !== InvoiceStatus.RECEIVED
  ) {
    return {
      ok: false,
      error:
        'Statut invalide pour approbation : ' +
        invoice.status +
        ". Faites tourner le 3-way match d'abord.",
    };
  }

  await prisma.invoice.update({
    where: { id },
    data: { status: InvoiceStatus.APPROVED },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Invoice',
    entityId: id,
    action: AuditAction.INVOICE_APPROVED,
    actorId: session.user.id,
    payload: { reference: invoice.reference },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/invoices/' + id);
  return { ok: true };
}

const disputeSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(5).max(1000),
});

export async function disputeInvoice(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Auth requise' };

  const memberships = await getUserMemberships(session.user.id);
  try {
    requireAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.DAF_PAYS,
      RoleCode.AP_OFFICER,
      RoleCode.FINANCE_FIL_N1,
    ]);
  } catch {
    return { ok: false, error: 'Privilege insuffisant' };
  }

  const parsed = disputeSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

  const invoice = await prisma.invoice.update({
    where: { id: parsed.data.id },
    data: { status: InvoiceStatus.DISPUTED, disputeReason: parsed.data.reason },
  });

  const { ip, userAgent } = await getRequestActorContext();
  await appendAudit({
    entityType: 'Invoice',
    entityId: parsed.data.id,
    action: AuditAction.INVOICE_DISPUTED,
    actorId: session.user.id,
    payload: { reference: invoice.reference, reason: parsed.data.reason },
    ip,
    userAgent,
  }).catch(() => undefined);

  revalidatePath('/invoices/' + parsed.data.id);
  return { ok: true };
}
